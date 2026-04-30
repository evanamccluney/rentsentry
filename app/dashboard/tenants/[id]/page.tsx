import { createClient } from "@/lib/supabase/server"
import { scoreTenant } from "@/lib/risk-engine"
import { calculateEconomics } from "@/lib/eviction-economics"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Scale, HandCoins, Bell, CalendarClock, FileText, CreditCard, TrendingDown, AlertTriangle } from "lucide-react"
import TenantDetailActions from "@/components/dashboard/TenantDetailActions"
import TenantActionsPanel from "@/components/dashboard/TenantActionsPanel"
import TenantActivityLog from "@/components/dashboard/TenantActivityLog"
import EscalationDecisionBanner from "@/components/dashboard/EscalationDecisionBanner"
import TenantNotes from "@/components/dashboard/TenantNotes"
import TenantStatusPicker from "@/components/dashboard/TenantStatusPicker"
import HardshipButton from "@/components/dashboard/HardshipButton"
import TenantAIChat from "@/components/dashboard/TenantAIChat"
import GenerateCFKLetter from "@/components/dashboard/GenerateCFKLetter"
import EscalationTimeline from "@/components/dashboard/EscalationTimeline"
import LeaseRenewalButton from "@/components/dashboard/LeaseRenewalButton"
import PaymentPlanTracker from "@/components/dashboard/PaymentPlanTracker"
import CfkFollowUpBanner from "@/components/dashboard/CfkFollowUpBanner"

const TIER_CONFIG: Record<string, { label: string; dot: string; textColor: string; bg: string }> = {
  legal:        { label: "Eviction Recommended",     dot: "bg-red-500",     textColor: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
  pay_or_quit:  { label: "Pay or Quit Notice Ready", dot: "bg-red-400",     textColor: "text-red-300",     bg: "bg-red-400/10 border-red-400/20" },
  cash_for_keys:{ label: "Offer Cash for Keys",      dot: "bg-orange-500",  textColor: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20" },
  payment_plan: { label: "Offer Payment Plan",       dot: "bg-amber-500",   textColor: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
  reminder:     { label: "Send Friendly Reminder",   dot: "bg-yellow-400",  textColor: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/20" },
  watch:        { label: "Act Before the 1st",       dot: "bg-blue-400",    textColor: "text-blue-400",    bg: "bg-blue-400/10 border-blue-400/20" },
  healthy:      { label: "Healthy",                  dot: "bg-emerald-500", textColor: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
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
  pre_due_urgent:       "Urgent pre-due reminder sent",
  pre_due_delinquent_warning: "Pre-due balance warning sent",
  hardship_checkin:     "Hardship check-in logged",
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
      lease_start, lease_end, move_in_date, notes, resolution_status,
      properties(name, id, state)
    `)
    .eq("id", id)
    .eq("user_id", user!.id)
    .single()

  if (!t) notFound()

  const { data: interventions } = await supabase
    .from("interventions")
    .select("id, type, sent_at, status, notes, snapshot")
    .eq("tenant_id", t.id)
    .order("sent_at", { ascending: false })

  // Payment plan tracker data
  const activePlan = interventions?.find(i => i.type === "payment_plan_agreed")
  let planInstallments: { amount: number; due_date: string }[] = []
  let planPaidIndices: number[] = []
  let planTotalAmount = 0
  let planFrequency = "monthly"

  if (activePlan?.snapshot && (activePlan.snapshot as { installments?: unknown }).installments) {
    const snap = activePlan.snapshot as { installments: { amount: number; due_date: string }[]; total_plan_amount?: number; frequency?: string }
    planInstallments = snap.installments
    planTotalAmount = snap.total_plan_amount ?? 0
    planFrequency = snap.frequency ?? "monthly"

    const { data: installmentPayments } = await supabase
      .from("payments")
      .select("note")
      .eq("tenant_id", t.id)
      .like("note", "installment:%")

    planPaidIndices = (installmentPayments ?? [])
      .map(p => parseInt((p.note as string).split(":")[1]))
      .filter(n => !isNaN(n))
  }

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
  const rentAmount = t.rent_amount ?? 0
  const monthsOwed = rentAmount > 0 ? (t.balance_due ?? 0) / rentAmount : 0

  const econ = calculateEconomics({
    rentAmount,
    monthsOwed,
    previousDelinquency: t.previous_delinquency ?? false,
    latePaymentCount: t.late_payment_count ?? 0,
    state: pmState,
  })

  const showCostComparison = risk.days_past_due >= 10 && (t.balance_due ?? 0) > 0

  const showEscalationBanner = monthsOwed >= 1.5

  // CFK follow-up: offer sent 5+ days ago, balance still outstanding, no accepted/resolved status after
  const lastCfk = interventions?.find(i => i.type === "cash_for_keys")
  const daysSinceCfk = lastCfk
    ? Math.floor((Date.now() - new Date(lastCfk.sent_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0
  const showCfkFollowUp = !!lastCfk && daysSinceCfk >= 5 && (t.balance_due ?? 0) > 0

  // Days until next rent due date (for timeline + risk context)
  const daysUntilNextDue = (() => {
    const now = new Date()
    const dueDay = Math.min(Math.max(t.rent_due_day ?? 1, 1), 28)
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
    const target = thisMonth > now ? thisMonth : nextMonth
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  })()

  const tenantForActions = {
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
  }

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
          <div className="flex items-center gap-2 flex-wrap">
            {!showEscalationBanner && (
              <TenantDetailActions tenant={tenantForActions} />
            )}
            <HardshipButton tenantId={t.id} tenantName={t.name} />
            <TenantAIChat tenantId={t.id} tenantName={t.name} />
          </div>
        </div>

        {/* Risk tier badge + status picker */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium ${tierCfg.bg} ${tierCfg.textColor}`}>
            <span className={`w-2 h-2 rounded-full ${tierCfg.dot}`} />
            {tierCfg.label}
          </div>
          <TenantStatusPicker tenantId={t.id} initialStatus={(t as any).resolution_status ?? null} />
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
        {risk.narrative && risk.tier !== 'healthy' && !showEscalationBanner && (
          <div className="mt-4 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
            <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-1.5">Why this recommendation</div>
            <p className="text-[#9ca3af] text-sm leading-relaxed">{risk.narrative}</p>
          </div>
        )}

        {risk.requires_attorney && !showEscalationBanner && (
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 mt-4">
            <Scale size={12} className="text-[#9ca3af] shrink-0" />
            <span className="text-[#9ca3af] text-xs">Consult your attorney before proceeding</span>
          </div>
        )}
      </div>

      {/* Quick actions panel */}
      <TenantActionsPanel tenant={tenantForActions} />

      {/* Payment plan tracker */}
      {planInstallments.length > 0 && (
        <PaymentPlanTracker
          tenantId={t.id}
          installments={planInstallments}
          paidIndices={planPaidIndices}
          totalPlanAmount={planTotalAmount}
          frequency={planFrequency}
        />
      )}

      {/* Escalation path timeline */}
      <EscalationTimeline
        currentTier={risk.tier}
        daysPastDue={risk.days_past_due}
        daysUntilDue={(t.balance_due ?? 0) === 0 ? daysUntilNextDue : undefined}
        tenantPattern={risk.tenant_pattern}
      />

      {/* Escalation banner — 1.5+ months owed */}
      {showEscalationBanner && (
        <EscalationDecisionBanner
          tenant={tenantForActions}
          econ={econ}
          propertyState={pmState}
        />
      )}

      {/* CFK ignored follow-up */}
      {showCfkFollowUp && (
        <CfkFollowUpBanner
          daysSinceCfk={daysSinceCfk}
          tenantName={t.name}
          state={pmState}
        />
      )}

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-sm">Lease & Payment Info</h2>
          {t.lease_end && (leaseExpiresDays === null || leaseExpiresDays <= 60) && (
            <LeaseRenewalButton
              tenantId={t.id}
              tenantName={t.name}
              currentLeaseEnd={t.lease_end}
              currentRent={t.rent_amount}
            />
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6">
          {[
            { label: "Lease Start",    value: formatDate(t.lease_start) },
            { label: "Lease End",      value: t.lease_end ? (
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
            { label: "Move-in Date",   value: formatDate(t.move_in_date) },
            { label: "Last Payment",   value: formatDate(t.last_payment_date) },
            { label: "Payment Method", value: t.payment_method && t.payment_method !== "unknown" ? t.payment_method.toUpperCase() : "Unknown" },
            { label: "Card Expiry",    value: t.card_expiry || "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-1">{label}</div>
              <div className="text-white text-sm">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cost comparison — Day 10+ delinquent, not already showing escalation banner */}
      {showCostComparison && !showEscalationBanner && (
        <div className="bg-[#111827] border border-orange-500/20 rounded-2xl p-5 mb-5">
          {/* RentSentry recommendation header */}
          <div className={`flex items-start gap-3 mb-5 p-4 rounded-xl border ${
            econ.recommendation === "cfk"
              ? "bg-emerald-500/5 border-emerald-500/20"
              : "bg-red-500/5 border-red-500/20"
          }`}>
            <TrendingDown size={16} className={econ.recommendation === "cfk" ? "text-emerald-400 shrink-0 mt-0.5" : "text-red-400 shrink-0 mt-0.5"} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-semibold text-sm">
                  RentSentry recommends: {econ.recommendation === "cfk" ? "Cash for Keys" : "Pursue Eviction"}
                </span>
                <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                  econ.recommendationStrength === "strong" ? "bg-white/10 text-white" :
                  econ.recommendationStrength === "moderate" ? "bg-yellow-500/15 text-yellow-400" :
                  "bg-white/5 text-[#6b7280]"
                }`}>
                  {econ.recommendationStrength === "strong" ? "Strong" : econ.recommendationStrength === "moderate" ? "Moderate" : "Close call"}
                </span>
              </div>
              <ul className="space-y-1">
                {econ.reasoning.map((r, i) => (
                  <li key={i} className="text-[#9ca3af] text-xs flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-[#374151] shrink-0 mt-1.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Cost Breakdown</h2>
            <span className="text-[#4b5563] text-xs">
              {pmState ? `${pmState} · ~${econ.uncontested.lostRentWeeks}wk uncontested` : "No state set — using national averages"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {/* Eviction column */}
            <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4">
              <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Eviction (court)</div>
              <div className="text-red-400 text-2xl font-bold mb-3">~${econ.blendedEviction.toLocaleString()}</div>
              <div className="space-y-1.5 text-xs">
                {[
                  { label: "Court filing + service", val: econ.uncontested.courtFee },
                  { label: "Attorney fees (uncontested)", val: econ.uncontested.attorneyFee },
                  { label: "Sheriff / lockout fee", val: econ.uncontested.lockoutFee },
                  { label: `Lost rent (${econ.uncontested.lostRentWeeks} wks in court)`, val: econ.uncontested.lostRent },
                  { label: `Turnover after eviction (~${econ.uncontested.turnoverWeeks} wks)`, val: econ.uncontested.turnoverCost },
                  { label: "Damage risk (expected value)", val: econ.uncontested.damagePremium },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between text-[#4b5563]">
                    <span>{label}</span>
                    <span className="tabular-nums text-[#6b7280]">~${val.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {econ.uncontested.total !== econ.blendedEviction && (
                <div className="mt-3 pt-2 border-t border-white/5 text-[10px] text-[#374151]">
                  Includes {Math.round(econ.uncontested ? 0 : 0)}% contested risk premium · contested case: ~${econ.contested.total.toLocaleString()}
                </div>
              )}
              <div className="mt-2 text-[#4b5563] text-[11px]">
                Timeline: ~{Math.round(econ.uncontested.weeksTotal)} weeks · damage risk: moderate–high
              </div>
            </div>

            {/* CFK column */}
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4">
              <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Cash for Keys</div>
              <div className="text-emerald-400 text-2xl font-bold mb-3">~${econ.cfk.total.toLocaleString()}</div>
              <div className="space-y-1.5 text-xs">
                {[
                  { label: "Cash offer to tenant", val: econ.cfk.offerAmount },
                  { label: `Lost rent while vacating (~${econ.cfk.vacateWeeks} wks)`, val: econ.cfk.vacateRentLoss },
                  { label: `Standard turnover (~${econ.cfk.turnoverWeeks} wks)`, val: econ.cfk.turnoverCost },
                  { label: "Damage risk", val: 0, note: "Near zero — tenant motivated to leave clean" },
                ].map(({ label, val, note }) => (
                  <div key={label} className="flex items-center justify-between text-[#4b5563]">
                    <span>{label}</span>
                    <span className="tabular-nums text-[#6b7280]">{val === 0 && note ? <span className="text-emerald-600 text-[10px]">{note}</span> : `~$${val.toLocaleString()}`}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[#4b5563] text-[11px]">
                Timeline: ~{Math.round(econ.cfk.weeksTotal)} weeks · damage risk: low
              </div>
              <div className="mt-2 text-[10px] text-[#374151]">
                Max offer where CFK still saves money: <span className="text-white">${econ.breakEvenOffer.toLocaleString()}</span>
              </div>
              {econ.recommendation === "cfk" && (
                <div className="mt-3 pt-2 border-t border-white/5">
                  <GenerateCFKLetter
                    tenantId={t.id}
                    tenantName={t.name}
                    defaultOfferAmount={econ.cfk.offerAmount}
                  />
                </div>
              )}
            </div>
          </div>

          {econ.cfkSavings > 0 ? (
            <div className="flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/15 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle size={12} className="text-emerald-400 shrink-0" />
              <span className="text-emerald-400 text-xs font-medium">
                CFK saves an estimated <span className="font-bold">${econ.cfkSavings.toLocaleString()}</span> vs eviction — max viable offer is ${econ.breakEvenOffer.toLocaleString()}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/15 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle size={12} className="text-red-400 shrink-0" />
              <span className="text-red-400 text-xs font-medium">
                Eviction may cost less than CFK in this situation — review carefully
              </span>
            </div>
          )}

          <p className="text-[#374151] text-xs">
            Estimates based on {pmState ?? "national"} averages. Attorney fees and timelines vary. RentSentry never auto-sends legal notices — you review every action.
          </p>
        </div>
      )}

      {/* Notes */}
      <TenantNotes tenantId={t.id} initialNotes={(t as any).notes ?? null} />

      {/* Activity log */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-sm">Activity Log</h2>
          <div className="flex items-center gap-3">
            {interventions && interventions.some((a: { snapshot?: unknown }) => a.snapshot) && (
              <span className="text-[#2e3a50] text-xs hidden sm:block">Click &ldquo;Why&rdquo; on any entry to see the risk snapshot</span>
            )}
            {interventions && interventions.length > 0 && (
              <a
                href={`/api/tenants/${t.id}/audit-export`}
                download
                className="flex items-center gap-1.5 text-xs text-[#4b5563] hover:text-white transition-colors"
              >
                <FileText size={12} />
                Export CSV
              </a>
            )}
          </div>
        </div>
        <TenantActivityLog interventions={interventions || []} />
      </div>
    </div>
  )
}
