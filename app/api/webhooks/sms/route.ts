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

  // Find the most recent pending confirmation for this PM (within last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: confirmations } = await supabase
    .from("interventions")
    .select("id, snapshot")
    .eq("user_id", profile.id)
    .eq("type", "pm_confirmation_sent")
    .eq("status", "pending")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)

  if (!confirmations || confirmations.length === 0) {
    return twiml("No pending confirmation found. Log into RentSentry to update tenant records.")
  }

  const confirmation = confirmations[0]
  const tenantList: { code: number; tenant_id: string; name: string; amount: number }[] =
    confirmation.snapshot?.confirmations ?? []

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
