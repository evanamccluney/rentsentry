import { createClient } from "@/lib/supabase/server"
import TenantBoard from "@/components/dashboard/TenantBoard"
import { scoreTenant } from "@/lib/risk-engine"

export default async function TenantsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: tenants } = await supabase
    .from("tenants")
    .select(`
      id, unit, name, email, phone,
      rent_amount, balance_due,
      risk_score, risk_reasons,
      days_late_avg, late_payment_count,
      previous_delinquency, card_expiry, payment_method,
      last_payment_date, resolution_status,
      properties(name, id, state, address)
    `)
    .eq("user_id", user!.id)
    .eq("status", "active")

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, address, state")
    .eq("user_id", user!.id)
    .order("name")

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const { data: recentActivity } = await supabase
    .from("interventions")
    .select("tenant_id, type, sent_at, status")
    .eq("user_id", user!.id)
    .gte("sent_at", monthStart.toISOString())
    .order("sent_at", { ascending: false })

  const { data: paymentsThisMonth } = await supabase
    .from("payments")
    .select("tenant_id, amount, date")
    .eq("user_id", user!.id)
    .gte("date", monthStart.toISOString().split("T")[0])

  const { data: profile } = await supabase
    .from("profiles")
    .select("auto_mode")
    .eq("id", user!.id)
    .single()

  // Re-score with updated tier engine
  const scored = (tenants || []).map(t => {
    const result = scoreTenant({
      days_late_avg: t.days_late_avg ?? 0,
      late_payment_count: t.late_payment_count ?? 0,
      previous_delinquency: t.previous_delinquency ?? false,
      card_expiry: t.card_expiry ?? undefined,
      payment_method: t.payment_method ?? undefined,
      balance_due: t.balance_due ?? 0,
      rent_amount: t.rent_amount ?? 0,
      last_payment_date: t.last_payment_date ?? undefined,
    })
    return { ...t, ...result }
  })

  const TIER_ORDER: Record<string, number> = {
    legal: 0, pay_or_quit: 1, cash_for_keys: 2, payment_plan: 3, reminder: 4, watch: 5, healthy: 6,
  }
  const sorted = scored.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])

  return (
    <TenantBoard
      tenants={sorted as Parameters<typeof TenantBoard>[0]["tenants"]}
      properties={properties || []}
      recentActivity={recentActivity || []}
      paymentsThisMonth={paymentsThisMonth || []}
      autoMode={profile?.auto_mode ?? false}
      landlordEmail={user!.email ?? ""}
    />
  )
}
