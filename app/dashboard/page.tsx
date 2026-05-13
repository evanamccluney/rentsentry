import { createClient } from "@/lib/supabase/server"
import { getCachedProfile, getCachedTenants } from "@/lib/cache"
import { scoreTenant } from "@/lib/risk-engine"
import { profileToEscalationRules } from "@/lib/escalation-rules"
import Link from "next/link"
import { ArrowRight, TrendingUp, DollarSign, Users, AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react"
import SetupChecklist from "@/components/dashboard/SetupChecklist"
import TodayBriefing from "@/components/dashboard/TodayBriefing"
import CashFlowForecast from "@/components/dashboard/CashFlowForecast"
import AutomationActivationBanner from "@/components/dashboard/AutomationActivationBanner"

const TIER_COLORS: Record<string, string> = {
  legal: "bg-red-500",
  pay_or_quit: "bg-red-400",
  cash_for_keys: "bg-orange-500",
  payment_plan: "bg-amber-500",
  reminder: "bg-yellow-400",
  watch: "bg-blue-400",
  healthy: "bg-emerald-500",
}

const TIER_LABELS: Record<string, string> = {
  legal: "Legal",
  pay_or_quit: "Pay or Quit",
  cash_for_keys: "Cash for Keys",
  payment_plan: "Payment Plan",
  reminder: "Reminder",
  watch: "Watch",
  healthy: "Healthy",
}

const INTERVENTION_LABELS: Record<string, string> = {
  payment_reminder:     "Payment reminder sent",
  proactive_reminder:   "Proactive reminder sent",
  payment_method_alert: "Payment method alert sent",
  split_pay_offer:      "Payment plan offered",
  cash_for_keys:        "Cash for Keys offered",
  legal_packet:         "Legal notice sent",
  card_expiry_alert:    "Payment reminder sent",
  card_expiry_30:       "Payment reminder sent",
  card_expiry_7:        "Payment reminder sent",
  no_payment_method:    "Payment method alert sent",
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function daysUntilDue(rentDueDay: number): number {
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), rentDueDay)
  const next = thisMonth > now ? thisMonth : new Date(now.getFullYear(), now.getMonth() + 1, rentDueDay)
  return Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const AUTO_INTERVENTION_TYPES = [
    "proactive_reminder", "pre_due_urgent",
    "pre_due_delinquent_warning", "pre_due_installment_offer", "payment_method_alert",
  ]

  const [rawTenants, profile, recentActivity, { count: propertyCount }, { data: recentAutoInterventions }] = await Promise.all([
    getCachedTenants(user!.id),
    getCachedProfile(user!.id),
    supabase
      .from("interventions")
      .select("id, type, sent_at, tenant_id, tenants(name, unit)")
      .eq("user_id", user!.id)
      .order("sent_at", { ascending: false })
      .limit(8)
      .then(r => r.data),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id),
    supabase
      .from("interventions")
      .select("tenant_id, type, sent_at")
      .eq("user_id", user!.id)
      .in("type", AUTO_INTERVENTION_TYPES)
      .gte("sent_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("sent_at", { ascending: false }),
  ])

  const lastAutoActionByTenant: Record<string, { type: string; daysAgo: number }> = {}
  for (const i of recentAutoInterventions ?? []) {
    if (!lastAutoActionByTenant[i.tenant_id]) {
      const daysAgo = Math.floor((Date.now() - new Date(i.sent_at).getTime()) / (1000 * 60 * 60 * 24))
      lastAutoActionByTenant[i.tenant_id] = { type: i.type, daysAgo }
    }
  }
  const escalationRules = profileToEscalationRules(profile)

  const tenants = (rawTenants || []).map(t => ({
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
      rent_due_day: t.rent_due_day ?? 1,
      days_until_due: daysUntilDue(t.rent_due_day ?? 1),
      escalation_rules: escalationRules,
    }),
  }))

  const lastUploadAt = rawTenants && rawTenants.length > 0
    ? new Date(Math.max(...rawTenants.map(t => new Date((t as { created_at?: string }).created_at ?? "").getTime())))
    : null
  const renderedAt = new Date()
  const daysSinceUpload = lastUploadAt
    ? Math.floor((renderedAt.getTime() - lastUploadAt.getTime()) / (1000 * 60 * 60 * 24))
    : null
  const dataIsStale = daysSinceUpload !== null && daysSinceUpload >= 7

  const total = tenants.length
  const monthlyRent = tenants.reduce((s, t) => s + (t.rent_amount || 0), 0)
  const totalOwed = tenants.reduce((s, t) => s + (t.balance_due || 0), 0)
  const paidUp = tenants.filter(t => (t.balance_due || 0) === 0).length
  const collectionRate = total > 0 ? Math.round((paidUp / total) * 100) : 0
  const revenueAtRisk = tenants
    .filter(t => ["legal", "pay_or_quit", "cash_for_keys"].includes(t.tier))
    .reduce((s, t) => s + (t.rent_amount || 0), 0)
  const revenueAtRiskPct = monthlyRent > 0 ? Math.round((revenueAtRisk / monthlyRent) * 100) : 0

  const ACTION_ORDER = ["legal", "pay_or_quit", "cash_for_keys", "payment_plan", "reminder"]
  const needsAction = tenants
    .filter(t => ACTION_ORDER.includes(t.tier))
    .sort((a, b) => ACTION_ORDER.indexOf(a.tier) - ACTION_ORDER.indexOf(b.tier))
    .slice(0, 5)

  const tierCounts = Object.fromEntries(
    ["legal", "pay_or_quit", "cash_for_keys", "payment_plan", "reminder", "watch", "healthy"].map(
      tier => [tier, tenants.filter(t => t.tier === tier).length]
    )
  ) as Record<string, number>

  const atRisk = ACTION_ORDER.reduce((s, t) => s + (tierCounts[t] || 0), 0)

  const p = profile as Record<string, unknown> | null
  const checklistSteps = [
    {
      label: "Add a property",
      description: "Create your first property so tenants can be organized by address.",
      done: (propertyCount ?? 0) > 0,
      href: "/dashboard/properties",
      cta: "Add property",
    },
    {
      label: "Upload your rent roll",
      description: "Import your tenants via CSV, or add them one at a time.",
      done: total > 0,
      href: "/dashboard/upload",
      cta: "Upload CSV",
      altHref: "/dashboard/tenants",
      altCta: "Add manually",
    },
    {
      label: "Connect Stripe",
      description: "Required to collect payments and send payment links to tenants.",
      done: !!(p?.stripe_account_id),
      href: "/dashboard/settings",
      cta: "Connect",
    },
    {
      label: "Set your automation rules",
      description: "Choose when to send reminders and when to escalate — takes 30 seconds.",
      done: !!(p?.escalation_preset),
      href: "/dashboard/settings",
      cta: "Configure",
    },
    {
      label: "Add your phone number",
      description: "So tenants know who to call and SMS replies reach you.",
      done: !!(p?.pm_phone),
      href: "/dashboard/settings",
      cta: "Add number",
    },
  ]
  const completedCount = checklistSteps.filter(s => s.done).length

  const now = new Date()
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const expiringLeases = tenants
    .filter(t => {
      if (!t.lease_end) return false
      const d = new Date(t.lease_end)
      return d >= now && d <= in60
    })
    .sort((a, b) => new Date(a.lease_end!).getTime() - new Date(b.lease_end!).getTime())
    .slice(0, 4)

  if (total === 0) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Portfolio Overview</h1>
          <p className="text-[#6b7280] text-sm mt-1">Real-time revenue risk across your properties</p>
        </div>
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Users size={20} className="text-blue-400" />
          </div>
          <p className="text-white font-semibold mb-2">No tenants yet</p>
          <p className="text-[#6b7280] text-sm mb-6 max-w-sm mx-auto">Add a property and upload your first rent roll to start protecting revenue.</p>
          <Link href="/dashboard/upload" className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
            Upload Rent Roll <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Portfolio Overview</h1>
        <p className="text-[#6b7280] text-sm mt-1">
          {total} active tenants ·{" "}
          {atRisk > 0
            ? <span className="text-red-400">{atRisk} need action</span>
            : <span className="text-emerald-400">all tenants in good standing</span>
          }
        </p>
      </div>

      <SetupChecklist steps={checklistSteps} completedCount={completedCount} />

      {!profile?.auto_mode && <AutomationActivationBanner />}

      <TodayBriefing tenants={tenants} lastAutoActions={lastAutoActionByTenant} />

      <CashFlowForecast
        tenants={tenants.map(t => ({ rent_amount: t.rent_amount || 0, balance_due: t.balance_due || 0, tier: t.tier }))}
        monthLabel={new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      />

      {/* Stale data banner */}
      {dataIsStale && (
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-3.5 mb-6">
          <div className="flex items-center gap-3">
            <RefreshCw size={15} className="text-amber-400 shrink-0" />
            <span className="text-amber-400 text-sm">
              Your rent roll is <span className="font-semibold">{daysSinceUpload} days old</span> — reminders may target tenants who already paid.
            </span>
          </div>
          <Link href="/dashboard/upload" className="shrink-0 ml-4 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors">
            Upload now
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Monthly Rent Roll",
            value: `$${monthlyRent.toLocaleString()}`,
            sub: `${total} tenants · $${Math.round(monthlyRent / Math.max(total, 1)).toLocaleString()} avg`,
            icon: <TrendingUp size={16} className="text-emerald-400" />,
            color: "text-white",
          },
          {
            label: "Revenue at Risk",
            value: `$${revenueAtRisk.toLocaleString()}`,
            sub: revenueAtRisk > 0 ? `${revenueAtRiskPct}% of rent roll` : "no critical-tier tenants",
            icon: <AlertTriangle size={16} className="text-red-400" />,
            color: revenueAtRisk > 0 ? "text-red-400" : "text-emerald-400",
          },
          {
            label: "Outstanding Balance",
            value: `$${totalOwed.toLocaleString()}`,
            sub: totalOwed > 0 ? `across ${tenants.filter(t => (t.balance_due || 0) > 0).length} tenants` : "all balances clear",
            icon: <DollarSign size={16} className="text-orange-400" />,
            color: totalOwed > 0 ? "text-orange-400" : "text-white",
          },
          {
            label: "Collection Rate",
            value: `${collectionRate}%`,
            sub: `${paidUp} of ${total} paid up`,
            icon: <CheckCircle2 size={16} className="text-emerald-400" />,
            color: collectionRate >= 90 ? "text-emerald-400" : collectionRate >= 75 ? "text-yellow-400" : "text-red-400",
          },
        ].map(({ label, value, sub, icon, color }) => (
          <div key={label} className="bg-[#111827] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#4b5563] text-xs uppercase tracking-wide">{label}</span>
              {icon}
            </div>
            <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
            <div className="text-[#6b7280] text-xs mt-1.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Risk breakdown + leases expiring */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Risk breakdown */}
        <div className="lg:col-span-2 bg-[#111827] border border-white/10 rounded-2xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">Portfolio Risk Breakdown</h2>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px mb-4">
            {["legal", "pay_or_quit", "cash_for_keys", "payment_plan", "reminder", "watch", "healthy"].map(tier => {
              const pct = total > 0 ? (tierCounts[tier] / total) * 100 : 0
              if (pct === 0) return null
              return (
                <div
                  key={tier}
                  className={`${TIER_COLORS[tier]} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${TIER_LABELS[tier]}: ${tierCounts[tier]}`}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {["legal", "pay_or_quit", "cash_for_keys", "payment_plan", "reminder", "watch", "healthy"].map(tier => {
              if (!tierCounts[tier]) return null
              return (
                <div key={tier} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${TIER_COLORS[tier]}`} />
                  <span className="text-[#6b7280] text-xs">{TIER_LABELS[tier]}</span>
                  <span className="text-white text-xs font-semibold">{tierCounts[tier]}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Leases expiring */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">Leases Expiring Soon</h2>
          {expiringLeases.length === 0 ? (
            <div className="flex items-center gap-2 text-[#4b5563] text-sm">
              <CheckCircle2 size={14} className="text-emerald-600" />
              No leases expiring in 60 days
            </div>
          ) : (
            <div className="space-y-1">
              {expiringLeases.map(t => {
                const days = daysUntil(t.lease_end!)
                return (
                  <Link
                    key={t.id}
                    href={`/dashboard/tenants/${t.id}`}
                    className="flex items-center justify-between hover:bg-white/5 rounded-xl px-3 py-2.5 -mx-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">{t.name}</div>
                      <div className="text-[#6b7280] text-xs">Unit {t.unit}</div>
                    </div>
                    <div className={`text-xs font-semibold px-2 py-1 rounded-lg shrink-0 ml-3 ${days <= 14 ? "bg-red-500/15 text-red-400" : days <= 30 ? "bg-orange-500/15 text-orange-400" : "bg-yellow-400/15 text-yellow-400"}`}>
                      {days}d
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Needs action + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Needs action */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-sm">Needs Action</h2>
            <Link href="/dashboard/tenants" className="text-[#4b5563] hover:text-white text-xs transition-colors flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {needsAction.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 size={15} />
              All tenants are in good standing
            </div>
          ) : (
            <div className="space-y-1">
              {needsAction.map(t => (
                <Link
                  key={t.id}
                  href={`/dashboard/tenants/${t.id}`}
                  className="flex items-center justify-between hover:bg-white/5 rounded-xl px-3 py-2.5 -mx-3 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${TIER_COLORS[t.tier]}`} />
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">{t.name}</div>
                      <div className="text-[#6b7280] text-xs">Unit {t.unit} · {TIER_LABELS[t.tier]}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    {(t.balance_due || 0) > 0 && (
                      <div className="text-red-400 text-xs font-semibold">${(t.balance_due || 0).toLocaleString()}</div>
                    )}
                    <ArrowRight size={13} className="text-[#374151] group-hover:text-[#6b7280] transition-colors ml-auto mt-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">Recent Activity</h2>
          {!recentActivity || recentActivity.length === 0 ? (
            <div className="flex items-center gap-2 text-[#4b5563] text-sm">
              <Clock size={14} />
              No actions yet — SMS and notices will appear here
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((a: {
                id: string
                type: string
                sent_at: string
                tenants?: { name?: string | null } | { name?: string | null }[] | null
              }) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock size={13} className="text-[#4b5563]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[#d1d5db] text-sm truncate">
                      <span className="text-white font-medium">{(Array.isArray(a.tenants) ? a.tenants[0]?.name : a.tenants?.name) ?? "Tenant"}</span>
                      {" · "}
                      {a.type.startsWith("pm_alert_day")
                        ? `PM alerted (Day ${a.type.replace("pm_alert_day", "")} tier)`
                        : (INTERVENTION_LABELS[a.type] ?? a.type)}
                    </div>
                    <div className="text-[#4b5563] text-xs mt-0.5">{timeAgo(a.sent_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
