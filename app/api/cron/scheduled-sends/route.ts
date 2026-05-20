import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import twilio from "twilio"
import { generateShortCode } from "@/lib/short-link"
import { normalizePhone } from "@/lib/phone"

function daysUntilRentDue(rentDueDay: number): number {
  const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
  const nextDue = thisMonth > now ? thisMonth : new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
  return Math.ceil((nextDue.getTime() - now.getTime()) / 86400000)
}

function computeOfferParams(balanceDue: number, rentAmount: number, rentDueDay: number) {
  const dayOfMonth = new Date().getDate()
  const daysUntilDue = daysUntilRentDue(rentDueDay)
  if (dayOfMonth >= 15 && daysUntilDue <= 20 && rentAmount > 0 && balanceDue >= rentAmount * 0.8) {
    return { totalAmount: Math.round((balanceDue + rentAmount) * 100) / 100, maxInstallments: 6, includesNextMonth: true }
  }
  const monthsOwed = rentAmount > 0 ? balanceDue / rentAmount : 1
  const maxInstallments = monthsOwed >= 1.5 ? 4 : monthsOwed >= 1 ? 3 : 2
  return { totalAmount: balanceDue, maxInstallments, includesNextMonth: false }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const querySecret = req.nextUrl.searchParams.get("secret")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && querySecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const now = new Date()
  const tw = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const results = { sms_fired: 0, plans_fired: 0, failed: 0 }

  // ── Fire scheduled SMS messages ────────────────────────────────────────────
  const { data: scheduledSms } = await supabase
    .from("interventions")
    .select("id, tenant_id, user_id, snapshot")
    .eq("type", "scheduled_sms")
    .eq("status", "pending")
    .lte("snapshot->>scheduled_for", now.toISOString())

  for (const item of scheduledSms ?? []) {
    const snap = item.snapshot as { scheduled_for: string; message?: string | null }
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, phone, balance_due, sms_opted_out")
      .eq("id", item.tenant_id)
      .single()

    let fired = false
    if (tenant && !tenant.sms_opted_out && tenant.phone) {
      const phone = normalizePhone(tenant.phone)
      if (phone) {
        const firstName = (tenant.name as string).split(" ")[0]
        const body = snap.message?.trim()
          || (tenant.balance_due > 0
            ? `Hi ${firstName}, you have an outstanding balance of $${Number(tenant.balance_due).toLocaleString()}. Reply to this message to arrange payment. Reply STOP to opt out.`
            : `Hi ${firstName}, just a reminder — your rent payment is coming up. Reply to this message with any questions. Reply STOP to opt out.`)
        try {
          await tw.messages.create({ from: process.env.TWILIO_PHONE_NUMBER!, to: phone, body })
          fired = true
          results.sms_fired++
        } catch (e) { console.error("scheduled-sends: sms failed:", e); results.failed++ }
      }
    }

    await supabase.from("interventions").update({ status: fired ? "sent" : "failed" }).eq("id", item.id)
  }

  // ── Fire scheduled split-pay offers ───────────────────────────────────────
  const { data: scheduledOffers } = await supabase
    .from("interventions")
    .select("id, tenant_id, user_id, snapshot")
    .eq("type", "scheduled_split_pay_offer")
    .eq("status", "pending")
    .lte("snapshot->>scheduled_for", now.toISOString())

  for (const item of scheduledOffers ?? []) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, phone, email, balance_due, rent_amount, rent_due_day, sms_opted_out")
      .eq("id", item.tenant_id)
      .single()

    const { data: profile } = await supabase
      .from("profiles")
      .select("pm_display_name, pm_phone, pm_alerts_enabled, pm_alert_triggers, stripe_account_id")
      .eq("id", item.user_id)
      .single()

    if (!tenant || (tenant.balance_due ?? 0) <= 0) {
      await supabase.from("interventions").update({ status: "failed" }).eq("id", item.id)
      results.failed++
      continue
    }

    const token = generateShortCode()
    const offer = computeOfferParams(tenant.balance_due, tenant.rent_amount ?? 0, tenant.rent_due_day ?? 1)
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()

    await supabase.from("interventions").insert({
      tenant_id: item.tenant_id,
      user_id: item.user_id,
      type: "split_pay_offer",
      status: "sent",
      sent_at: now.toISOString(),
      notes: "Scheduled via AI assistant",
      snapshot: {
        offer_token: token,
        total_amount: offer.totalAmount,
        balance_due: tenant.balance_due,
        rent_amount: tenant.rent_amount ?? 0,
        max_installments: offer.maxInstallments,
        min_installments: 2,
        includes_next_month: offer.includesNextMonth,
        rent_due_day: tenant.rent_due_day ?? 1,
        expires_at: expiresAt,
      },
    })

    const offerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pay/offer/${token}`
    const pmName = profile?.pm_display_name?.trim() || null
    const pmFirst = pmName ? pmName.split(" ")[0] : null
    const from = pmFirst ? `your property manager ${pmFirst}` : "your property manager"
    const firstName = (tenant.name as string).split(" ")[0]
    const smsBody = offer.includesNextMonth
      ? `Hi ${firstName}, ${from} is offering to split your $${offer.totalAmount.toLocaleString()} balance (past due + upcoming rent) into up to ${offer.maxInstallments} payments. Choose your plan: ${offerUrl} Reply STOP to opt out.`
      : `Hi ${firstName}, ${from} is offering to split your $${offer.totalAmount.toLocaleString()} past-due balance into installments. Choose your plan: ${offerUrl} Reply STOP to opt out.`

    let fired = false
    if (!tenant.sms_opted_out && tenant.phone) {
      const phone = normalizePhone(tenant.phone)
      if (phone) {
        try {
          await tw.messages.create({ from: process.env.TWILIO_PHONE_NUMBER!, to: phone, body: smsBody })
          fired = true
          results.plans_fired++
        } catch (e) { console.error("scheduled-sends: split_pay_offer sms failed:", e); results.failed++ }
      }
    }

    // PM alert
    const pmTriggers: string[] = Array.isArray(profile?.pm_alert_triggers)
      ? profile.pm_alert_triggers
      : ["plan_sent"]
    if (profile?.pm_alerts_enabled && pmTriggers.includes("plan_sent") && profile?.pm_phone) {
      const pmPhone = normalizePhone(profile.pm_phone)
      if (pmPhone) {
        try {
          await tw.messages.create({
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: pmPhone,
            body: `RentSentry: Payment plan offer sent to ${firstName} — $${offer.totalAmount.toLocaleString()} in up to ${offer.maxInstallments} installments${offer.includesNextMonth ? " (incl. next month)" : ""}. View: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tenants/${item.tenant_id}`,
          })
        } catch {}
      }
    }

    await supabase.from("interventions").update({ status: fired ? "sent" : "failed" }).eq("id", item.id)
  }

  return NextResponse.json({ ok: true, ran_at: now.toISOString(), results })
}
