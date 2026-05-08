import type { RiskResult } from "./risk-engine"
import type { EconomicsResult } from "./eviction-economics"

type SituationSignals = {
  hasActivePromise?: boolean
  hasHardship?: boolean
  hasRepairDispute?: boolean
  hasBrokenPromise?: boolean
  hasNoResponse?: boolean
}

type DecisionMathInput = {
  balanceDue: number
  rentAmount: number
  monthsOwed: number
  rentDueDay?: number
  leaseGraceDays?: number
  asOfDate?: Date
  risk: RiskResult
  economics: EconomicsResult
  state?: string | null
  situation?: SituationSignals
}

function money(value: number) {
  return `$${Math.max(0, Math.round(value)).toLocaleString()}`
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function calculateRentEquivalentExposure(monthlyRent: number, asOfDate: Date, days: number) {
  if (monthlyRent <= 0 || days <= 0) return 0

  let exposure = 0
  for (let offset = 1; offset <= days; offset += 1) {
    const date = addDays(asOfDate, offset)
    exposure += monthlyRent / daysInMonth(date)
  }
  return exposure
}

function estimatePaymentPlanSuccess(input: DecisionMathInput) {
  const { monthsOwed, risk, situation } = input
  let probability = 0.50

  if (monthsOwed >= 2) probability -= 0.10
  if (monthsOwed >= 3) probability -= 0.15
  if (risk.tenant_pattern === "repeat_offender") probability -= 0.15
  if (situation?.hasActivePromise) probability += 0.15
  if (situation?.hasHardship) probability += 0.10
  if (situation?.hasBrokenPromise) probability -= 0.20
  if (situation?.hasNoResponse) probability -= 0.20
  if (situation?.hasRepairDispute) probability -= 0.10

  return Math.min(0.75, Math.max(0.10, probability))
}

export function buildCollectionDecisionMath(input: DecisionMathInput) {
  const { balanceDue, rentAmount, monthsOwed, risk, economics, state, situation } = input
  const asOfDate = input.asOfDate ?? new Date()
  const rentDueDay = input.rentDueDay ?? 1
  const leaseGraceDays = input.leaseGraceDays ?? 0
  const currentDay = asOfDate.getDate()
  const currentMonthDueDate = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), rentDueDay)
  const daysSinceCurrentDueDate = Math.max(0, Math.floor((asOfDate.getTime() - currentMonthDueDate.getTime()) / 86400000))
  const fullRentCyclesUnpaid = rentAmount > 0 ? Math.floor(balanceDue / rentAmount) : 0
  const nextDueDate = currentDay <= rentDueDay
    ? currentMonthDueDate
    : new Date(asOfDate.getFullYear(), asOfDate.getMonth() + 1, rentDueDay)
  const daysUntilNextRentDue = Math.ceil((nextDueDate.getTime() - asOfDate.getTime()) / 86400000)
  const rentCycleStage = (() => {
    if (balanceDue <= 0) return "current"
    if (fullRentCyclesUnpaid >= 2) return "multiple rent cycles unpaid"
    if (daysSinceCurrentDueDate <= leaseGraceDays) return "lease grace period"
    if (daysSinceCurrentDueDate <= 4) return "early grace/reminder window"
    if (daysSinceCurrentDueDate <= 10) return "firm follow-up window"
    if (daysSinceCurrentDueDate <= 20) return "formal notice prep window"
    return "late-cycle escalation window"
  })()
  const weeklyRent = calculateRentEquivalentExposure(rentAmount, asOfDate, 7)
  const twoWeekDelayCost = calculateRentEquivalentExposure(rentAmount, asOfDate, 14)
  const oneMonthDelayCost = rentAmount
  const paymentPlanSuccess = estimatePaymentPlanSuccess(input)
  const minimumUpfront = Math.min(balanceDue, Math.max(rentAmount, balanceDue * 0.5))
  const remainingAfterUpfront = Math.max(0, balanceDue - minimumUpfront)
  const installmentCount = remainingAfterUpfront > rentAmount ? 2 : remainingAfterUpfront > 0 ? 1 : 0
  const installmentAmount = installmentCount > 0 ? Math.ceil(remainingAfterUpfront / installmentCount) : 0
  const projectedExposureIfWaitMonth = balanceDue + oneMonthDelayCost
  const projectedExposureIfEviction = balanceDue + economics.blendedEviction
  const paymentPlanExpectedShortfall = balanceDue * (1 - paymentPlanSuccess)
  const formalNoticeIsFloor = risk.tier === "pay_or_quit" || risk.tier === "legal" || fullRentCyclesUnpaid >= 1

  const recommendedDefault = (() => {
    if (balanceDue <= 0) return "No collection escalation"
    if (situation?.hasRepairDispute) return "Document repair/access issue before formal escalation"
    if (risk.tier === "legal") return "Prepare legal packet / attorney review"
    if (risk.tier === "cash_for_keys") return "Compare Cash for Keys against eviction"
    if (formalNoticeIsFloor) return "Review & Send Pay or Quit Notice"
    if (risk.tier === "payment_plan") return "Offer structured payment plan with upfront money"
    return risk.recommended_action || "Log situation and monitor"
  })()

  const primaryTrigger = (() => {
    if (balanceDue <= 0) return "no balance due"
    if (situation?.hasRepairDispute) return "repair/access dispute logged"
    if (situation?.hasHardship) return "hardship logged"
    if (situation?.hasActivePromise) return "active payment promise logged"
    if (fullRentCyclesUnpaid >= 2) return `${fullRentCyclesUnpaid} full rent cycles unpaid`
    if (risk.tier === "pay_or_quit") return "formal notice threshold reached"
    if (risk.tier === "payment_plan") return "balance requires structured repayment"
    return rentCycleStage
  })()

  const lines = [
    `Default action: ${recommendedDefault}.`,
    `Exact trigger: ${primaryTrigger}.`,
    `Rent-cycle anchor: rent is due on day ${rentDueDay}; lease grace period is ${leaseGraceDays} day${leaseGraceDays === 1 ? "" : "s"}; today is day ${currentDay}; current stage is ${rentCycleStage}.`,
    `Full rent cycles unpaid: ${fullRentCyclesUnpaid}; next rent due date is in ${daysUntilNextRentDue} day${daysUntilNextRentDue === 1 ? "" : "s"}.`,
    `Verified ledger balance: ${money(balanceDue)} owed (${Math.round(monthsOwed * 10) / 10} months of rent).`,
    `Rent-equivalent exposure: if no payment is collected and the unit remains occupied, the next 7 days represent ${money(weeklyRent)} of rent and the next 14 days represent ${money(twoWeekDelayCost)}. This is prorated by calendar days, not a fee or guaranteed loss.`,
    `Payment plan test: require at least ${money(minimumUpfront)} upfront; estimated completion probability is ${pct(paymentPlanSuccess)}, leaving about ${money(paymentPlanExpectedShortfall)} at risk if it fails.`,
    `Recommended payment-plan terms: ${money(minimumUpfront)} upfront due within 48 hours${installmentCount > 0 ? `, then ${installmentCount} installment${installmentCount > 1 ? "s" : ""} of about ${money(installmentAmount)} due within 14 days` : ""}.`,
    `Payment-plan trigger: if upfront money is missed or any installment is late, move to Pay or Quit / legal escalation immediately; do not renegotiate open-ended terms.`,
    `Pay-or-Quit rationale: starts the legal clock while still giving the tenant a chance to cure; strongest when no hardship, repair dispute, or credible payment promise is logged.`,
    `CFK benchmark: estimated ${money(economics.cfk.total)} total over ~${economics.cfk.weeksTotal} weeks with a ${money(economics.cfk.offerAmount)} offer.`,
    `Eviction exposure estimate: ${money(projectedExposureIfEviction)} including current arrears plus modeled eviction costs; court path alone is about ${money(economics.blendedEviction)} before existing arrears.`,
    `If the PM waits one full rent cycle with no payment, ledger exposure rises to about ${money(projectedExposureIfWaitMonth)} before legal, turnover, or damage costs.`,
  ]

  return {
    recommendedDefault,
    paymentPlanSuccess,
    minimumUpfront,
    installmentCount,
    installmentAmount,
    weeklyRent: Math.round(weeklyRent),
    nextSevenDayRentExposure: Math.round(weeklyRent),
    nextFourteenDayRentExposure: Math.round(twoWeekDelayCost),
    rentDueDay,
    leaseGraceDays,
    currentDay,
    daysSinceCurrentDueDate,
    fullRentCyclesUnpaid,
    daysUntilNextRentDue,
    rentCycleStage,
    primaryTrigger,
    twoWeekDelayCost: Math.round(twoWeekDelayCost),
    projectedExposureIfWaitMonth: Math.round(projectedExposureIfWaitMonth),
    projectedExposureIfEviction: Math.round(projectedExposureIfEviction),
    state: state ?? "national averages",
    summary: lines.join("\n"),
  }
}
