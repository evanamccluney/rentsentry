import { createClient } from "@/lib/supabase/server"
import { scoreTenant } from "@/lib/risk-engine"
import Link from "next/link"
import { TrendingUp, DollarSign, CheckCircle2, AlertTriangle } from "lucide-react"

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

export default async function RentRollPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rawTenants } = await supabase
    .from("tenants")
    .select(`
      id, name, unit, rent_amount, balance_due,
      days_late_avg, late_payment_count, previous_delinquency,
      card_expiry, payment_method, last_payment_date, rent_due_day,
      properties(name)
    `)
    .eq("user_id", user!.id)
    .eq("status", "active")

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: rawPayments } = await supabase
    .from("payments")
    .select("amount, date, tenant_id")
    .eq("user_id", user!.id)
    .gte("date", sixMonthsAgo.toISOString().split("T")[0])
    .order("date", { ascending: false })

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const payments = rawPayments || []
  const tenants = rawTenants || []

  const thisMonthPayments = payments.filter(p => p.date >= thisMonthStart)
  const collectedThisMonth = thisMonthPayments.reduce((s, p) => s + (p.amount || 0), 0)

  const paidByTenant = new Map<string, number>()
  for (const p of thisMonthPayments) {
    paidByTenant.set(p.tenant_id, (paidByTenant.get(p.tenant_id) || 0) + (p.amount || 0))
  }

  const totalRentRoll = tenants.reduce((s, t) => s + (t.rent_amount || 0), 0)
  const totalBalance = tenants.reduce((s, t) => s + (t.balance_due || 0), 0)
  const uncollected = Math.max(0, totalRentRoll - collectedThisMonth)
  const collectionRate = totalRentRoll > 0 ? Math.round((collectedThisMonth / totalRentRoll) * 100) : 0

  // 6-month buckets
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { label: monthLabel(d), key: monthKey(d), collected: 0 }
  })
  for (const p of payments) {
    const key = p.date.slice(0, 7)
    const bucket = months.find(m => m.key === key)
    if (bucket) bucket.collected += p.amount || 0
  }
  const maxCollected = Math.max(...months.map(m => m.collected), 1)
  const currentKey = monthKey(now)

  // Score tenants
  const scoredTenants = tenants
    .map(t => ({
      ...t,
      paidThisMonth: paidByTenant.get(t.id) || 0,
      tier: scoreTenant({
        days_late_avg: t.days_late_avg ?? 0,
        late_payment_count: t.late_payment_count ?? 0,
        previous_delinquency: t.previous_delinquency ?? false,
        card_expiry: t.card_expiry ?? undefined,
        payment_method: t.payment_method ?? undefined,
        balance_due: t.balance_due ?? 0,
        rent_amount: t.rent_amount ?? 0,
        last_payment_date: t.last_payment_date ?? undefined,
        rent_due_day: t.rent_due_day ?? 1,
      }).tier,
    }))
    .sort((a, b) => (b.balance_due ?? 0) - (a.balance_due ?? 0))

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Rent Roll</h1>
        <p className="text-[#6b7280] text-sm mt-1">Collection tracking and month-over-month trends</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Monthly Rent Roll",
            value: `$${totalRentRoll.toLocaleString()}`,
            sub: `${tenants.length} active tenants`,
            color: "text-white",
            icon: <TrendingUp size={16} className="text-emerald-400" />,
          },
          {
            label: "Collected This Month",
            value: `$${collectedThisMonth.toLocaleString()}`,
            sub: `${collectionRate}% collection rate`,
            color: collectionRate >= 90 ? "text-emerald-400" : collectionRate >= 70 ? "text-yellow-400" : "text-red-400",
            icon: <CheckCircle2 size={16} className="text-emerald-400" />,
          },
          {
            label: "Uncollected This Month",
            value: `$${uncollected.toLocaleString()}`,
            sub: "rent roll minus recorded payments",
            color: uncollected > 0 ? "text-orange-400" : "text-emerald-400",
            icon: <DollarSign size={16} className="text-orange-400" />,
          },
          {
            label: "Total Balance Due",
            value: `$${totalBalance.toLocaleString()}`,
            sub: `${tenants.filter(t => (t.balance_due ?? 0) > 0).length} tenants with balance`,
            color: totalBalance > 0 ? "text-red-400" : "text-emerald-400",
            icon: <AlertTriangle size={16} className="text-red-400" />,
          },
        ].map(({ label, value, sub, color, icon }) => (
          <div key={label} className="bg-[#111827] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#4b5563] text-xs uppercase tracking-wide">{label}</span>
              {icon}
            </div>
            <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
            <div className="text-[#4b5563] text-xs mt-1">{sub}</div>
          </div>
        ))}
      </div>

      {/* 6-month trend */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-sm">6-Month Collection Trend</h2>
          <span className="text-[#374151] text-xs">Based on payments recorded in RentSentry</span>
        </div>
        <div className="flex items-end gap-2" style={{ height: "120px" }}>
          {months.map(m => {
            const pct = m.collected > 0 ? (m.collected / maxCollected) * 100 : 0
            const isCurrent = m.key === currentKey
            return (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                {m.collected > 0 && (
                  <div className="text-[#4b5563] text-[10px] tabular-nums whitespace-nowrap">
                    ${m.collected >= 1000 ? `${Math.round(m.collected / 1000)}k` : m.collected}
                  </div>
                )}
                <div className="w-full flex flex-col justify-end" style={{ height: "80px" }}>
                  <div
                    className={`w-full rounded-t-md ${isCurrent ? "bg-blue-500/70" : "bg-white/[0.08]"}`}
                    style={{ height: `${Math.max(pct, m.collected > 0 ? 3 : 0)}%` }}
                  />
                </div>
                <div className={`text-[10px] text-center ${isCurrent ? "text-blue-400" : "text-[#374151]"}`}>
                  {m.label}
                </div>
              </div>
            )
          })}
        </div>
        {months.every(m => m.collected === 0) && (
          <p className="text-[#374151] text-sm text-center mt-4">
            No payments recorded yet. Use the AI chat or tenant pages to log payments — they&apos;ll appear here.
          </p>
        )}
      </div>

      {/* Per-tenant table */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-white font-semibold text-sm">Tenant Payment Status</h2>
          <p className="text-[#4b5563] text-xs mt-0.5">Payments recorded in RentSentry this month</p>
        </div>
        {tenants.length === 0 ? (
          <div className="px-5 py-10 text-center text-[#374151] text-sm">No active tenants.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["Tenant", "Unit / Property", "Monthly Rent", "Paid This Month", "Balance Due", "Status"].map(h => (
                      <th key={h} className="text-left text-[#374151] text-[10px] uppercase tracking-wide px-5 py-3 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scoredTenants.map(t => {
                    const paid = t.paidThisMonth
                    const balance = t.balance_due ?? 0
                    const rent = t.rent_amount ?? 0
                    const fullyPaid = paid >= rent && balance === 0
                    const partial = paid > 0 && !fullyPaid
                    const overdue = balance > 0 && paid === 0
                    const noRecord = paid === 0 && balance === 0

                    const statusBadge = fullyPaid
                      ? { label: "Paid", cls: "bg-emerald-500/15 text-emerald-400" }
                      : partial
                        ? { label: "Partial", cls: "bg-yellow-500/15 text-yellow-400" }
                        : overdue
                          ? { label: "Overdue", cls: "bg-red-500/15 text-red-400" }
                          : { label: "No record", cls: "bg-white/[0.05] text-[#4b5563]" }

                    return (
                      <tr key={t.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5">
                          <Link href={`/dashboard/tenants/${t.id}`} className="text-white hover:text-blue-400 font-medium transition-colors">
                            {t.name}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-[#6b7280]">
                          {t.unit}
                          {(t.properties as { name?: string } | null)?.name && (
                            <span className="text-[#374151]"> · {(t.properties as { name: string }).name}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-white tabular-nums">${rent.toLocaleString()}</td>
                        <td className="px-5 py-3.5 tabular-nums">
                          {paid > 0
                            ? <span className="text-emerald-400">${paid.toLocaleString()}</span>
                            : <span className="text-[#2e3a50]">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5 tabular-nums">
                          {balance > 0
                            ? <span className="text-red-400 font-medium">${balance.toLocaleString()}</span>
                            : <span className="text-[#2e3a50]">—</span>
                          }
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-white/[0.04]">
              <p className="text-[#2e3a50] text-xs">
                "Paid this month" reflects payments logged via the AI chat or tenant detail pages. It does not auto-sync with your payment processor.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
