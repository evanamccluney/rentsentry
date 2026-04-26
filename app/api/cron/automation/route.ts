/**
 * /api/cron/automation
 *
 * Behavior-based automation loop — works from standard rent roll data only.
 * No payment method metadata required.
 *
 * Rules (evaluated in priority order, each deduplicated independently):
 *
 *   Rule A — Proactive reminder
 *     Trigger: watch or reminder tier + late history (≥2 late payments OR avg ≥3 days)
 *             + within 3 days of rent due date
 *     Type: proactive_reminder
 *     Dedup: skip if sent within 14 days
 *
 *   Rule B — No payment method alert
 *     Trigger: watch tier + no payment method on file + within 7 days of rent due date
 *     Type: payment_method_alert
 *     Dedup: skip if sent within 7 days
 *
 *   Rule C — Card expiry reminder (optional — only fires when card_expiry data exists)
 *     Trigger: card expires within 7 days
 *     Type: card_expiry_alert
 *     Dedup: skip if sent within 7 days
 *
 *   Rule D — Pre-due warning for already-delinquent tenants
 *     Trigger: balance_due > 0 + within 5 days of rent due date
 *     Type: pre_due_delinquent_warning
 *     SMS: warns tenant they have an existing balance AND rent is coming up
 *     Dedup: skip if sent within 14 days
 *
 * Respects per-user Auto Mode (profiles.auto_mode):
 *   ON  → send SMS + log as "sent"
 *   OFF → evaluate only, log as "dry_run"
 *
 * Secure: requires CRON_SECRET header or ?secret= param.
 * Schedule: run daily at 8am via Vercel Cron or cron-job.org.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import twilio from "twilio"
import { scoreTenant } from "@/lib/risk-engine"

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntilDueDate(dueDayOfMonth: number): number {
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDayOfMonth)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, dueDayOfMonth)
  const target = thisMonth > now ? thisMonth : nextMonth
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function cardExpiresWithinDays(expiry: string, days: number): boolean {
  try {
    const [month, year] = expiry.split("/").map(Number)
    if (!month || !year) return false
    const expiryDate = new Date(2000 + year, month - 1, 1)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + days)
    return expiryDate <= cutoff
  } catch { return false }
}

async function recentlySent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  type: string,
  withinDays: number
): Promise<boolean> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from("interventions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .gte("sent_at", since)
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function sendAndLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenant: { id: string; user_id: string; name: string; phone: string | null },
  type: string,
  smsBody: string,
  snapshot: object,
  autoMode: boolean,
  results: { sent: number; dry_run: number; errors: number }
) {
  if (autoMode) {
    try {
      if (tenant.phone) {
        await twilioClient.messages.create({
          from: FROM_NUMBER,
          to: tenant.phone,
          body: smsBody,
        })
      }
      await supabase.from("interventions").insert({
        tenant_id: tenant.id,
        user_id: tenant.user_id,
        type,
        status: "sent",
        sent_at: new Date().toISOString(),
        snapshot,
      })
      results.sent++
    } catch (err: unknown) {
      console.error("SMS send error:", (err as Error)?.message)
      results.errors++
    }
  } else {
    await supabase.from("interventions").insert({
      tenant_id: tenant.id,
      user_id: tenant.user_id,
      type,
      status: "dry_run",
      sent_at: new Date().toISOString(),
      snapshot,
    })
    results.dry_run++
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

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
    .select(`
      id, user_id, name, phone,
      card_expiry, payment_method,
      balance_due, rent_amount, rent_due_day,
      days_late_avg, late_payment_count,
      previous_delinquency, last_payment_date,
      properties(name)
    `)
    .eq("status", "active")

  if (error || !tenants) {
    return NextResponse.json(
      { error: "Failed to fetch tenants", detail: error?.message },
      { status: 500 }
    )
  }

  const userIds = [...new Set(tenants.map((t: { user_id: string }) => t.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, auto_mode, pm_phone, pm_alerts_enabled")
    .in("id", userIds)

  const autoModeByUser = new Map<string, boolean>(
    (profiles ?? []).map((p: { id: string; auto_mode: boolean | null }) => [p.id, p.auto_mode ?? false])
  )

  const results = {
    total_tenants: tenants.length,
    evaluated: 0,
    sent: 0,
    dry_run: 0,
    skipped_dedup: 0,
    skipped_no_trigger: 0,
    errors: 0,
  }

  for (const t of tenants) {
    const dueDayOfMonth: number = t.rent_due_day ?? 1
    const untilDue = daysUntilDueDate(dueDayOfMonth)

    const risk = scoreTenant({
      days_late_avg: t.days_late_avg ?? 0,
      late_payment_count: t.late_payment_count ?? 0,
      previous_delinquency: t.previous_delinquency ?? false,
      card_expiry: t.card_expiry ?? undefined,
      payment_method: t.payment_method ?? undefined,
      balance_due: t.balance_due ?? 0,
      rent_amount: t.rent_amount ?? 0,
      last_payment_date: t.last_payment_date ?? undefined,
      rent_due_day: t.rent_due_day ?? 1,
    })

    const snapshot = {
      tier: risk.tier,
      balance_due: t.balance_due ?? 0,
      rent_amount: t.rent_amount ?? 0,
      days_past_due: risk.days_past_due,
      days_late_avg: t.days_late_avg ?? 0,
      late_payment_count: t.late_payment_count ?? 0,
      previous_delinquency: t.previous_delinquency ?? false,
      card_expiry: t.card_expiry ?? null,
      payment_method: t.payment_method ?? null,
      reasons: risk.reasons,
      recommended_action: risk.recommended_action,
      action_type: risk.action_type,
      late_fee: risk.late_fee,
      requires_attorney: risk.requires_attorney,
      property_name: (t.properties as { name?: string } | null)?.name ?? null,
      scored_at: new Date().toISOString(),
      triggered_by: "system",
    }

    const autoMode = autoModeByUser.get(t.user_id) ?? false
    const hasHistory = (t.late_payment_count ?? 0) >= 2 || (t.days_late_avg ?? 0) >= 3
    const noPaymentMethod = !t.payment_method || t.payment_method === "unknown"
    const hasBalance = (t.balance_due ?? 0) > 0
    let triggered = false

    // ── Rule A: Proactive reminder — behavior-based, no payment metadata needed ──
    // Fires 3 days before rent due date for watch/reminder tenants with late history
    if (
      (risk.tier === "watch" || risk.tier === "reminder") &&
      hasHistory &&
      untilDue <= 3
    ) {
      triggered = true
      results.evaluated++
      const alreadySent = await recentlySent(supabase, t.id, "proactive_reminder", 14)
      if (alreadySent) {
        results.skipped_dedup++
      } else {
        await sendAndLog(
          supabase, t, "proactive_reminder",
          `Hi ${t.name}, rent is due in ${untilDue} day${untilDue === 1 ? "" : "s"}. Based on your payment history, we're reaching out early to give you time to prepare. Contact your property manager with any questions. Reply STOP to opt out.`,
          snapshot, autoMode, results
        )
      }
    }

    // ── Rule B: No payment method alert — 7 days before rent due date ────────────
    if (
      risk.tier === "watch" &&
      noPaymentMethod &&
      untilDue <= 7
    ) {
      triggered = true
      results.evaluated++
      const alreadySent = await recentlySent(supabase, t.id, "payment_method_alert", 7)
      if (alreadySent) {
        results.skipped_dedup++
      } else {
        await sendAndLog(
          supabase, t, "payment_method_alert",
          `Hi ${t.name}, there is no payment method on file for your account and rent is due in ${untilDue} day${untilDue === 1 ? "" : "s"}. Please contact your property manager immediately. Reply STOP to opt out.`,
          snapshot, autoMode, results
        )
      }
    }

    // ── Rule C: Card expiry alert — only fires if card_expiry data is present ────
    if (t.card_expiry && cardExpiresWithinDays(t.card_expiry, 7)) {
      triggered = true
      results.evaluated++
      const alreadySent = await recentlySent(supabase, t.id, "card_expiry_alert", 7)
      if (alreadySent) {
        results.skipped_dedup++
      } else {
        await sendAndLog(
          supabase, t, "card_expiry_alert",
          `Hi ${t.name}, your payment card on file expires soon and rent is due on the ${dueDayOfMonth}${dueDayOfMonth === 1 ? "st" : dueDayOfMonth === 2 ? "nd" : dueDayOfMonth === 3 ? "rd" : "th"}. Please update your payment method to avoid a failed payment. Reply STOP to opt out.`,
          snapshot, autoMode, results
        )
      }
    }

    // ── Rule D: Pre-due warning for already-delinquent tenants ───────────────────
    // Fires 5 days before rent due date when tenant already has a balance
    // This is the "Kevin Durant" scenario — catch up on arrears AND prevent next miss
    if (hasBalance && untilDue <= 5) {
      triggered = true
      results.evaluated++
      const alreadySent = await recentlySent(supabase, t.id, "pre_due_delinquent_warning", 14)
      if (alreadySent) {
        results.skipped_dedup++
      } else {
        await sendAndLog(
          supabase, t, "pre_due_delinquent_warning",
          `Hi ${t.name}, you currently have a balance of $${(t.balance_due ?? 0).toLocaleString()} and rent of $${(t.rent_amount ?? 0).toLocaleString()} is due in ${untilDue} day${untilDue === 1 ? "" : "s"}. Please contact your property manager immediately to avoid further action. Reply STOP to opt out.`,
          snapshot, autoMode, results
        )
      }
    }

    if (!triggered) results.skipped_no_trigger++
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    auto_mode_on_for: [...autoModeByUser.entries()].filter(([, v]) => v).map(([k]) => k),
    results,
  })
}
