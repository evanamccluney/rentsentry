import Stripe from "stripe"
import { NextResponse } from "next/server"
import { normalizePhone } from "@/lib/phone"
import { sendTenantSms } from "@/lib/sms"
import { createShortLink, generateShortCode } from "@/lib/short-link"
import { FEE_RATE } from "@/lib/payment-config"
import { twiml, parsePaidCodes, calcDaysPastDue, nextStepLabel } from "@/lib/sms/utils"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

interface PmPrompt {
  id: string
  type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot: any
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handlePmReply(supabase: any, profileId: string, prompt: PmPrompt, body: string): Promise<NextResponse> {
  const appUrl = APP_URL

  // ── Urgent alert quick-reply: LINK · PLAN · SNOOZE ───────────────────────
  if (prompt.type === "pm_action_prompt_sent") {
    const upper = body.trim().toUpperCase()
    const snap = prompt.snapshot as { tenant_id?: string; tenant_name?: string; balance_due?: number; unit?: string } | null
    const tenantId = snap?.tenant_id ?? null
    const tenantName = snap?.tenant_name ?? "this tenant"

    // SNOOZE — pause all phase2 alerts for 7 days
    if (upper === "SNOOZE") {
      if (tenantId) {
        const snoozeUntil = new Date(Date.now() + 7 * 86400000).toISOString()
        await supabase.from("tenants").update({ snoozed_until: snoozeUntil }).eq("id", tenantId)
        await supabase.from("interventions").insert({
          tenant_id: tenantId,
          user_id: profileId,
          type: "pm_alert_snoozed",
          status: "sent",
          sent_at: new Date().toISOString(),
          notes: `PM snoozed alerts until ${new Date(snoozeUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        })
      }
      await supabase.from("interventions").update({ status: "resolved" }).eq("id", prompt.id)
      return twiml(`Got it — alerts for ${tenantName} paused for 7 days. Unsooze anytime in the app.`)
    }

    // LINK — send payment link to tenant
    if (upper === "LINK") {
      if (!tenantId) return twiml("Couldn't find the tenant — check the dashboard.")
      try {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("id, name, unit, user_id, balance_due, rent_amount, phone, sms_opted_out")
          .eq("id", tenantId)
          .single()
        if (!tenant) return twiml("Tenant not found — check the dashboard.")
        if (!tenant.phone || tenant.sms_opted_out) return twiml("Tenant has no phone on file or has opted out.")
        const phone = normalizePhone(tenant.phone)
        if (!phone) return twiml("Invalid tenant phone number.")

        const { data: profile } = await supabase.from("profiles").select("stripe_account_id").eq("id", profileId).single()
        if (!profile?.stripe_account_id) return twiml("Stripe isn't connected — link your account in Settings first.")

        const balance = (tenant.balance_due ?? 0) > 0 ? tenant.balance_due : tenant.rent_amount
        const amountCents = Math.round(balance * 100)
        const feeCents = Math.round(amountCents * FEE_RATE)

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["us_bank_account", "card"],
          payment_method_options: { us_bank_account: { financial_connections: { permissions: ["payment_method"] } } },
          line_items: [
            { price_data: { currency: "usd", product_data: { name: `Rent Payment — Unit ${tenant.unit}` }, unit_amount: amountCents }, quantity: 1 },
            { price_data: { currency: "usd", product_data: { name: "Payment processing fee" }, unit_amount: feeCents }, quantity: 1 },
          ],
          metadata: { tenant_id: tenant.id, landlord_id: profileId, rent_amount_cents: amountCents.toString() },
          payment_intent_data: { application_fee_amount: feeCents, transfer_data: { destination: profile.stripe_account_id } },
          expires_at: Math.floor(Date.now() / 1000) + 6 * 3600,
          success_url: `${APP_URL}/pay/success`,
          cancel_url: `${APP_URL}/pay/cancelled`,
        })

        if (!session.url) throw new Error("No URL in checkout session")
        const shortUrl = await createShortLink(session.url, "payment_link", supabase)
        const firstName = tenant.name.split(" ")[0]
        const sent = await sendTenantSms(supabase, tenant.id, phone,
          `Hi ${firstName}, here's your payment link for $${balance.toLocaleString()}: ${shortUrl}\nReply STOP to opt out.`)

        if (sent) {
          await supabase.from("interventions").insert({
            tenant_id: tenant.id,
            user_id: profileId,
            type: "payment_link_sent",
            status: "sent",
            sent_at: new Date().toISOString(),
            snapshot: { amount: balance, payment_url: session.url, stripe_session_id: session.id, initiated_by: "pm_sms_action" },
          })
          await supabase.from("interventions").update({ status: "resolved" }).eq("id", prompt.id)
          return twiml(`Payment link sent to ${tenantName} for $${balance.toLocaleString()}.`)
        }
        return twiml("Couldn't send the SMS — check the tenant's phone number in the dashboard.")
      } catch (e) {
        console.error(`pm-handlers LINK action failed — tenant ${tenantId}:`, e)
        return twiml("Something went wrong creating the link. Try from the dashboard.")
      }
    }

    // PLAN — send installment plan offer to tenant
    if (upper === "PLAN") {
      if (!tenantId) return twiml("Couldn't find the tenant — check the dashboard.")
      try {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("id, name, unit, balance_due, rent_amount, phone, sms_opted_out")
          .eq("id", tenantId)
          .single()
        if (!tenant) return twiml("Tenant not found — check the dashboard.")
        if (!tenant.phone || tenant.sms_opted_out) return twiml("Tenant has no phone on file or has opted out.")
        const phone = normalizePhone(tenant.phone)
        if (!phone) return twiml("Invalid tenant phone number.")

        const balance = (tenant.balance_due ?? 0) > 0 ? tenant.balance_due : tenant.rent_amount
        const planInstallments = balance > 1500 ? 3 : 2
        const planDaysBetween = 14
        const perInstallment = Math.round(balance / planInstallments * 100) / 100
        const now = new Date()
        const installments = Array.from({ length: planInstallments }, (_, i) => ({
          amount: i === planInstallments - 1
            ? Math.round((balance - perInstallment * (planInstallments - 1)) * 100) / 100
            : perInstallment,
          due_date: new Date(now.getTime() + i * planDaysBetween * 86400000).toISOString().split("T")[0],
        }))
        const token = generateShortCode()
        const expiresAt = new Date(now.getTime() + 7 * 86400000).toISOString()

        await supabase.from("interventions").insert({
          tenant_id: tenant.id,
          user_id: profileId,
          type: "pre_due_installment_offer",
          status: "pending",
          sent_at: now.toISOString(),
          snapshot: { offer_token: token, installments, rent_amount: balance, expires_at: expiresAt, initiated_by: "pm_sms_action" },
        })

        const offerUrl = `${APP_URL}/pay/offer/${token}`
        const firstName = tenant.name.split(" ")[0]
        const sent = await sendTenantSms(supabase, tenant.id, phone,
          `Hi ${firstName}, your property manager is offering a payment plan — ${planInstallments} installments of ~$${perInstallment.toLocaleString()} every ${planDaysBetween} days. Accept here: ${offerUrl}\nReply STOP to opt out.`)

        if (sent) {
          await supabase.from("interventions").update({ status: "resolved" }).eq("id", prompt.id)
          return twiml(`Plan offer sent to ${tenantName} (${planInstallments}x ~$${perInstallment.toLocaleString()}).`)
        }
        return twiml("Couldn't send the SMS — check the tenant's phone number in the dashboard.")
      } catch (e) {
        console.error(`pm-handlers PLAN action failed — tenant ${tenantId}:`, e)
        return twiml("Something went wrong creating the plan offer. Try from the dashboard.")
      }
    }

    return twiml("Reply LINK to send a payment link, PLAN to send a plan offer, or SNOOZE to pause alerts for 7 days.")
  }

  // ── Contact check reply ───────────────────────────────────────────────────
  if (prompt.type === "pm_contact_check_sent") {
    const upper = body.trim().toUpperCase()
    const snap = prompt.snapshot as { tenant_id?: string; tenant_name?: string } | null
    const tenantId = snap?.tenant_id ?? null
    const tenantName = snap?.tenant_name ?? "this tenant"

    if (upper === "SNOOZE") {
      if (tenantId) {
        const snoozeUntil = new Date(Date.now() + 7 * 86400000).toISOString()
        await supabase.from("tenants").update({ snoozed_until: snoozeUntil }).eq("id", tenantId)
        await supabase.from("interventions").insert({
          tenant_id: tenantId,
          user_id: profileId,
          type: "pm_alert_snoozed",
          status: "sent",
          sent_at: new Date().toISOString(),
          notes: `PM snoozed alerts via contact-check reply until ${new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        })
      }
      await supabase.from("interventions").update({ status: "resolved" }).eq("id", prompt.id)
      return twiml(`Got it — alerts for ${tenantName} paused for 7 days.`)
    }

    await supabase.from("interventions")
      .update({ status: "resolved", notes: `PM replied: ${upper === "YES" || upper === "Y" ? "yes, in contact" : "no contact"}` })
      .eq("id", prompt.id)

    if (upper === "YES" || upper === "Y") {
      if (tenantId) {
        await supabase.from("interventions").insert({
          tenant_id: tenantId,
          user_id: profileId,
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
          user_id: profileId,
          type: "no_contact_confirmed",
          status: "sent",
          sent_at: new Date().toISOString(),
          notes: "PM confirmed: no recent contact with tenant",
        })
      }
      return twiml(`Understood — flagging ${tenantName} for follow-up. Reach out or log it in the app.`)
    }
  }

  // ── Payment link confirmation reply ──────────────────────────────────────
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
            user_id: profileId,
            amount: payAmount,
            date: today,
            source: "sms_confirm",
            note: "PM confirmed payment link was paid via SMS reply",
          })
          await supabase.from("tenants").update({ balance_due: newBalance, last_payment_date: today }).eq("id", tenantId)
          await supabase.from("interventions").insert({
            tenant_id: tenantId,
            user_id: profileId,
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
          user_id: profileId,
          type: "pm_payment_link_not_paid",
          status: "sent",
          sent_at: new Date().toISOString(),
          notes: "PM confirmed payment link was not paid via SMS reply",
        })
      }
      return twiml(`Understood — ${tenantName} hasn't paid. Follow up directly or issue a notice.`)
    }
  }

  // ── Payment confirmation reply (PAID 1, ALL, NONE, etc.) ─────────────────
  const tenantList: { code: number; tenant_id: string; name: string; amount: number }[] =
    (prompt.snapshot as { confirmations?: { code: number; tenant_id: string; name: string; amount: number }[] } | null)?.confirmations ?? []

  if (tenantList.length === 0) return twiml("Something went wrong — no tenants found in confirmation.")

  const parsed = parsePaidCodes(body, tenantList.length)

  if (parsed === "none") {
    await supabase.from("interventions")
      .update({ status: "resolved", notes: "PM replied: none paid" })
      .eq("id", prompt.id)

    const tenantIds = tenantList.map(t => t.tenant_id)
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("id, last_payment_date, rent_due_day")
      .in("id", tenantIds)

    const dataById = Object.fromEntries((tenantData ?? []).map((t: { id: string; last_payment_date: string | null; rent_due_day: number }) => [t.id, t]))

    const steps = tenantList.map(t => {
      const td = dataById[t.tenant_id]
      const days = td ? calcDaysPastDue(td.last_payment_date, td.rent_due_day) : 0
      return { name: t.name.split(" ")[0], days, step: nextStepLabel(days) }
    })

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
      const { data: tenant } = await supabase
        .from("tenants")
        .select("balance_due, rent_amount")
        .eq("id", t.tenant_id)
        .single()

      if (!tenant) continue

      const payAmount = t.amount || tenant.rent_amount || 0
      const newBalance = Math.max(0, (tenant.balance_due ?? 0) - payAmount)

      await supabase.from("payments").insert({
        tenant_id: t.tenant_id,
        user_id: profileId,
        amount: payAmount,
        date: today,
        source: "sms_confirm",
        note: "PM confirmed via SMS reply",
      })
      await supabase
        .from("tenants")
        .update({ balance_due: newBalance, last_payment_date: today })
        .eq("id", t.tenant_id)
      await supabase.from("interventions").insert({
        tenant_id: t.tenant_id,
        user_id: profileId,
        type: "pm_payment_confirmed",
        status: "sent",
        sent_at: new Date().toISOString(),
        notes: "PM confirmed payment via SMS reply",
      })
      names.push(t.name)
    } catch (e) {
      console.error(`sms-webhook pm-confirm error for tenant ${t.tenant_id}:`, e)
    }
  }

  await supabase
    .from("interventions")
    .update({ status: "resolved", notes: `PM confirmed payment for: ${names.join(", ")}` })
    .eq("id", prompt.id)

  if (names.length === 0) return twiml("Something went wrong updating records. Please log into RentSentry.")

  const unpaidTenants = tenantList.filter(t => !paidTenants.find(p => p.tenant_id === t.tenant_id))

  if (unpaidTenants.length === 0) {
    const nameList = names.join(", ")
    const plural = names.length > 1
    return twiml(`Got it! ${nameList} ${plural ? "have" : "has"} been marked as paid. No reminders will fire today.`)
  }

  const { data: unpaidData } = await supabase
    .from("tenants")
    .select("id, last_payment_date, rent_due_day")
    .in("id", unpaidTenants.map(t => t.tenant_id))

  const unpaidById = Object.fromEntries((unpaidData ?? []).map((t: { id: string; last_payment_date: string | null; rent_due_day: number }) => [t.id, t]))
  const unpaidSteps = unpaidTenants.map(t => {
    const td = unpaidById[t.tenant_id]
    const days = td ? calcDaysPastDue(td.last_payment_date, td.rent_due_day) : 0
    return `${t.name.split(" ")[0]} day ${days}: ${nextStepLabel(days)}`
  }).join(" | ")

  const paidList = names.join(", ")
  return twiml(`${paidList} marked paid. Still unpaid — ${unpaidSteps}. ${appUrl}/dashboard/tenants`)
}
