/**
 * Phase 2 Cron — Recovery, runs AFTER the 1st
 * Does NOT auto-email tenants. Alerts the property manager with context
 * and decision support so they choose what action to take.
 *
 * Philosophy:
 *   - Never auto-send legal notices (one defective notice = entire case dismissed)
 *   - Every PM has a different tolerance — respect their escalation style
 *   - Surface the right info at the right time, let the PM decide
 *
 * Schedule: runs daily at 9am (1 hour after Phase 1)
 *
 * Escalation styles:
 *   aggressive → alert on days 1, 3, 7, 15, 30
 *   moderate   → alert on days 1, 5, 10, 20, 35   (default)
 *   lenient    → alert on days 1, 10, 20, 45
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

// ── Config ─────────────────────────────────────────────────────────────────────

const ALERT_DAYS: Record<string, number[]> = {
  aggressive: [1, 3, 7, 15, 30],
  moderate:   [1, 5, 10, 20, 35],
  lenient:    [1, 10, 20, 45],
}

// What to tell the PM at each day threshold
const DAY_CONTEXT: Record<number, { label: string; suggestion: string; color: string; urgency: string }> = {
  1:  { label: "Day 1 — Rent not received",             suggestion: "Send a friendly reminder email",                   color: "#9ca3af", urgency: "low" },
  3:  { label: "Day 3 — Still unpaid",                  suggestion: "Follow up directly — call or text the tenant",     color: "#fbbf24", urgency: "medium" },
  5:  { label: "Day 5 — Past grace period",             suggestion: "Send a reminder — late fee may apply",             color: "#fbbf24", urgency: "medium" },
  7:  { label: "Day 7 — One week late",                 suggestion: "Offer a payment plan to get partial payment now",  color: "#f97316", urgency: "medium" },
  10: { label: "Day 10 — Decision point",               suggestion: "Payment plan or cash for keys — see cost comparison below", color: "#f97316", urgency: "high" },
  15: { label: "Day 15 — Escalation warranted",         suggestion: "Draft a formal notice for your review (no auto-send)", color: "#f87171", urgency: "high" },
  20: { label: "Day 20 — Formal notice window",         suggestion: "Review Pay or Quit notice — consult your attorney before sending", color: "#ef4444", urgency: "critical" },
  30: { label: "Day 30 — Attorney recommended",         suggestion: "Consult your attorney about filing Unlawful Detainer", color: "#dc2626", urgency: "critical" },
  35: { label: "Day 35 — UD filing window",             suggestion: "File Unlawful Detainer with your attorney (Day 35+ in most states)", color: "#dc2626", urgency: "critical" },
  45: { label: "Day 45 — Extended delinquency",         suggestion: "Last chance: cash for keys offer or UD filing", color: "#dc2626", urgency: "critical" },
}

// Eviction cost estimate by state (weeks to complete eviction)
// Source: industry averages — landlord-friendly to tenant-friendly
const STATE_EVICTION_WEEKS: Record<string, number> = {
  TX: 6,  AZ: 6,  AL: 5,  AR: 5,  CO: 6,  GA: 6,  FL: 7,  NC: 6,  IN: 6,  TN: 6,
  OH: 7,  MO: 7,  MI: 8,  PA: 8,  VA: 8,  WA: 10, OR: 10, IL: 10, MD: 10, NJ: 12,
  NY: 16, CA: 20, MA: 16, CT: 14, VT: 20,
}

function evictionWeeks(state?: string | null): number {
  return state ? (STATE_EVICTION_WEEKS[state.toUpperCase()] ?? 10) : 10
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysPastDue(lastPaymentDate: string, rentDueDay = 1): number {
  const last = new Date(lastPaymentDate)
  const now = new Date()
  const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
  let rentDueThisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (rentDueThisMonth > now) {
    rentDueThisMonth = new Date(now.getFullYear(), now.getMonth() - 1, dueDay)
  }
  if (last < rentDueThisMonth) {
    return Math.floor((now.getTime() - rentDueThisMonth.getTime()) / (1000 * 60 * 60 * 24))
  }
  return 0
}

function getAlertTier(days: number, style: string): number | null {
  const triggers = ALERT_DAYS[style] ?? ALERT_DAYS.moderate
  // Find the highest trigger day that days has reached
  const reached = triggers.filter(d => days >= d)
  return reached.length > 0 ? Math.max(...reached) : null
}

async function alreadyAlertedForTier(
  supabase: any,
  tenantId: string,
  tier: number
): Promise<boolean> {
  const type = `pm_alert_day${tier}`
  const now = new Date()
  // Check within this calendar month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data } = await supabase
    .from("interventions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .gte("sent_at", monthStart)
    .limit(1)
  return (data?.length ?? 0) > 0
}

// ── Main ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all delinquent active tenants
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name, unit, email, user_id, balance_due, rent_amount, last_payment_date, properties(name, state)")
    .eq("status", "active")
    .gt("balance_due", 0)
    .not("last_payment_date", "is", null)

  if (error || !tenants) {
    return NextResponse.json({ error: "Failed to fetch tenants", detail: error?.message }, { status: 500 })
  }

  // Only tenants actually past due (not just with a balance that's new this month)
  const delinquent = tenants.filter(t => {
    const days = daysPastDue(t.last_payment_date!)
    return days > 0
  })

  if (delinquent.length === 0) {
    return NextResponse.json({ ok: true, message: "No delinquent tenants today", alerts_sent: 0 })
  }

  // Group by user (property manager)
  const byUser: Record<string, typeof delinquent> = {}
  for (const t of delinquent) {
    if (!byUser[t.user_id]) byUser[t.user_id] = []
    byUser[t.user_id].push(t)
  }

  let totalAlerts = 0
  let totalEmails = 0

  for (const [userId, userTenants] of Object.entries(byUser)) {
    // Fetch PM profile for escalation style only — state now lives on each property
    const { data: profile } = await supabase
      .from("profiles")
      .select("escalation_style")
      .eq("id", userId)
      .single()

    const style = profile?.escalation_style ?? "moderate"

    // Figure out which tenants need a PM alert today
    const alertItems: Array<{
      tenant: typeof delinquent[0]
      days: number
      tier: number
      context: typeof DAY_CONTEXT[number]
    }> = []

    for (const t of userTenants) {
      const days = daysPastDue(t.last_payment_date!)
      const tier = getAlertTier(days, style)
      if (!tier) continue

      const alreadySent = await alreadyAlertedForTier(supabase, t.id, tier)
      if (alreadySent) continue

      const context = DAY_CONTEXT[tier] ?? DAY_CONTEXT[1]
      alertItems.push({ tenant: t, days, tier, context })

      // Log the intervention
      await supabase.from("interventions").insert({
        tenant_id: t.id,
        user_id: userId,
        type: `pm_alert_day${tier}`,
        status: "sent",
        sent_at: new Date().toISOString(),
        notes: `Phase 2 PM alert — Day ${tier} tier, ${days} actual days past due`,
      })

      totalAlerts++
    }

    if (alertItems.length === 0) continue

    // Get PM email
    const { data: userData } = await supabase.auth.admin.getUserById(userId)
    const pmEmail = userData?.user?.email
    if (!pmEmail) continue

    // Build cost comparison for high-urgency items (Day 10+)
    const evictionCostBase = 1500 + 500 // attorney + court
    const weeks = 10 // fallback — overridden per-tenant below

    // Build email
    const rows = alertItems
      .sort((a, b) => b.days - a.days) // most urgent first
      .map(({ tenant, days, context }) => {
        const rentAmount = tenant.rent_amount || 0
        const balance = tenant.balance_due || 0
        const propertyState = (tenant.properties as any)?.state ?? null
        const tenantWeeks = propertyState ? (evictionWeeks(propertyState) ) : weeks
        const vacancyCost = Math.round((rentAmount / 4) * tenantWeeks)
        const evictionTotal = evictionCostBase + vacancyCost
        const cfkSuggested = Math.round(rentAmount * 0.75)
        const propertyName = (tenant.properties as any)?.name ?? ""

        const costBlock = days >= 10 ? `
          <div style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:12px 16px;margin-top:10px;">
            <p style="color:#4b5563;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 10px;">Cost Comparison</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr>
                <td style="padding:6px 0;color:#9ca3af;border-bottom:1px solid #1f2937;">Eviction (est. ${tenantWeeks} weeks)</td>
                <td style="padding:6px 0;text-align:right;color:#f87171;font-weight:700;border-bottom:1px solid #1f2937;">~$${evictionTotal.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;">Cash for Keys (suggested offer)</td>
                <td style="padding:6px 0;text-align:right;color:#34d399;font-weight:700;">~$${cfkSuggested.toLocaleString()}</td>
              </tr>
            </table>
          </div>` : ""

        return `
          <div style="background:#0d1117;border:1px solid #1f2937;border-radius:10px;padding:16px 18px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
              <div>
                <span style="color:#f0f1f3;font-weight:700;font-size:15px;">${tenant.name}</span>
                <span style="color:#4b5563;font-size:13px;margin-left:8px;">Unit ${tenant.unit}${propertyName ? ` · ${propertyName}` : ""}</span>
              </div>
              <span style="color:${context.color};font-weight:700;font-size:13px;">Day ${days}</span>
            </div>
            <p style="color:#6b7280;font-size:12px;margin:0 0 6px;">${context.label}</p>
            <p style="color:#9ca3af;font-size:13px;margin:0 0 4px;">Balance: <strong style="color:#f87171;">$${balance.toLocaleString()}</strong></p>
            <p style="color:#60a5fa;font-size:13px;margin:0;">→ ${context.suggestion}</p>
            ${costBlock}
          </div>`
      }).join("")

    const subject = alertItems.length === 1
      ? `RentSentry — ${alertItems[0].tenant.name} is ${alertItems[0].days} days past due`
      : `RentSentry — ${alertItems.length} tenants need your attention`

    try {
      await resend.emails.send({
        from: "RentSentry <onboarding@resend.dev>",
        to: pmEmail,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:36px 28px;background:#0a0e1a;color:#f0f1f3;border-radius:14px;">
            <p style="font-size:12px;color:#4b5563;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">RentSentry · Phase 2 Alert</p>
            <h2 style="margin:0 0 6px;font-size:20px;">${alertItems.length} tenant${alertItems.length !== 1 ? "s" : ""} need${alertItems.length === 1 ? "s" : ""} your attention</h2>
            <p style="color:#6b7280;font-size:13px;margin:0 0 24px;">Review each situation below and decide on the appropriate action. RentSentry never sends notices to tenants without your approval.</p>
            ${rows}
            <div style="margin-top:24px;padding-top:20px;border-top:1px solid #1f2937;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tenants" style="display:inline-block;background:#60a5fa;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
                Review in Dashboard →
              </a>
            </div>
            <p style="color:#374151;font-size:11px;margin-top:20px;">Your escalation style is set to <strong style="color:#6b7280;">${style}</strong>. Change this in Settings.</p>
          </div>`,
      })
      totalEmails++
    } catch { /* don't fail the whole job */ }
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    delinquent_tenants: delinquent.length,
    alerts_logged: totalAlerts,
    pm_emails_sent: totalEmails,
  })
}
