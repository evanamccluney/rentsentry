export type RiskScore = 'green' | 'yellow' | 'red'

export type RiskTier =
  | 'healthy'        // No issues — all good
  | 'watch'          // Predictive — act before the 1st
  | 'reminder'       // Day 5-15: first/second offense, gentle nudge
  | 'payment_plan'   // Day 15-25: some history, offer structured plan
  | 'pay_or_quit'    // Day 20-25: legal notice required (attorney)
  | 'cash_for_keys'  // Day 35-45: offer cash to vacate vs court
  | 'legal'          // Day 35+: file Unlawful Detainer (attorney)

export interface TenantRiskInput {
  days_late_avg: number
  late_payment_count: number
  previous_delinquency: boolean
  card_expiry?: string        // 'MM/YY' — optional, future integration only
  payment_method?: string
  balance_due: number
  rent_amount: number
  last_payment_date?: string  // ISO date — used to estimate days past due
}

export interface RiskResult {
  score: RiskScore
  tier: RiskTier
  recommended_action: string
  action_type: string
  reasons: string[]
  days_past_due: number       // estimated days since rent was last due
  late_fee: number            // 5% of rent if past grace period
  requires_attorney: boolean  // true for pay_or_quit and legal
}

// card_expiry is optional and used only as a bonus signal if present
function cardExpiresWithinDays(expiry: string, days: number): boolean {
  try {
    const [month, year] = expiry.split('/').map(Number)
    if (!month || !year) return false
    const expiryDate = new Date(2000 + year, month - 1, 1)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + days)
    return expiryDate <= cutoff
  } catch { return false }
}

function estimateDaysPastDue(lastPaymentDate?: string): number {
  if (!lastPaymentDate) return 0
  try {
    const last = new Date(lastPaymentDate)
    const now = new Date()
    // First of the current month — that's when rent was due
    const rentDueThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    // If last payment was before this month's due date, they may be behind
    if (last < rentDueThisMonth) {
      return Math.floor((now.getTime() - rentDueThisMonth.getTime()) / (1000 * 60 * 60 * 24))
    }
    return 0
  } catch { return 0 }
}

export function scoreTenant(t: TenantRiskInput): RiskResult {
  const {
    balance_due, rent_amount, late_payment_count,
    previous_delinquency, days_late_avg, card_expiry,
    payment_method, last_payment_date,
  } = t

  const monthsOwed = rent_amount > 0 ? balance_due / rent_amount : 0
  const daysPastDue = estimateDaysPastDue(last_payment_date)
  const lateFee = balance_due > 0 && daysPastDue > 5 ? Math.round(rent_amount * 0.05) : 0
  const repeatOffender = previous_delinquency || late_payment_count >= 5
  const hasHistory = late_payment_count >= 2 || days_late_avg >= 3
  const noPaymentMethod = !payment_method || payment_method === 'unknown'

  // ── LEGAL — File Unlawful Detainer ─────────────────────────────────────────
  // 2+ months owed + repeat offender, OR 3+ months regardless
  if (monthsOwed >= 3 || (monthsOwed >= 2 && repeatOffender)) {
    const reasons: string[] = []
    reasons.push(`${Math.round(monthsOwed * 10) / 10} months rent outstanding ($${balance_due.toLocaleString()})`)
    if (previous_delinquency) reasons.push('Prior eviction or delinquency on record')
    if (late_payment_count >= 5) reasons.push(`${late_payment_count} late payments — established pattern`)
    return {
      score: 'red', tier: 'legal',
      recommended_action: 'File Unlawful Detainer',
      action_type: 'legal_packet',
      reasons, days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: true,
    }
  }

  // ── CASH FOR KEYS — Day 35-45 ──────────────────────────────────────────────
  // 1-2 months owed — cheaper than going to court
  if (monthsOwed >= 1 || (previous_delinquency && balance_due > 0)) {
    const reasons: string[] = []
    reasons.push(`$${balance_due.toLocaleString()} outstanding (${Math.round(monthsOwed * 10) / 10} month${monthsOwed >= 2 ? 's' : ''})`)
    if (previous_delinquency) reasons.push('Prior delinquency — high re-offense risk')
    if (daysPastDue > 30) reasons.push(`${daysPastDue} days since last payment`)
    return {
      score: 'red', tier: 'cash_for_keys',
      recommended_action: 'Offer Cash for Keys',
      action_type: 'cash_for_keys',
      reasons, days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: false,
    }
  }

  // ── PAY OR QUIT — Day 20-25 ────────────────────────────────────────────────
  // Partial balance + strong history = legal notice time
  if (balance_due > 0 && (repeatOffender || (late_payment_count >= 4 || days_late_avg >= 7))) {
    const reasons: string[] = []
    reasons.push(`$${balance_due.toLocaleString()} outstanding (${daysPastDue > 0 ? `${daysPastDue} days past due` : 'balance due'})`)
    if (late_payment_count >= 4) reasons.push(`${late_payment_count} late payments — chronic pattern`)
    if (previous_delinquency) reasons.push('Prior eviction on record')
    return {
      score: 'red', tier: 'pay_or_quit',
      recommended_action: 'Issue Pay or Quit Notice',
      action_type: 'cash_for_keys',
      reasons, days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: true,
    }
  }

  // ── PAYMENT PLAN — Day 15-25 ───────────────────────────────────────────────
  // Partial balance, some history — structured repayment beats court
  if (balance_due > 0 && hasHistory) {
    const reasons: string[] = []
    reasons.push(`$${balance_due.toLocaleString()} outstanding`)
    if (late_payment_count >= 2) reasons.push(`${late_payment_count} late payments in history`)
    if (days_late_avg >= 3) reasons.push(`Averages ${days_late_avg} days late`)
    return {
      score: 'red', tier: 'payment_plan',
      recommended_action: 'Offer Payment Plan',
      action_type: 'split_pay_offer',
      reasons, days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: false,
    }
  }

  // ── REMINDER — Day 5-15, first/second offense ─────────────────────────────
  // Balance but clean history — gentle nudge works 90%+ of the time
  if (balance_due > 0) {
    const reasons: string[] = []
    reasons.push(`$${balance_due.toLocaleString()} outstanding`)
    if (late_payment_count <= 1) reasons.push('First or second occurrence — likely an oversight')
    return {
      score: 'yellow', tier: 'reminder',
      recommended_action: 'Send Friendly Reminder',
      action_type: 'payment_reminder',
      reasons, days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: false,
    }
  }

  // ── WATCH — Predictive, no current balance ─────────────────────────────────
  // Behavior signals indicate risk before the 1st — act proactively
  const watchReasons: string[] = []

  // Primary signals: behavior-based (always available from CSV)
  if (late_payment_count >= 3)
    watchReasons.push(`${late_payment_count} late payments — likely to be late this month`)
  if (days_late_avg >= 3)
    watchReasons.push(`Averages ${days_late_avg} days late — proactive reminder recommended`)
  if (noPaymentMethod)
    watchReasons.push('No payment method confirmed — payment not guaranteed')

  // Bonus signal: card expiry data if available from payment processor integration
  if (card_expiry) {
    if (cardExpiresWithinDays(card_expiry, 7))
      watchReasons.push('Payment card expiring within 7 days')
    else if (cardExpiresWithinDays(card_expiry, 30))
      watchReasons.push('Payment card expiring within 30 days')
  }

  if (watchReasons.length > 0) {
    return {
      score: 'yellow', tier: 'watch',
      recommended_action: noPaymentMethod ? 'Confirm Payment Method' : 'Send Proactive Reminder',
      action_type: 'proactive_reminder',
      reasons: watchReasons,
      days_past_due: 0, late_fee: 0,
      requires_attorney: false,
    }
  }

  // ── HEALTHY ────────────────────────────────────────────────────────────────
  return {
    score: 'green', tier: 'healthy',
    recommended_action: '', action_type: '',
    reasons: ['On-time payment history — no risk signals detected'],
    days_past_due: 0, late_fee: 0,
    requires_attorney: false,
  }
}
