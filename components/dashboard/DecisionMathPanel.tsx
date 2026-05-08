import { AlertTriangle, Clock3, DollarSign } from "lucide-react"
import type { RiskResult } from "@/lib/risk-engine"
import type { EconomicsResult } from "@/lib/eviction-economics"
import { buildCollectionDecisionMath } from "@/lib/collection-decision"
import CalculationExplainer from "@/components/dashboard/CalculationExplainer"

type Props = {
  balanceDue: number
  rentAmount: number
  rentDueDay?: number | null
  leaseGraceDays?: number | null
  risk: RiskResult
  economics: EconomicsResult
  state?: string | null
  compact?: boolean
}

function fmt(value: number) {
  return `$${Math.max(0, Math.round(value)).toLocaleString()}`
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function rentProrationFormula(monthlyRent: number, asOfDate: Date, dayCount: number) {
  const groups = new Map<number, number>()

  for (let offset = 1; offset <= dayCount; offset += 1) {
    const days = daysInMonth(addDays(asOfDate, offset))
    groups.set(days, (groups.get(days) ?? 0) + 1)
  }

  return Array.from(groups.entries())
    .map(([monthDays, days]) => `${fmt(monthlyRent)} / ${monthDays} days x ${days} day${days === 1 ? "" : "s"}`)
    .join(" + ")
}

export default function DecisionMathPanel({
  balanceDue,
  rentAmount,
  rentDueDay,
  leaseGraceDays,
  risk,
  economics,
  state,
  compact = false,
}: Props) {
  const monthsOwed = rentAmount > 0 ? balanceDue / rentAmount : 0
  const asOfDate = new Date()
  const math = buildCollectionDecisionMath({
    balanceDue,
    rentAmount,
    monthsOwed,
    rentDueDay: rentDueDay ?? 1,
    leaseGraceDays: leaseGraceDays ?? 0,
    asOfDate,
    risk,
    economics,
    state,
  })

  if (balanceDue <= 0 || risk.tier === "healthy") return null

  const facts = [
    { icon: DollarSign, label: "Ledger balance", value: fmt(balanceDue), sub: `${Math.round(monthsOwed * 10) / 10}mo owed` },
    { icon: Clock3, label: "Rent at risk", value: fmt(math.nextFourteenDayRentExposure), sub: "next 14 days" },
  ]
  const explainerSections = [
    {
      title: "Ledger balance",
      body: `Formula: ledger balance = balance_due from the latest tenant ledger/import. Current value: ${fmt(balanceDue)}. It is exact only to the quality and date of that ledger.`,
    },
    {
      title: "Rent at risk",
      body: "Formula: add the daily rent value for each of the next 14 calendar days. Daily rent is monthly rent divided by the number of days in that specific calendar month. This is not a late fee or guaranteed loss.",
      items: [
        `Monthly rent: ${fmt(rentAmount)}`,
        `Calculation: ${rentProrationFormula(rentAmount, asOfDate, 14)}`,
        `Next 14-day rent exposure: ${fmt(math.nextFourteenDayRentExposure)}`,
      ],
    },
    {
      title: "Action trigger",
      body: `The recommendation is anchored to ${math.primaryTrigger}, rent due day ${math.rentDueDay}, and the current stage: ${math.rentCycleStage}.`,
    },
  ]

  return (
    <div className={`rounded-xl border border-white/[0.07] bg-white/[0.02] ${compact ? "px-3 py-2.5 mb-3" : "p-4 mb-5"}`}>
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle size={11} className="text-[#6b7280]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-white text-sm font-semibold">Why this action</div>
              <div className="text-[#6b7280] text-xs mt-0.5">
                {math.primaryTrigger} · rent due day {math.rentDueDay} · grace {math.leaseGraceDays}d · {math.rentCycleStage}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!compact && (
                <div className="text-right text-[11px] text-[#4b5563]">
                  {math.daysUntilNextRentDue}d until next rent due
                </div>
              )}
              <CalculationExplainer
                compact
                sections={explainerSections}
                note="These numbers support collection decisions; they do not replace ledger reconciliation or legal review."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            {facts.map(({ icon: Icon, label, value, sub }) => (
              <div key={label} className="rounded-lg bg-[#0d1117]/70 border border-white/[0.06] px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-[#4b5563] text-[10px] uppercase tracking-wide">
                  <Icon size={10} />
                  {label}
                </div>
                <div className="text-white text-sm font-semibold tabular-nums mt-1">{value}</div>
                <div className="text-[#4b5563] text-[10px] mt-0.5">{sub}</div>
              </div>
            ))}
          </div>

          {!compact && (
            <div className="mt-3">
              <p className="text-[#9ca3af] text-xs leading-relaxed max-w-2xl">
                RentSentry is recommending <span className="text-white">{math.recommendedDefault}</span> because the verified ledger balance is unresolved and the current trigger is <span className="text-white">{math.primaryTrigger}</span>. Rent at risk is calendar-prorated, not a fee.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
