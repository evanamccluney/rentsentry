export type RiskScore = 'green' | 'yellow' | 'red'

export type RiskTier =
  | 'healthy'        // No balance, no risk signals
  | 'watch'          // Predictive — act before the 1st
  | 'reminder'       // Day 1-14: first/second offense, gentle nudge
  | 'payment_plan'   // Day 15-25: some history or time pressure, structure repayment
  | 'pay_or_quit'    // Day 20-35: legal notice required
  | 'cash_for_keys'  // Day 35-45: offer cash to vacate vs court
  | 'legal'          // Day 45+: file Unlawful Detainer

export interface TenantRiskInput {
  days_late_avg: number
  late_payment_count: number
  previous_delinquency: boolean
  card_expiry?: string        // 'MM/YY' — optional, bonus signal
  payment_method?: string
  balance_due: number
  rent_amount: number
  last_payment_date?: string  // ISO date — used to compute days past due
  rent_due_day?: number       // day of month rent is due (default: 1)
}

export interface RiskResult {
  score: RiskScore
  tier: RiskTier
  recommended_action: string
  action_type: string
  reasons: string[]
  narrative: string           // Plain-English explanation of WHY this tier was assigned
  days_past_due: number
  late_fee: number
  requires_attorney: boolean
}

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

function estimateDaysPastDue(lastPaymentDate?: string, rentDueDay = 1): number {
  if (!lastPaymentDate) return 0
  try {
    const last = new Date(lastPaymentDate)
    const now = new Date()
    const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
    // Find the most recent due date that has already passed
    let rentDueThisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
    if (rentDueThisMonth > now) {
      // Due date hasn't happened yet this month — use last month's
      rentDueThisMonth = new Date(now.getFullYear(), now.getMonth() - 1, dueDay)
    }
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
    payment_method, last_payment_date, rent_due_day,
  } = t

  const monthsOwed   = rent_amount > 0 ? balance_due / rent_amount : 0
  const daysPastDue  = estimateDaysPastDue(last_payment_date, rent_due_day ?? 1)
  const lateFee      = balance_due > 0 && daysPastDue > 5 ? Math.round(rent_amount * 0.05) : 0
  const repeatOffender = previous_delinquency || late_payment_count >= 5
  const hasHistory     = late_payment_count >= 2 || days_late_avg >= 3
  const firstOffense   = late_payment_count <= 1 && !previous_delinquency
  const noPaymentMethod = !payment_method || payment_method === 'unknown'

  const fmt = {
    balance: `$${balance_due.toLocaleString()}`,
    months:  `${Math.round(monthsOwed * 10) / 10} month${monthsOwed !== 1 ? 's' : ''}`,
    days:    daysPastDue > 0 ? `${daysPastDue} days past due` : 'balance outstanding',
  }

  // ── LEGAL — File Unlawful Detainer ────────────────────────────────────────
  // 3+ months owed regardless of days.
  // 2+ months owed AND either repeat offender or 45+ days — negotiation is over.
  if (
    monthsOwed >= 3 ||
    (monthsOwed >= 2 && repeatOffender) ||
    (monthsOwed >= 2 && daysPastDue >= 45)
  ) {
    const reasons: string[] = [
      `${fmt.months} rent outstanding (${fmt.balance})`,
    ]
    if (daysPastDue > 0)          reasons.push(`${daysPastDue} days since rent was due`)
    if (previous_delinquency)     reasons.push('Prior eviction or delinquency on record')
    if (late_payment_count >= 5)  reasons.push(`${late_payment_count} late payments — established pattern`)

    const narrative =
      `At ${fmt.months} overdue${daysPastDue > 0 ? ` and ${daysPastDue} days since the 1st` : ''}, ` +
      `the window for voluntary resolution has effectively closed. ` +
      `Filing an Unlawful Detainer is the most cost-effective path — every additional week of ` +
      `negotiation adds more unpaid rent with a low probability of recovery.` +
      (repeatOffender ? ` The prior delinquency record makes a self-correction unlikely.` : '')

    return {
      score: 'red', tier: 'legal',
      recommended_action: 'File Unlawful Detainer',
      action_type: 'legal_packet',
      reasons, narrative,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: true,
    }
  }

  // ── CASH FOR KEYS — Day 35-45 ─────────────────────────────────────────────
  // Offering cash to vacate is cheaper than court when owed 1.5+ months,
  // OR 1+ month and 45 days have passed (Pay or Quit was likely ignored).
  if (
    (monthsOwed >= 1.5 && daysPastDue >= 35) ||
    (monthsOwed >= 1.5 && repeatOffender) ||
    (monthsOwed >= 1 && daysPastDue >= 45)
  ) {
    const reasons: string[] = [
      `${fmt.balance} outstanding (${fmt.months})`,
    ]
    if (daysPastDue > 0)      reasons.push(`${daysPastDue} days since last payment`)
    if (previous_delinquency) reasons.push('Prior delinquency — high re-offense risk')
    if (repeatOffender)       reasons.push('Established pattern of non-payment')

    const narrative =
      `With ${fmt.months} owed${daysPastDue > 0 ? ` and ${daysPastDue} days on the clock` : ''}, ` +
      `court costs and lost rent during eviction proceedings will likely exceed the cost of a ` +
      `cash-for-keys offer. Offering $500–$1,500 for a voluntary move-out within 14 days is ` +
      `typically faster and cheaper than filing — and removes the uncertainty of a court ruling.` +
      (repeatOffender ? ` Given the payment history, this tenant is unlikely to self-correct.` : '')

    return {
      score: 'red', tier: 'cash_for_keys',
      recommended_action: 'Offer Cash for Keys',
      action_type: 'cash_for_keys',
      reasons, narrative,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: false,
    }
  }

  // ── PAY OR QUIT — Day 20-35 ───────────────────────────────────────────────
  // Legal notice starts the clock without committing to eviction.
  // Triggered by a full month owed + time/history, or partial balance with escalating signals.
  // NOTE: 2+ months owed is always Pay or Quit regardless of daysPastDue — the balance alone
  // proves non-payment; the exact date tracking is secondary.
  if (
    monthsOwed >= 2 ||
    (monthsOwed >= 1 && daysPastDue >= 20) ||
    (monthsOwed >= 1 && repeatOffender) ||
    (balance_due > 0 && daysPastDue >= 25 && (late_payment_count >= 3 || repeatOffender)) ||
    (balance_due > 0 && repeatOffender && daysPastDue >= 15)
  ) {
    const reasons: string[] = [
      `${fmt.balance} outstanding — ${fmt.days}`,
    ]
    if (late_payment_count >= 3) reasons.push(`${late_payment_count} late payments — chronic pattern`)
    if (previous_delinquency)    reasons.push('Prior eviction on record')
    if (monthsOwed >= 1)         reasons.push('Full month of rent outstanding')

    const narrative =
      `${daysPastDue > 0 ? `At ${daysPastDue} days past due` : 'With a balance outstanding'} ` +
      `and ${fmt.balance} owed, a Pay or Quit notice starts the legal clock without committing to ` +
      `eviction. Most tenants pay within 3–7 days of receiving one — and if they don't, you've ` +
      `already completed the first required step for Unlawful Detainer, putting you weeks ahead.` +
      (repeatOffender ? ` Given this tenant's history, sending the notice now protects your position.` : '')

    return {
      score: 'red', tier: 'pay_or_quit',
      recommended_action: 'Issue Pay or Quit Notice',
      action_type: 'legal_packet',
      reasons, narrative,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: true,
    }
  }

  // ── PAYMENT PLAN — Day 15-25 ──────────────────────────────────────────────
  // Structure repayment before it escalates to a legal situation.
  // Balance + time pressure (15+ days), existing late history, OR a full month owed
  // (balance alone proves a missed month — day tracking is secondary).
  if (balance_due > 0 && (monthsOwed >= 1 || daysPastDue >= 15 || hasHistory)) {
    const reasons: string[] = [`${fmt.balance} outstanding`]
    if (daysPastDue >= 15)      reasons.push(`${daysPastDue} days since rent was due`)
    if (late_payment_count >= 2) reasons.push(`${late_payment_count} late payments in history`)
    if (days_late_avg >= 3)     reasons.push(`Averages ${days_late_avg} days late`)

    const narrative =
      `${daysPastDue >= 15 ? `At ${daysPastDue} days past due` : 'Given the payment history'}, ` +
      `a structured payment plan is more likely to recover the ${fmt.balance} than waiting. ` +
      `Offering to split the balance over 2–3 payments gives the tenant a realistic path to ` +
      `compliance and keeps escalation available if they miss the plan — without the cost of ` +
      `a legal notice yet.`

    return {
      score: 'red', tier: 'payment_plan',
      recommended_action: 'Offer Payment Plan',
      action_type: 'split_pay_offer',
      reasons, narrative,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: false,
    }
  }

  // ── REMINDER — Day 1-14, first/second offense ─────────────────────────────
  // Early days with a clean or nearly-clean record — a nudge resolves most of these.
  if (balance_due > 0) {
    const reasons: string[] = [`${fmt.balance} outstanding`]
    if (daysPastDue > 0) reasons.push(`${daysPastDue} days since rent was due`)
    if (firstOffense)    reasons.push('No significant late payment history — likely an oversight')

    const narrative =
      `${daysPastDue > 0 ? `${daysPastDue} days past due` : 'A balance is outstanding'} ` +
      `with ${firstOffense ? 'no significant history of late payments' : 'a relatively clean record'}. ` +
      `A friendly reminder resolves the vast majority of cases at this stage — the tenant likely ` +
      `needs a nudge, not a legal notice. If there's no response within 5 days, escalate to a ` +
      `payment plan or Pay or Quit depending on the balance.`

    return {
      score: 'yellow', tier: 'reminder',
      recommended_action: 'Send Friendly Reminder',
      action_type: 'payment_reminder',
      reasons, narrative,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: false,
    }
  }

  // ── WATCH — Predictive, no current balance ────────────────────────────────
  // Behavioral signals indicate risk before the 1st — act proactively.
  const watchReasons: string[] = []

  if (late_payment_count >= 3)
    watchReasons.push(`${late_payment_count} late payments — likely to be late this month`)
  if (days_late_avg >= 3)
    watchReasons.push(`Averages ${days_late_avg} days late — proactive reminder recommended`)
  if (noPaymentMethod)
    watchReasons.push('No payment method confirmed — payment not guaranteed')

  if (card_expiry) {
    if (cardExpiresWithinDays(card_expiry, 7))
      watchReasons.push('Payment card expiring within 7 days')
    else if (cardExpiresWithinDays(card_expiry, 30))
      watchReasons.push('Payment card expiring within 30 days')
  }

  if (watchReasons.length > 0) {
    const narrative =
      `No balance currently, but behavioral signals suggest elevated risk this month. ` +
      (noPaymentMethod ? `No confirmed payment method means rent is not guaranteed on the 1st. ` : '') +
      (late_payment_count >= 3 ? `With ${late_payment_count} late payments on record, a proactive reminder before the 1st significantly improves on-time collection. ` : '') +
      `Acting now costs nothing — waiting risks chasing a late payment next month.`

    return {
      score: 'yellow', tier: 'watch',
      recommended_action: noPaymentMethod ? 'Confirm Payment Method' : 'Send Proactive Reminder',
      action_type: 'proactive_reminder',
      reasons: watchReasons,
      narrative,
      days_past_due: 0, late_fee: 0,
      requires_attorney: false,
    }
  }

  // ── HEALTHY ───────────────────────────────────────────────────────────────
  return {
    score: 'green', tier: 'healthy',
    recommended_action: '', action_type: '',
    reasons: ['On-time payment history — no risk signals detected'],
    narrative: 'No risk signals detected. This tenant has a clean payment record and no outstanding balance.',
    days_past_due: 0, late_fee: 0,
    requires_attorney: false,
  }
}
