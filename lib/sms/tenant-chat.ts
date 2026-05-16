import { NextResponse } from "next/server"
import OpenAI from "openai"
import Stripe from "stripe"
import { Resend } from "resend"
import { twiml, calcDaysPastDue } from "@/lib/sms/utils"
import { RESEND_FROM } from "@/lib/resend-from"
import { detectIntent } from "@/lib/sms/intent"
import { generateShortCode, createShortLink } from "@/lib/short-link"
import { FEE_RATE } from "@/lib/payment-config"
import { profileToEscalationRules } from "@/lib/escalation-rules"

const openai = new OpenAI()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

export interface TenantRow {
  id: string
  name: string
  unit: string
  user_id: string
  balance_due: number
  rent_amount: number
  last_payment_date: string | null
  rent_due_day: number
  days_late_avg: number
  late_payment_count: number
  previous_delinquency: boolean
  stripe_customer_id: string | null
  autopay_monthly: boolean
  rent_reporting_opted_in: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleTenantReply(supabase: any, tenant: TenantRow, messageBody: string): Promise<NextResponse> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // REPORT — tenant opts into credit reporting after receiving a payment offer
  if (messageBody.trim().toUpperCase() === "REPORT") {
    if (!tenant.rent_reporting_opted_in) {
      await supabase.from("tenants").update({ rent_reporting_opted_in: true }).eq("id", tenant.id)
      await supabase.from("interventions").insert({
        tenant_id: tenant.id,
        user_id: tenant.user_id,
        type: "rent_reporting_opted_in",
        status: "sent",
        sent_at: now.toISOString(),
        notes: "Tenant opted into credit reporting via SMS reply",
      })
      await supabase.from("interventions")
        .update({ status: "resolved" })
        .eq("tenant_id", tenant.id)
        .eq("type", "rent_reporting_offer_sent")
        .eq("status", "pending")
    }
    return twiml("Done! Your on-time rent payments will be reported to Experian and Equifax to help build your credit history.")
  }

  const { data: priorReplies } = await supabase
    .from("interventions")
    .select("id, snapshot")
    .eq("tenant_id", tenant.id)
    .eq("type", "tenant_ai_reply")
    .gte("sent_at", monthStart)
    .order("sent_at", { ascending: true })

  const priorCount = priorReplies?.length ?? 0
  const isFirstReply = priorCount === 0

  const { data: profileCore, error: profileCoreError } = await supabase
    .from("profiles")
    .select("pm_display_name, stripe_account_id, pm_phone, pm_alerts_enabled, pm_alert_triggers")
    .eq("id", tenant.user_id)
    .single()
  if (profileCoreError) console.error("sms-webhook profile-core error:", profileCoreError.message)

  const { data: profileEsc, error: profileEscError } = await supabase
    .from("profiles")
    .select("late_fee_day, escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day, cfk_review_day, attorney_review_day, repeat_offender_accelerator_days")
    .eq("id", tenant.user_id)
    .single()
  if (profileEscError) console.error("sms-webhook profile-esc error:", profileEscError.message)

  const profile = profileCore ? { ...profileCore, ...(profileEsc ?? {}) } : null
  const pmName = profile?.pm_display_name ?? "your property manager"
  const escalationRules = profileToEscalationRules(profile)

  const { data: intakeRows } = await supabase
    .from("interventions")
    .select("notes")
    .eq("tenant_id", tenant.id)
    .eq("type", "situation_intake")
    .order("sent_at", { ascending: false })
    .limit(1)
  const situationNotes = intakeRows?.[0]?.notes ?? null

  const { data: activePlan } = await supabase
    .from("interventions")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("type", "payment_plan_agreed")
    .gte("sent_at", monthStart)
    .limit(1)
  const hasPlan = (activePlan?.length ?? 0) > 0

  const days = calcDaysPastDue(tenant.last_payment_date, tenant.rent_due_day ?? 1)
  const balance = (tenant.balance_due ?? 0) > 0 ? tenant.balance_due : tenant.rent_amount

  const historyMessages: { role: "user" | "assistant"; content: string }[] = []
  for (const r of (priorReplies ?? []).slice(-2)) {
    const snap = r.snapshot as { tenant_message?: string; ai_reply?: string } | null
    if (snap?.tenant_message) historyMessages.push({ role: "user", content: snap.tenant_message })
    if (snap?.ai_reply) historyMessages.push({ role: "assistant", content: snap.ai_reply })
  }

  const isPastCfkReview = days >= escalationRules.cfkReviewDay
  const isStruggling = (tenant.late_payment_count ?? 0) >= 2 || (tenant.days_late_avg ?? 0) >= 5 || tenant.previous_delinquency

  const contextLines = [
    `Tenant: ${tenant.name.split(" ")[0]}, Unit ${tenant.unit}`,
    `Balance due: $${(balance).toLocaleString()}`,
    `Days past due: ${days}`,
    `Exchange: ${priorCount + 1}${isFirstReply ? " — MUST disclose automated assistant in reply" : ""}`,
  ]
  if ((tenant.late_payment_count ?? 0) > 0) contextLines.push(`Late payments on record: ${tenant.late_payment_count}`)
  if ((tenant.days_late_avg ?? 0) > 3) contextLines.push(`Typically pays ${Math.round(tenant.days_late_avg!)} days late on average`)
  if (tenant.previous_delinquency) contextLines.push(`Has a prior delinquency history`)
  if (isStruggling) contextLines.push(`This tenant is flagged as high-risk`)
  if (situationNotes) contextLines.push(`Landlord notes: ${situationNotes}`)
  if (hasPlan) contextLines.push("Tenant already has an active payment plan — do NOT offer another one.")
  if (isPastCfkReview) contextLines.push(`IMPORTANT: This tenant is ${days} days past due — at cash-for-keys / eviction review territory. Do NOT offer payment links or plans. Acknowledge their message warmly and let them know their property manager will be in touch shortly.`)

  const stripeReady = !!profile?.stripe_account_id && !hasPlan && !isPastCfkReview
  const autopayEligible = !!profile?.stripe_account_id && !tenant.autopay_monthly && !isPastCfkReview
  const availableActions = isPastCfkReview
    ? ["none", "escalate_to_pm"]
    : stripeReady
      ? ["none", "send_payment_link", "send_plan_link", ...(autopayEligible ? ["setup_autopay"] : []), "escalate_to_pm"]
      : autopayEligible
        ? ["none", "setup_autopay", "escalate_to_pm"]
        : ["none", "escalate_to_pm"]

  const rawIntent = detectIntent(messageBody)
  const forcedAction = rawIntent && availableActions.includes(rawIntent) ? rawIntent : null

  let aiReply = ""
  let aiAction = "none"
  let situationSummary: string | null = null
  let planInstallments = balance > 1500 || isStruggling ? 3 : 2
  let planDaysBetween = balance > 800 ? 14 : 7

  try {
    const actionNote = forcedAction
      ? `Action pre-selected by system: ${forcedAction}. Write a reply appropriate for this action. Do NOT choose a different action.`
      : `Available actions: ${availableActions.join(", ")}
  - send_payment_link: tenant wants to pay the FULL balance right now
  - send_plan_link: tenant needs to split the balance into installments — set plan_installments (2 or 3) and plan_days_between (7, 14, or 30)
  - escalate_to_pm: disputes, maintenance, or issues you cannot resolve
  - none: purely informational reply only`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a helpful AI assistant responding on behalf of ${pmName} to a tenant's SMS about rent.

Context:
${contextLines.join("\n")}

Rules:
- Be empathetic, professional, and direct. Never threatening or condescending.
- ${actionNote}
- If this is exchange 1, your reply MUST begin with: "This is an automated assistant from ${pmName}."
- Keep "reply" under 130 characters — a URL and opt-out line will be appended automatically.
- For send_payment_link or send_plan_link replies, keep it brief: confirm a link is coming. Do not describe future actions without taking them.
- Never mention eviction, court, legal proceedings, or attorneys — not even implicitly.
- Detect the language the tenant used and respond in that same language.
- If the tenant shares useful context (job loss, medical, travel, etc.), capture it in situation_summary (under 100 chars).
- Respond with JSON only: { "reply": "...", "action": "...", "plan_installments": 2, "plan_days_between": 14, "situation_summary": "..." }`,
        },
        ...historyMessages,
        { role: "user", content: messageBody },
      ],
    })

    const raw = response.choices[0]?.message?.content ?? "{}"
    const parsed = JSON.parse(raw)
    aiReply = (parsed.reply ?? "").trim()

    if (forcedAction) {
      aiAction = forcedAction
    } else {
      aiAction = availableActions.includes(parsed.action) ? (parsed.action as string) : "none"
    }

    if (isPastCfkReview) aiAction = "escalate_to_pm"
    if (aiAction === "none" && stripeReady && /plan|installment/i.test(aiReply)) aiAction = "send_plan_link"

    if (typeof parsed.plan_installments === "number") planInstallments = Math.min(3, Math.max(2, parsed.plan_installments))
    if (typeof parsed.plan_days_between === "number") planDaysBetween = Math.min(30, Math.max(7, parsed.plan_days_between))
    situationSummary = typeof parsed.situation_summary === "string" && parsed.situation_summary.trim()
      ? parsed.situation_summary.trim()
      : null
  } catch (e) {
    console.error("sms-webhook AI error:", e)
    aiReply = isFirstReply
      ? `This is an automated assistant from ${pmName}. Your balance of $${balance.toLocaleString()} is ${days} day${days !== 1 ? "s" : ""} past due. Reply with any questions.`
      : `Thanks for reaching out. Please contact ${pmName} directly for further assistance.`
    aiAction = "none"
  }

  let actionUrl: string | null = null

  if (aiAction === "send_payment_link" && profile?.stripe_account_id) {
    try {
      const amountCents = Math.round(balance * 100)
      const feeCents = Math.round(amountCents * FEE_RATE)
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["us_bank_account", "card"],
        payment_method_options: {
          us_bank_account: { financial_connections: { permissions: ["payment_method"] } },
        },
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: `Rent Payment — Unit ${tenant.unit}` },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: "usd",
              product_data: { name: "Payment processing fee" },
              unit_amount: feeCents,
            },
            quantity: 1,
          },
        ],
        metadata: { tenant_id: tenant.id, landlord_id: tenant.user_id, rent_amount_cents: amountCents.toString() },
        payment_intent_data: {
          application_fee_amount: feeCents,
          transfer_data: { destination: profile.stripe_account_id },
        },
        expires_at: Math.floor(Date.now() / 1000) + 6 * 3600, // 6 hours — triggers session.expired webhook if unpaid
        success_url: `${APP_URL}/pay/success`,
        cancel_url: `${APP_URL}/pay/cancelled`,
      })
      if (session.url) {
        actionUrl = await createShortLink(session.url, "payment_link", supabase)
        await supabase.from("interventions").insert({
          tenant_id: tenant.id,
          user_id: tenant.user_id,
          type: "payment_link_sent",
          status: "sent",
          sent_at: now.toISOString(),
          snapshot: { amount: balance, payment_url: session.url, stripe_session_id: session.id, initiated_by: "tenant_chatbot" },
        })
      }
    } catch (e) {
      console.error("sms-webhook payment-link error:", e)
      aiAction = "none"
    }
  }

  if (aiAction === "send_plan_link") {
    const perInstallment = Math.round(balance / planInstallments * 100) / 100
    const installments = Array.from({ length: planInstallments }, (_, i) => ({
      amount: i === planInstallments - 1
        ? Math.round((balance - perInstallment * (planInstallments - 1)) * 100) / 100
        : perInstallment,
      due_date: new Date(now.getTime() + i * planDaysBetween * 86400000).toISOString().split("T")[0],
    }))
    const token = generateShortCode()
    const expiresAt = new Date(now.getTime() + 7 * 86400000).toISOString()

    const { error: insertError } = await supabase.from("interventions").insert({
      tenant_id: tenant.id,
      user_id: tenant.user_id,
      type: "pre_due_installment_offer",
      status: "pending",
      sent_at: now.toISOString(),
      snapshot: {
        offer_token: token,
        installments,
        rent_amount: balance,
        expires_at: expiresAt,
        initiated_by: "tenant_chatbot",
      },
    })
    if (insertError) {
      console.error("sms-webhook send-plan-link insert error:", insertError.message)
    } else {
      actionUrl = `${APP_URL}/pay/offer/${token}`
    }
  }

  if (aiAction === "setup_autopay" && profile?.stripe_account_id) {
    try {
      let customerId = tenant.stripe_customer_id
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: tenant.name,
          metadata: { tenant_id: tenant.id, landlord_id: tenant.user_id },
        })
        customerId = customer.id
        await supabase.from("tenants").update({ stripe_customer_id: customerId }).eq("id", tenant.id)
      }
      const session = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: customerId,
        payment_method_types: ["us_bank_account", "card"],
        payment_method_options: {
          us_bank_account: { financial_connections: { permissions: ["payment_method"] } },
        },
        metadata: { tenant_id: tenant.id, landlord_id: tenant.user_id, autopay_type: "monthly" },
        success_url: `${APP_URL}/pay/autopay-confirmed`,
        cancel_url: `${APP_URL}/pay/cancelled`,
      })
      if (session.url) actionUrl = await createShortLink(session.url, "autopay_setup", supabase)
    } catch (e) {
      console.error("sms-webhook setup-autopay error:", e)
      aiAction = "none"
    }
  }

  if (aiAction === "escalate_to_pm") {
    await supabase.from("interventions").insert({
      tenant_id: tenant.id,
      user_id: tenant.user_id,
      type: "tenant_escalation_request",
      status: "pending",
      sent_at: now.toISOString(),
      notes: `Tenant requested PM contact via SMS: "${messageBody.slice(0, 200)}"`,
    })
  }

  if (aiAction === "send_payment_link" || aiAction === "send_plan_link" || aiAction === "escalate_to_pm") {
    try {
      const { data: pmAuth } = await supabase.auth.admin.getUserById(tenant.user_id)
      const pmEmail = pmAuth?.user?.email
      if (pmEmail) {
        const tenantFirst = tenant.name.split(" ")[0]
        const subject =
          aiAction === "send_payment_link" ? `${tenant.name} requested a payment link via SMS` :
          aiAction === "send_plan_link"    ? `${tenant.name} requested a payment plan via SMS` :
                                            `${tenant.name} needs your attention — SMS reply`
        const detail =
          aiAction === "send_payment_link" ? `${tenantFirst} replied to your automated outreach and requested a payment link for $${balance.toLocaleString()}. The link was sent — no action needed unless payment isn't received.` :
          aiAction === "send_plan_link"    ? `${tenantFirst} replied and requested a payment plan. A split-payment offer was sent (${planInstallments} installments over ${planDaysBetween} days). No action needed unless they don't follow through.` :
                                            `${tenantFirst} replied to your outreach with a message that needs your attention: "${messageBody.slice(0, 200)}"`
        await resend.emails.send({
          from: RESEND_FROM,
          to: pmEmail,
          subject,
          html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:36px 28px;background:#0a0e1a;color:#f0f1f3;border-radius:14px;">
            <p style="font-size:12px;color:#4b5563;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">RentSentry · Tenant SMS Reply</p>
            <h2 style="margin:0 0 10px;font-size:18px;">${subject}</h2>
            <p style="color:#9ca3af;font-size:14px;line-height:1.6;margin:0 0 20px;">${detail}</p>
            <a href="${APP_URL}/dashboard/tenants/${tenant.id}" style="display:inline-block;background:#60a5fa;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">View ${tenantFirst}'s Record →</a>
          </div>`,
        })
      }
    } catch (e) {
      console.error("sms-webhook pm-email error:", e)
    }
  }

  const finalMessage = actionUrl
    ? `${aiReply} ${actionUrl}\nReply STOP to opt out.`
    : `${aiReply}\nReply STOP to opt out.`

  await supabase.from("interventions").insert({
    tenant_id: tenant.id,
    user_id: tenant.user_id,
    type: "tenant_ai_reply",
    status: "sent",
    sent_at: now.toISOString(),
    notes: aiReply,
    snapshot: {
      tenant_message: messageBody,
      ai_reply: aiReply,
      action: aiAction,
      action_url: actionUrl,
      exchange_number: priorCount + 1,
    },
  })

  if (situationSummary) {
    await supabase.from("interventions").insert({
      tenant_id: tenant.id,
      user_id: tenant.user_id,
      type: "situation_intake",
      status: "sent",
      sent_at: now.toISOString(),
      notes: `[AI-extracted from tenant reply] ${situationSummary}`,
    })
  }

  // PM SMS alert on tenant reply
  const pmTriggers: string[] = Array.isArray(profileCore?.pm_alert_triggers)
    ? profileCore.pm_alert_triggers
    : ["pay_or_quit", "legal", "installment_missed", "autopay_declined", "tenant_response", "plan_sent"]
  if (profileCore?.pm_alerts_enabled && pmTriggers.includes("tenant_response") && profileCore?.pm_phone) {
    const { normalizePhone } = await import("@/lib/phone")
    const pmPhone = normalizePhone(profileCore.pm_phone)
    if (pmPhone) {
      // Dedup: don't spam PM if tenant sends multiple messages in quick succession (1h window)
      const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
      const { data: recentAlert } = await supabase
        .from("interventions")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("type", "pm_alert_tenant_reply")
        .gte("sent_at", oneHourAgo)
        .limit(1)
      if ((recentAlert?.length ?? 0) === 0) {
        try {
          const twilio = (await import("twilio")).default
          const tw = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
          const truncated = messageBody.length > 80 ? messageBody.slice(0, 80) + "…" : messageBody
          await tw.messages.create({
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: pmPhone,
            body: `RentSentry: ${tenant.name} (Unit ${tenant.unit}) replied — "${truncated}". View: ${APP_URL}/dashboard/tenants/${tenant.id}`,
          })
          await supabase.from("interventions").insert({
            tenant_id: tenant.id,
            user_id: tenant.user_id,
            type: "pm_alert_tenant_reply",
            status: "sent",
            sent_at: now.toISOString(),
            notes: `PM alerted of tenant reply: "${messageBody.slice(0, 200)}"`,
          })
        } catch (e) { console.error("tenant-chat: PM reply alert SMS failed:", e) }
      }
    }
  }

  return twiml(finalMessage)
}
