/**
 * /api/cron/pm-confirm — runs at 7am, 3 hours before automation
 *
 * For each PM with a phone number and alerts enabled:
 *   1. Find their tenants with balance_due > 0 OR rent due today
 *   2. Send one batched SMS asking which tenants have paid
 *   3. Store the confirmation list so the webhook can match replies
 *
 * PM replies YES/NO (single tenant) or PAID 1,2 / NONE (multiple).
 * Webhook at /api/webhooks/sms handles the reply and marks tenants paid.
 * Automation cron runs at 10am — by then paid tenants have balance_due=0
 * so no false-positive SMS fires.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import twilio from "twilio"
import { normalizePhone } from "@/lib/phone"

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!

function daysUntilDueDate(dueDayOfMonth: number): number {
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDayOfMonth)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, dueDayOfMonth)
  const target = thisMonth > now ? thisMonth : nextMonth
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, user_id, name, unit, balance_due, rent_amount, rent_due_day")
    .eq("status", "active")

  if (error || !tenants) {
    return NextResponse.json({ error: "Failed to fetch tenants" }, { status: 500 })
  }

  const userIds = [...new Set(tenants.map((t: { user_id: string }) => t.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, pm_phone, pm_alerts_enabled")
    .in("id", userIds)

  const today = new Date().toISOString().split("T")[0]
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const results = { confirmations_sent: 0, skipped_no_phone: 0, skipped_nothing_to_confirm: 0, skipped_already_sent: 0, errors: 0 }

  for (const profile of profiles ?? []) {
    if (!profile.pm_alerts_enabled || !profile.pm_phone) {
      results.skipped_no_phone++
      continue
    }

    const pmPhone = normalizePhone(profile.pm_phone)
    if (!pmPhone) { results.skipped_no_phone++; continue }

    // Tenants for this PM that need confirmation:
    // - balance_due > 0 (possibly already paid but CSV not updated)
    // - OR rent due today/tomorrow (heads up)
    const pmTenants = tenants.filter((t: { user_id: string }) => t.user_id === profile.id)
    const needsConfirm = pmTenants.filter((t: { balance_due: number; rent_due_day: number }) => {
      const hasBalance = (t.balance_due ?? 0) > 0
      const dueSoon = daysUntilDueDate(t.rent_due_day ?? 1) <= 1
      return hasBalance || dueSoon
    })

    if (needsConfirm.length === 0) { results.skipped_nothing_to_confirm++; continue }

    // Dedup — only one confirmation per PM per day
    const { data: alreadySent } = await supabase
      .from("interventions")
      .select("id")
      .eq("user_id", profile.id)
      .eq("type", "pm_confirmation_sent")
      .gte("sent_at", todayStart.toISOString())
      .limit(1)

    if (alreadySent && alreadySent.length > 0) { results.skipped_already_sent++; continue }

    // Build the confirmation list with numeric codes
    const confirmations = needsConfirm.map((t: { id: string; name: string; unit: string; rent_amount: number; balance_due: number }, i: number) => ({
      code: i + 1,
      tenant_id: t.id,
      name: t.name,
      unit: t.unit ?? null,
      amount: t.rent_amount ?? 0,
    }))

    // Build SMS body
    let smsBody: string
    if (confirmations.length === 1) {
      const t = confirmations[0]
      const unitStr = t.unit ? ` (Unit ${t.unit})` : ""
      smsBody = `RentSentry: Has ${t.name}${unitStr} paid $${t.amount.toLocaleString()} this month? Reply YES or NO.`
    } else {
      const lines = confirmations.map((t: { code: number; name: string; amount: number }) => `${t.code}. ${t.name} $${t.amount.toLocaleString()}`).join("\n")
      smsBody = `RentSentry: Please confirm payments received:\n${lines}\nReply PAID followed by numbers (e.g. PAID 1,2) or ALL or NONE.`
    }

    try {
      await twilioClient.messages.create({ from: FROM_NUMBER, to: pmPhone, body: smsBody })

      await supabase.from("interventions").insert({
        user_id: profile.id,
        tenant_id: null,
        type: "pm_confirmation_sent",
        status: "pending",
        sent_at: new Date().toISOString(),
        notes: `Confirmation sent for ${confirmations.length} tenant(s)`,
        snapshot: { confirmations, date: today },
      })

      results.confirmations_sent++
    } catch {
      results.errors++
    }
  }

  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), results })
}
