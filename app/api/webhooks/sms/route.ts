/**
 * /api/webhooks/sms — Twilio incoming SMS webhook
 *
 * Called when a PM replies to a RentSentry confirmation SMS.
 * Parses their reply, marks the right tenants as paid, and
 * replies with a confirmation so they know it worked.
 *
 * Supported reply formats:
 *   Single tenant:  YES / NO
 *   Multi tenant:   PAID 1 / PAID 1,2 / PAID 1 2 / ALL / NONE
 *   Shorthand:      1 / 1,2 (treated as PAID)
 *
 * Security: only processes messages from phone numbers that
 * match a known PM in the profiles table.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizePhone } from "@/lib/phone"
import OpenAI from "openai"
import Stripe from "stripe"
import { Resend } from "resend"
import { FEE_RATE } from "@/lib/payment-config"
import { profileToEscalationRules } from "@/lib/escalation-rules"

const resend = new Resend(process.env.RESEND_API_KEY)

const openai = new OpenAI()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

function calcDaysPastDue(lastPaymentDate: string | null, rentDueDay = 1): number {
  if (!lastPaymentDate) return 0
  const last = new Date(lastPaymentDate)
  const now = new Date()
  const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
  let due = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (due > now) due = new Date(now.getFullYear(), now.getMonth() - 1, dueDay)
  return last < due ? Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0
}

function nextStepLabel(days: number): string {
  if (days >= 30) return "contact your attorney"
  if (days >= 20) return "serve Pay or Quit notice"
  if (days >= 10) return "review CFK vs eviction"
  if (days >= 5)  return "offer a payment plan"
  return "send a reminder"
}

function twiml(message: string): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  )
}

function parsePaidCodes(body: string, totalCount: number): number[] | "all" | "none" {
  const upper = body.trim().toUpperCase()

  if (upper === "YES" || upper === "Y" || upper === "ALL") return "all"
  if (upper === "NO" || upper === "N" || upper === "NONE") return "none"

  // Strip PAID prefix if present
  const stripped = upper.replace(/^PAID\s*/i, "").trim()

  // Extract all numbers
  const codes = stripped.split(/[\s,]+/).map(Number).filter(n => !isNaN(n) && n >= 1 && n <= totalCount)
  if (codes.length > 0) return codes

  return "none"
}

const STOP_KEYWORDS  = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"])
const START_KEYWORDS = new Set(["START", "UNSTOP", "YES"])

function emptyTwiml(): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  )
}

// ── Tenant AI chatbot ─────────────────────────────────────────────────────────

interface TenantRow {
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleTenantReply(supabase: any, tenant: TenantRow, messageBody: string): Promise<NextResponse> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Count prior AI exchanges this month
  const { data: priorReplies } = await supabase
    .from("interventions")
    .select("id, snapshot")
    .eq("tenant_id", tenant.id)
    .eq("type", "tenant_ai_reply")
    .gte("sent_at", monthStart)
    .order("sent_at", { ascending: true })

  const priorCount = priorReplies?.length ?? 0
  const isFirstReply = priorCount === 0

  // Fetch PM profile for display name, Stripe, and escalation rules
  const { data: profile } = await supabase
    .from("profiles")
    .select("pm_display_name, stripe_account_id, stripe_charges_enabled, late_fee_day, escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day, cfk_review_day, attorney_review_day, repeat_offender_accelerator_days")
    .eq("id", tenant.user_id)
    .single()

  console.log("sms-webhook profile:", JSON.stringify({ stripe_account_id: profile?.stripe_account_id ?? null, stripe_charges_enabled: profile?.stripe_charges_enabled ?? null }))
  const pmName = profile?.pm_display_name ?? "your property manager"
  const escalationRules = profileToEscalationRules(profile)

  // Fetch latest situation context logged by landlord
  const { data: intakeRows } = await supabase
    .from("interventions")
    .select("notes")
    .eq("tenant_id", tenant.id)
    .eq("type", "situation_intake")
    .order("sent_at", { ascending: false })
    .limit(1)
  const situationNotes = intakeRows?.[0]?.notes ?? null

  // Check if tenant already has an active payment plan
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

  // Build conversation history for context
  const historyMessages: { role: "user" | "assistant"; content: string }[] = []
  for (const r of (priorReplies ?? []).slice(-2)) {
    const snap = r.snapshot as { tenant_message?: string; ai_reply?: string } | null
    if (snap?.tenant_message) historyMessages.push({ role: "user", content: snap.tenant_message })
    if (snap?.ai_reply) historyMessages.push({ role: "assistant", content: snap.ai_reply })
  }

  // Determine if this tenant is past the point where AI should handle them
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

  // send_payment_link needs charges_enabled; send_plan_link only needs the account to exist
  const stripeReady = !!profile?.stripe_account_id && !!profile?.stripe_charges_enabled && !hasPlan && !isPastCfkReview
  const planLinkReady = !!profile?.stripe_account_id && !hasPlan && !isPastCfkReview
  const availableActions = isPastCfkReview
    ? ["none", "escalate_to_pm"]
    : planLinkReady
      ? stripeReady
        ? ["none", "send_payment_link", "send_plan_link", "escalate_to_pm"]
        : ["none", "send_plan_link", "escalate_to_pm"]
      : ["none", "escalate_to_pm"]

  let aiReply = ""
  let aiAction = "none"
  let situationSummary: string | null = null
  let planInstallments = 2
  let planDaysBetween = 14

  try {
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
- Available actions: ${availableActions.join(", ")}
  - send_payment_link: use when tenant wants to pay the FULL balance right now
  - send_plan_link: use when tenant asks about installments, a payment plan, splitting payments, or paying over time — set plan_installments (2 or 3) and plan_days_between (7, 14, or 30). Use 3 installments for balances over $1,500 or struggling tenants. Use 14 days apart unless balance is very small (then 7).
  - escalate_to_pm: use ONLY for disputes, maintenance, or questions you genuinely cannot resolve
  - none: use ONLY for purely informational replies where no payment action is appropriate
- CRITICAL: If you decide to send a payment link or plan link, you MUST set the action field accordingly. NEVER write "I will set up a plan" or "I will send a link" with action "none" — that does nothing. The action field is what triggers the actual link. Your reply text should be short and confirm the link is on its way, e.g. "Here's your payment plan — click the link below to get started."
- If this is exchange 1, your reply MUST begin with: "This is an automated assistant from ${pmName}."
- Keep "reply" under 130 characters — a URL and opt-out line will be appended automatically.
- Never mention eviction, court, legal proceedings, or attorneys — not even implicitly.
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
    aiAction = availableActions.includes(parsed.action) ? (parsed.action as string) : "none"
    // Hard override: at CFK/eviction territory, always escalate regardless of AI pick
    if (isPastCfkReview) aiAction = "escalate_to_pm"
    // Safety net: if AI wrote about a plan/installments but forgot to set the action, fix it
    if (aiAction === "none" && planLinkReady && /plan|installment/i.test(aiReply)) {
      aiAction = "send_plan_link"
    }
    if (typeof parsed.plan_installments === "number") planInstallments = Math.min(3, Math.max(2, parsed.plan_installments))
    if (typeof parsed.plan_days_between === "number") planDaysBetween = Math.min(30, Math.max(7, parsed.plan_days_between))
    situationSummary = typeof parsed.situation_summary === "string" && parsed.situation_summary.trim()
      ? parsed.situation_summary.trim()
      : null
  } catch {
    aiReply = isFirstReply
      ? `This is an automated assistant from ${pmName}. Your balance of $${balance.toLocaleString()} is ${days} day${days !== 1 ? "s" : ""} past due. Reply with any questions.`
      : `Thanks for reaching out. Please contact ${pmName} directly for further assistance.`
    aiAction = "none"
  }

  let actionUrl: string | null = null

  // Execute action
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
        success_url: `${APP_URL}/pay/success`,
        cancel_url: `${APP_URL}/pay/cancelled`,
      })
      if (session.url) {
        actionUrl = session.url
        await supabase.from("interventions").insert({
          tenant_id: tenant.id,
          user_id: tenant.user_id,
          type: "payment_link_sent",
          status: "sent",
          sent_at: now.toISOString(),
          snapshot: { amount: balance, payment_url: session.url, initiated_by: "tenant_chatbot" },
        })
      }
    } catch {
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
    const token = crypto.randomUUID()
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
      console.error("send_plan_link insert error:", insertError.message)
    } else {
      actionUrl = `${APP_URL}/pay/offer/${token}`
      console.log("send_plan_link actionUrl:", actionUrl)
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

  // Notify PM when AI resolves something or flags for their attention
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
          aiAction === "send_plan_link"    ? `${tenantFirst} replied and requested a payment plan. A split-payment offer was sent (2 installments over 14 days). No action needed unless they don't follow through.` :
                                            `${tenantFirst} replied to your outreach with a message that needs your attention: "${messageBody.slice(0, 200)}"`
        await resend.emails.send({
          from: "RentSentry <onboarding@resend.dev>",
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
    } catch { /* don't fail the response if PM email errors */ }
  }

  // Compose final SMS
  const finalMessage = actionUrl
    ? `${aiReply} ${actionUrl}\nReply STOP to opt out.`
    : `${aiReply}\nReply STOP to opt out.`
  console.log("sms-webhook final:", JSON.stringify({ aiAction, actionUrl, msgLen: finalMessage.length }))

  // Log this exchange
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

  // Log AI-extracted situation summary as landlord-visible context
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

  return twiml(finalMessage)
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Twilio sends form-encoded data
  const formData = await req.formData()
  const fromRaw = formData.get("From") as string | null
  const body = formData.get("Body") as string | null

  if (!fromRaw || !body) return twiml("Sorry, something went wrong.")

  const fromPhone = normalizePhone(fromRaw)
  if (!fromPhone) return twiml("Sorry, something went wrong.")

  // ── STOP / START handling (tenant opt-out/opt-in) ─────────────────────────
  const keyword = body.trim().toUpperCase()

  if (STOP_KEYWORDS.has(keyword) || START_KEYWORDS.has(keyword)) {
    const optedOut = STOP_KEYWORDS.has(keyword)
    const lastTen = fromPhone.replace(/\D/g, "").slice(-10)
    const { data: candidates } = await supabase
      .from("tenants")
      .select("id, phone")
      .like("phone", `%${lastTen}`)
    const matchIds = (candidates ?? [])
      .filter(t => normalizePhone(t.phone) === fromPhone)
      .map(t => t.id)
    if (matchIds.length > 0) {
      await supabase.from("tenants").update({ sms_opted_out: optedOut }).in("id", matchIds)
    }
    return emptyTwiml()
  }

  // Check if sender is a tenant — use suffix match to handle any phone format in DB
  const lastTenDigits = fromPhone.replace(/\D/g, "").slice(-10)
  const { data: tenantCandidates } = await supabase
    .from("tenants")
    .select("id, name, unit, user_id, balance_due, rent_amount, last_payment_date, rent_due_day, days_late_avg, late_payment_count, previous_delinquency, phone")
    .like("phone", `%${lastTenDigits}`)
    .eq("status", "active")

  const tenantRow = (tenantCandidates ?? []).find(t => normalizePhone(t.phone) === fromPhone)
    ?? tenantCandidates?.[0]
  if (tenantRow) {
    return handleTenantReply(supabase, tenantRow as TenantRow, body)
  }

  // Find the PM by their phone number
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, pm_phone")
    .not("pm_phone", "is", null)

  const profile = (profiles ?? []).find(
    (p: { pm_phone: string }) => normalizePhone(p.pm_phone) === fromPhone
  )

  if (!profile) {
    // Not a known PM — ignore silently (don't leak info)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    )
  }

  // Find the most recent pending PM prompt of either type (within last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: pendingPrompts } = await supabase
    .from("interventions")
    .select("id, type, snapshot")
    .eq("user_id", profile.id)
    .in("type", ["pm_confirmation_sent", "pm_contact_check_sent", "pm_payment_link_confirm_sent"])
    .eq("status", "pending")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)

  if (!pendingPrompts || pendingPrompts.length === 0) {
    return twiml("No pending confirmation found. Log into RentSentry to update tenant records.")
  }

  const prompt = pendingPrompts[0]

  // ── Handle contact check reply (YES = in contact, NO = not in contact) ───────
  if (prompt.type === "pm_contact_check_sent") {
    const upper = body.trim().toUpperCase()
    const snap = prompt.snapshot as { tenant_id?: string; tenant_name?: string } | null
    const tenantId = snap?.tenant_id ?? null
    const tenantName = snap?.tenant_name ?? "this tenant"

    await supabase.from("interventions")
      .update({ status: "resolved", notes: `PM replied: ${upper === "YES" || upper === "Y" ? "yes, in contact" : "no contact"}` })
      .eq("id", prompt.id)

    if (upper === "YES" || upper === "Y") {
      if (tenantId) {
        await supabase.from("interventions").insert({
          tenant_id: tenantId,
          user_id: profile.id,
          type: "contact_noted",
          status: "sent",
          sent_at: new Date().toISOString(),
          notes: "PM confirmed recent contact via SMS reply",
        })
      }
      return twiml("Got it — contact noted. We'll keep monitoring.")
    } else {
      if (tenantId) {
        await supabase.from("interventions").insert({
          tenant_id: tenantId,
          user_id: profile.id,
          type: "no_contact_confirmed",
          status: "sent",
          sent_at: new Date().toISOString(),
          notes: "PM confirmed: no recent contact with tenant",
        })
      }
      return twiml(`Understood — flagging ${tenantName} for follow-up. Reach out or log it in the app.`)
    }
  }

  // ── Handle payment link confirmation (YES/NO — did tenant pay the link?) ────
  if (prompt.type === "pm_payment_link_confirm_sent") {
    const upper = body.trim().toUpperCase()
    const snap = prompt.snapshot as { tenant_id?: string; tenant_name?: string; amount?: number } | null
    const tenantId = snap?.tenant_id ?? null
    const tenantName = snap?.tenant_name ?? "this tenant"
    const amount = snap?.amount ?? 0

    await supabase.from("interventions")
      .update({ status: "resolved", notes: `PM replied: ${upper === "YES" || upper === "Y" ? "yes, paid" : "not paid"}` })
      .eq("id", prompt.id)

    if (upper === "YES" || upper === "Y") {
      if (tenantId) {
        const today = new Date().toISOString().split("T")[0]
        const { data: tenant } = await supabase.from("tenants").select("balance_due, rent_amount").eq("id", tenantId).single()
        if (tenant) {
          const payAmount = amount || tenant.rent_amount || 0
          const newBalance = Math.max(0, (tenant.balance_due ?? 0) - payAmount)
          await supabase.from("payments").insert({
            tenant_id: tenantId,
            user_id: profile.id,
            amount: payAmount,
            date: today,
            source: "sms_confirm",
            note: "PM confirmed payment link was paid via SMS reply",
          })
          await supabase.from("tenants").update({ balance_due: newBalance, last_payment_date: today }).eq("id", tenantId)
          await supabase.from("interventions").insert({
            tenant_id: tenantId,
            user_id: profile.id,
            type: "pm_payment_confirmed",
            status: "sent",
            sent_at: new Date().toISOString(),
            notes: `PM confirmed payment link was paid — $${payAmount} recorded`,
          })
        }
      }
      return twiml(`Got it — ${tenantName} marked as paid. Record updated.`)
    } else {
      if (tenantId) {
        await supabase.from("interventions").insert({
          tenant_id: tenantId,
          user_id: profile.id,
          type: "pm_payment_link_not_paid",
          status: "sent",
          sent_at: new Date().toISOString(),
          notes: "PM confirmed payment link was not paid via SMS reply",
        })
      }
      return twiml(`Understood — ${tenantName} hasn't paid. Follow up directly or issue a notice.`)
    }
  }

  // ── Handle payment confirmation reply ─────────────────────────────────────
  const confirmation = prompt
  const tenantList: { code: number; tenant_id: string; name: string; amount: number }[] =
    (confirmation.snapshot as { confirmations?: { code: number; tenant_id: string; name: string; amount: number }[] } | null)?.confirmations ?? []

  if (tenantList.length === 0) return twiml("Something went wrong — no tenants found in confirmation.")

  const parsed = parsePaidCodes(body, tenantList.length)

  if (parsed === "none") {
    await supabase.from("interventions")
      .update({ status: "resolved", notes: "PM replied: none paid" })
      .eq("id", confirmation.id)

    // Fetch days past due for each tenant to give next step context
    const tenantIds = tenantList.map(t => t.tenant_id)
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("id, last_payment_date, rent_due_day")
      .in("id", tenantIds)

    const dataById = Object.fromEntries((tenantData ?? []).map(t => [t.id, t]))

    const steps = tenantList.map(t => {
      const td = dataById[t.tenant_id]
      const days = td ? calcDaysPastDue(td.last_payment_date, td.rent_due_day) : 0
      return { name: t.name.split(" ")[0], days, step: nextStepLabel(days) }
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
    if (steps.length === 1) {
      const s = steps[0]
      return twiml(`Got it — ${s.name} hasn't paid (day ${s.days}). Next: ${s.step}. ${appUrl}/dashboard/tenants`)
    }
    const summary = steps.map(s => `${s.name} day ${s.days}: ${s.step}`).join(" | ")
    return twiml(`Got it — none paid. ${summary}. ${appUrl}/dashboard/tenants`)
  }

  const paidTenants = parsed === "all"
    ? tenantList
    : tenantList.filter(t => (parsed as number[]).includes(t.code))

  if (paidTenants.length === 0) return twiml("Couldn't match those numbers. Reply PAID followed by the tenant numbers, or ALL or NONE.")

  const today = new Date().toISOString().split("T")[0]
  const names: string[] = []

  for (const t of paidTenants) {
    try {
      // Fetch current balance
      const { data: tenant } = await supabase
        .from("tenants")
        .select("balance_due, rent_amount")
        .eq("id", t.tenant_id)
        .single()

      if (!tenant) continue

      const payAmount = t.amount || tenant.rent_amount || 0
      const newBalance = Math.max(0, (tenant.balance_due ?? 0) - payAmount)

      // Record the payment
      await supabase.from("payments").insert({
        tenant_id: t.tenant_id,
        user_id: profile.id,
        amount: payAmount,
        date: today,
        source: "sms_confirm",
        note: "PM confirmed via SMS reply",
      })

      // Update tenant record
      await supabase
        .from("tenants")
        .update({ balance_due: newBalance, last_payment_date: today })
        .eq("id", t.tenant_id)

      // Log the confirmation
      await supabase.from("interventions").insert({
        tenant_id: t.tenant_id,
        user_id: profile.id,
        type: "pm_payment_confirmed",
        status: "sent",
        sent_at: new Date().toISOString(),
        notes: "PM confirmed payment via SMS reply",
      })

      names.push(t.name)
    } catch { /* continue with other tenants */ }
  }

  // Mark the original confirmation as resolved
  await supabase
    .from("interventions")
    .update({ status: "resolved", notes: `PM confirmed payment for: ${names.join(", ")}` })
    .eq("id", confirmation.id)

  if (names.length === 0) return twiml("Something went wrong updating records. Please log into RentSentry.")

  const unpaidTenants = tenantList.filter(t => !paidTenants.find(p => p.tenant_id === t.tenant_id))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

  if (unpaidTenants.length === 0) {
    const nameList = names.join(", ")
    const plural = names.length > 1
    return twiml(`Got it! ${nameList} ${plural ? "have" : "has"} been marked as paid. No reminders will fire today.`)
  }

  // Fetch days past due for unpaid tenants
  const { data: unpaidData } = await supabase
    .from("tenants")
    .select("id, last_payment_date, rent_due_day")
    .in("id", unpaidTenants.map(t => t.tenant_id))

  const unpaidById = Object.fromEntries((unpaidData ?? []).map(t => [t.id, t]))
  const unpaidSteps = unpaidTenants.map(t => {
    const td = unpaidById[t.tenant_id]
    const days = td ? calcDaysPastDue(td.last_payment_date, td.rent_due_day) : 0
    return `${t.name.split(" ")[0]} day ${days}: ${nextStepLabel(days)}`
  }).join(" | ")

  const paidList = names.join(", ")
  return twiml(`${paidList} marked paid. Still unpaid — ${unpaidSteps}. ${appUrl}/dashboard/tenants`)
}
