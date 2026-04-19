import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { scoreTenant } from "@/lib/risk-engine"

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function relativeDays(date: Date): string {
  const diff = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff <= 0) return "today"
  if (diff === 1) return "tomorrow"
  return `in ${diff} days`
}

// Mirrors computeScheduledDate in TenantBoard — keep in sync
function getScheduledAction(t: {
  tier: string
  card_expiry?: string | null
  payment_method?: string | null
  late_payment_count?: number | null
  days_late_avg?: number | null
}): { what: string; date: Date; reason: string } | null {
  const now = new Date()
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const hasHistory = (t.late_payment_count ?? 0) >= 2 || (t.days_late_avg ?? 0) >= 3
  const noPaymentMethod = !t.payment_method || t.payment_method === "unknown"

  // Rule A: Proactive reminder — late history, 3 days before the 1st
  if ((t.tier === "watch" || t.tier === "reminder") && hasHistory) {
    const reminderDate = new Date(nextFirst)
    reminderDate.setDate(reminderDate.getDate() - 3)
    return {
      what: "Proactive rent reminder",
      date: reminderDate,
      reason: "Late payment history detected",
    }
  }

  // Rule B: No payment method — 7 days before the 1st
  if (t.tier === "watch" && noPaymentMethod) {
    const alertDate = new Date(nextFirst)
    alertDate.setDate(alertDate.getDate() - 7)
    return {
      what: "Payment method confirmation",
      date: alertDate,
      reason: "No payment method on file",
    }
  }

  // Rule C (optional): Card expiry data present and expiring within 30 days
  if (t.card_expiry && t.tier === "watch") {
    try {
      const [month, year] = t.card_expiry.split("/").map(Number)
      if (!month || !year) return null
      const expiryDate = new Date(2000 + year, month - 1, 1)
      const reminderDate = new Date(expiryDate)
      reminderDate.setDate(reminderDate.getDate() - 7)
      if (reminderDate > now) {
        return {
          what: "Card expiry reminder",
          date: reminderDate,
          reason: `Card expires ${formatDate(expiryDate)}`,
        }
      }
    } catch { return null }
  }

  return null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const [tenantsRes, profileRes, todayInterventionsRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, unit, rent_amount, balance_due, days_late_avg, late_payment_count, previous_delinquency, card_expiry, payment_method, last_payment_date")
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase.from("profiles").select("auto_mode").eq("id", user.id).single(),
    supabase
      .from("interventions")
      .select("id, tenant_id")
      .eq("user_id", user.id)
      .gte("sent_at", (() => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString() })()),
  ])

  const tenants = tenantsRes.data ?? []
  const autoMode: boolean = profileRes.data?.auto_mode ?? false

  const scored = tenants.map(t => ({
    ...t,
    ...scoreTenant({
      days_late_avg: t.days_late_avg ?? 0,
      late_payment_count: t.late_payment_count ?? 0,
      previous_delinquency: t.previous_delinquency ?? false,
      card_expiry: t.card_expiry ?? undefined,
      payment_method: t.payment_method ?? undefined,
      balance_due: t.balance_due ?? 0,
      rent_amount: t.rent_amount ?? 0,
      last_payment_date: t.last_payment_date ?? undefined,
    }),
  }))

  const notHealthy = scored.filter(t => t.tier !== "healthy")
  const atRiskRevenue = notHealthy.reduce((s, t) => s + (t.balance_due || 0), 0)

  const todaySentIds = new Set((todayInterventionsRes.data ?? []).map(i => i.tenant_id))
  const todayProtected = tenants
    .filter(t => todaySentIds.has(t.id))
    .reduce((s, t) => s + (t.rent_amount || 0), 0)

  // Scheduled actions — only when auto mode is on
  const scheduledActions = autoMode
    ? scored
        .filter(t => t.tier === "watch" || t.tier === "reminder")
        .flatMap(t => {
          const action = getScheduledAction(t)
          if (!action) return []
          return [{
            tenant_name: t.name,
            unit: t.unit,
            what: action.what,
            on: formatDate(action.date),
            relative: relativeDays(action.date),
            reason: action.reason,
          }]
        })
    : []

  return NextResponse.json({
    total: scored.length,
    needs_action: notHealthy.length,
    critical_count: scored.filter(t => t.tier === "legal" || t.tier === "pay_or_quit").length,
    payment_plan_count: scored.filter(t => t.tier === "payment_plan").length,
    at_risk_revenue: atRiskRevenue,
    today_sent: (todayInterventionsRes.data ?? []).length,
    today_protected: todayProtected,
    auto_mode: autoMode,
    scheduled_actions: scheduledActions,
    breakdown: {
      legal:         scored.filter(t => t.tier === "legal").length,
      pay_or_quit:   scored.filter(t => t.tier === "pay_or_quit").length,
      cash_for_keys: scored.filter(t => t.tier === "cash_for_keys").length,
      payment_plan:  scored.filter(t => t.tier === "payment_plan").length,
      reminder:      scored.filter(t => t.tier === "reminder").length,
      watch:         scored.filter(t => t.tier === "watch").length,
    },
  })
}
