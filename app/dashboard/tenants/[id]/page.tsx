import { createClient } from "@/lib/supabase/server"
import { scoreTenant } from "@/lib/risk-engine"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Scale, HandCoins, Bell, CalendarClock, FileText, CreditCard } from "lucide-react"
import TenantDetailActions from "@/components/dashboard/TenantDetailActions"
import TenantActivityLog from "@/components/dashboard/TenantActivityLog"

const TIER_CONFIG: Record<string, { label: string; dot: string; textColor: string; bg: string }> = {
  legal:        { label: "Eviction Recommended",        dot: "bg-red-500",     textColor: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
  pay_or_quit:  { label: "Pay or Quit Notice Ready",    dot: "bg-red-400",     textColor: "text-red-300",     bg: "bg-red-400/10 border-red-400/20" },
  cash_for_keys:{ label: "Offer Cash for Keys",      dot: "bg-orange-500",  textColor: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20" },
  payment_plan: { label: "Offer Payment Plan",       dot: "bg-amber-500",   textColor: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
  reminder:     { label: "Send Friendly Reminder",   dot: "bg-yellow-400",  textColor: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/20" },
  watch:        { label: "Act Before the 1st",       dot: "bg-blue-400",    textColor: "text-blue-400",    bg: "bg-blue-400/10 border-blue-400/20" },
  healthy:      { label: "Healthy",                  dot: "bg-emerald-500", textColor: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
}

const STATE_EVICTION_WEEKS: Record<string, number> = {
  TX: 6, AZ: 6, AL: 5, AR: 5, CO: 6, GA: 6, FL: 7, NC: 6, IN: 6, TN: 6,
  OH: 7, MO: 7, MI: 8, PA: 8, VA: 8, WA: 10, OR: 10, IL: 10, MD: 10, NJ: 12,
  NY: 16, CA: 20, MA: 16, CT: 14, VT: 20,
}

const INTERVENTION_LABELS: Record<string, string> = {
  payment_reminder:     "Payment reminder sent",
  proactive_reminder:   "Proactive reminder sent",
  payment_method_alert: "Payment method alert sent",
  split_pay_offer:      "Payment plan offered",
  cash_for_keys:        "Cash for Keys offered",
  legal_packet:         "Legal notice sent",
  // legacy types from earlier versions
  card_expiry_alert:    "Payment reminder sent",
  card_expiry_30:       "Payment reminder sent",
  card_expiry_7:        "Payment reminder sent",
  no_payment_method:    "Payment method alert sent",
}

const AVATAR_COLORS = [
  "bg-blue-500","bg-violet-500","bg-emerald-500","bg-orange-500",
  "bg-pink-500","bg-teal-500","bg-indigo-500","bg-amber-500","bg-cyan-500","bg-rose-500",
]
function avatarColor(name: string) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
}
function formatDate(iso?: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function daysUntil(iso?: string | null) {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: t } = await supabase
    .from("tenants")
    .select(`
      id, unit, name, email, phone,
      rent_amount, balance_due, rent_due_day,
      days_late_avg, late_payment_count, previous_delinquency,
      card_expiry, payment_method, last_payment_date,
      lease_start, lease_end, move_in_date,
      properties(name, id)
    `)
    .eq("id", id)
    .eq("user_id", user!.id)
    .single()

  if (!t) notFound()

  const { data: interventions } = await supabase
    .from("interventions")
    .select("id, type, sent_at, status, snapshot")
    .eq("tenant_id", t.id)
    .order("sent_at", { ascending: false })

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

  const tierCfg = TIER_CONFIG[risk.tier]
  const leaseExpiresDays = daysUntil(t.lease_end)

  const pmState = (t.properties as any)?.state ?? null
  const evictionWeeks = pmState ? (STATE_EVICTION_WEEKS[pmState.toUpperCase()] ?? 10) : 10
  const turnoverWeeks = 4 // avg weeks to clean, repair, and re-rent after eviction
  const totalWeeks = evictionWeeks + turnoverWeeks
  const rentAmount = t.rent_amount ?? 0
  const weeklyRent = Math.round(rentAmount / 4)
  const litigationCost = Math.round(weeklyRent * evictionWeeks)
  const turnoverCost = Math.round(weeklyRent * turnoverWeeks)
  const vacancyCost = litigationCost + turnoverCost
  const evictionTotal = 1500 + 500 + vacancyCost
  const cfkMin = Math.round(rentAmount * 0.5)
  const cfkMax = Math.round(rentAmount * 1.0)
  const showCostComparison = risk.days_past_due >= 10 && (t.balance_due ?? 0) > 0

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <Link href="/dashboard/tenants" className="inline-flex items-center gap-1.5 text-[#4b5563] hover:text-white text-sm transition-colors mb-6">
        <ArrowLeft size={14} /> Back to Tenants
      </Link>

      {/* Header */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full ${avatarColor(t.name)} flex items-center justify-center text-white text-lg font-bold shrink-0`}>
              {initials(t.name)}
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">{t.name}</h1>
              <div className="text-[#6b7280] text-sm mt-0.5">
                {(t.properties as any)?.name && <span>{(t.properties as any).name} · </span>}Unit {t.unit}
              </div>
              <div className="flex items-center gap-4 mt-1">
                {t.email && <span className="text-[#4b5563] text-xs">{t.email}</span>}
                {t.phone && <span className="text-[#4b5563] text-xs">{t.phone}</span>}
              </div>
            </div>
          </div>
          <TenantDetailActions tenant={{
            id: t.id,
            name: t.name,
            email: t.email,
            phone: t.phone,
            action_type: risk.action_type,
            recommended_action: risk.recommended_action,
            tier: risk.tier,
            balance_due: t.balance_due ?? 0,
            rent_amount: t.rent_amount ?? 0,
            days_past_due: risk.days_past_due,
            days_late_avg: t.days_late_avg ?? 0,
            late_payment_count: t.late_payment_count ?? 0,
            previous_delinquency: t.previous_delinquency ?? false,
            card_expiry: t.card_expiry,
            payment_method: t.payment_method,
            reasons: risk.reasons,
            late_fee: risk.late_fee,
            requires_attorney: risk.requires_attorney,
            property_name: (t.properties as any)?.name ?? null,
          }} />
        </div>

        {/* Risk tier badge */}
        <div className={`inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-lg border text-sm font-medium ${tierCfg.bg} ${tierCfg.textColor}`}>
          <span className={`w-2 h-2 rounded-full ${tierCfg.dot}`} />
          {tierCfg.label}
        </div>

        {/* Risk reasons */}
        {risk.reasons.length > 0 && (
          <div className="mt-3 space-y-1">
            {risk.reasons.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[#9ca3af] text-sm">
                <span className="w-1 h-1 rounded-full bg-[#374151] shrink-0" />
                {r}
              </div>
            ))}
          </div>
        )}

        {/* Why RentSentry recommends this */}
        {risk.narrative && risk.tier !== 'healthy' && (
          <div className="mt-4 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
            <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-1.5">Why this recommendation</div>
            <p className="text-[#9ca3af] text-sm leading-relaxed">{risk.narrative}</p>
          </div>
        )}

        {risk.requires_attorney && (
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 mt-4">
            <Scale size={12} className="text-[#9ca3af] shrink-0" />
            <span className="text-[#9ca3af] text-xs">Consult your attorney before proceeding</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { label: "Monthly Rent", value: `$${(t.rent_amount || 0).toLocaleString()}`, color: "text-white" },
          { label: "Balance Due",  value: `$${(t.balance_due || 0).toLocaleString()}`,  color: (t.balance_due || 0) > 0 ? "text-red-400" : "text-emerald-400" },
          { label: "Late Fee",     value: risk.late_fee > 0 ? `$${risk.late_fee}` : "—", color: risk.late_fee > 0 ? "text-orange-400" : "text-[#4b5563]" },
          { label: "Avg Days Late",value: `${t.days_late_avg ?? 0}d`, color: (t.days_late_avg ?? 0) > 5 ? "text-yellow-400" : "text-white" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#111827] border border-white/10 rounded-2xl p-4">
            <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">{label}</div>
            <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Lease + payment info */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-5">
        <h2 className="text-white font-semibold text-sm mb-4">Lease & Payment Info</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
          {[
            { label: "Lease Start",      value: formatDate(t.lease_start) },
            { label: "Lease End",        value: t.lease_end ? (
              <span className={leaseExpiresDays !== null && leaseExpiresDays <= 30 ? "text-orange-400" : leaseExpiresDays !== null && leaseExpiresDays <= 0 ? "text-red-400" : "text-white"}>
                {formatDate(t.lease_end)}
                {leaseExpiresDays !== null && leaseExpiresDays <= 60 && leaseExpiresDays > 0 && (
                  <span className="text-[#4b5563] text-xs ml-1">({leaseExpiresDays}d)</span>
                )}
                {leaseExpiresDays !== null && leaseExpiresDays <= 0 && (
                  <span className="text-red-400 text-xs ml-1">(expired)</span>
                )}
              </span>
            ) : "—" },
            { label: "Move-in Date",     value: formatDate(t.move_in_date) },
            { label: "Last Payment",     value: formatDate(t.last_payment_date) },
            { label: "Payment Method",   value: t.payment_method && t.payment_method !== "unknown" ? t.payment_method.toUpperCase() : "Unknown" },
            { label: "Card Expiry",      value: t.card_expiry || "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-1">{label}</div>
              <div className="text-white text-sm">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cost comparison — only for Day 10+ delinquent tenants */}
      {showCostComparison && (
        <div className="bg-[#111827] border border-orange-500/20 rounded-2xl p-5 mb-5">
          <h2 className="text-white font-semibold text-sm mb-1">Cost Comparison</h2>
          <p className="text-[#4b5563] text-xs mb-4">
            {risk.days_past_due} days past due · {pmState ? `${pmState} eviction timeline: ~${evictionWeeks} weeks in court + ~${turnoverWeeks} weeks turnover` : "Add a state to this property for an accurate estimate"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4">
              <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Eviction (court)</div>
              <div className="text-red-400 text-2xl font-bold mb-1">~${evictionTotal.toLocaleString()}</div>
              <div className="text-[#4b5563] text-xs space-y-0.5">
                <div>Attorney fees: ~$1,500</div>
                <div>Court costs: ~$500</div>
                <div>Lost rent during proceedings ({evictionWeeks} wks): ~${litigationCost.toLocaleString()}</div>
                <div>Vacancy after eviction ({turnoverWeeks} wks): ~${turnoverCost.toLocaleString()}</div>
              </div>
              <div className="mt-3 text-[#6b7280] text-xs">Total exposure: ~{totalWeeks} weeks · High risk of property damage</div>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4">
              <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Cash for Keys</div>
              <div className="text-emerald-400 text-2xl font-bold mb-1">${cfkMin.toLocaleString()}–${cfkMax.toLocaleString()}</div>
              <div className="text-[#4b5563] text-xs space-y-0.5">
                <div>Suggested offer: 50–100% of one month's rent</div>
                <div>Tenant vacates voluntarily</div>
                <div>Unit stays in better condition</div>
              </div>
              <div className="mt-3 text-[#6b7280] text-xs">Timeline: 3–7 days · Low risk · No court needed</div>
            </div>
          </div>
          <p className="text-[#374151] text-xs mt-4">
            RentSentry will never automatically send legal notices. Review this comparison and decide what's right for this tenant.
          </p>
        </div>
      )}

      {/* Activity log */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-sm">Activity Log</h2>
          {interventions && interventions.some((a: { snapshot?: unknown }) => a.snapshot) && (
            <span className="text-[#2e3a50] text-xs">Click &ldquo;Why&rdquo; on any entry to see the risk snapshot</span>
          )}
        </div>
        <TenantActivityLog interventions={interventions || []} />
      </div>
    </div>
  )
}
