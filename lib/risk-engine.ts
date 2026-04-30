export type RiskScore = 'green' | 'yellow' | 'red'

export type RiskTier =
  | 'healthy'        // No balance, no risk signals
  | 'watch'          // Predictive — act before the 1st
  | 'reminder'       // Day 1-14: first/second offense, gentle nudge
  | 'payment_plan'   // Day 15-20: some history or time pressure, structure repayment
  | 'pay_or_quit'    // Day 15-30: legal notice required (issue by Day 15 for 1+ month owed)
  | 'cash_for_keys'  // Day 30-45: offer cash to vacate vs court (optimal window)
  | 'legal'          // Day 45+: file Unlawful Detainer

export type TenantPattern =
  | 'repeat_offender'   // Prior eviction or 5+ late payments — statistically won't self-correct
  | 'escalating_late'   // 4+ payments, avg 7+ days late — pattern is getting worse each month
  | 'chronic_late'      // 3+ payments, avg 3+ days late — structural habit, not a crisis
  | 'sudden_nonpayer'   // Clean record, first full missed payment — likely a hardship event
  | 'first_offense'     // 0-1 late payments, no prior delinquency
  | 'stable'            // Minor signals, manageable

export interface TenantRiskInput {
  days_late_avg: number
  late_payment_count: number
  previous_delinquency: boolean
  card_expiry?: string        // 'MM/YY' — optional
  payment_method?: string
  balance_due: number
  rent_amount: number
  last_payment_date?: string  // ISO date
  rent_due_day?: number       // day of month rent is due (default: 1)
  days_until_due?: number     // pass in for pre-due precision; undefined = ignore
}

export interface RiskResult {
  score: RiskScore
  tier: RiskTier
  recommended_action: string
  action_type: string
  reasons: string[]
  narrative: string
  days_past_due: number
  late_fee: number
  requires_attorney: boolean
  tenant_pattern: TenantPattern
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
    let rentDueThisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
    if (rentDueThisMonth > now) {
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
    days_until_due,
  } = t

  const monthsOwed   = rent_amount > 0 ? balance_due / rent_amount : 0
  const daysPastDue  = estimateDaysPastDue(last_payment_date, rent_due_day ?? 1)
  const lateFee      = balance_due > 0 && daysPastDue > 5 ? Math.round(rent_amount * 0.05) : 0
  const repeatOffender = previous_delinquency || late_payment_count >= 5
  const hasHistory     = late_payment_count >= 2 || days_late_avg >= 3
  const firstOffense   = late_payment_count <= 1 && !previous_delinquency
  const noPaymentMethod = !payment_method || payment_method === 'unknown'

  // ── Pattern segmentation ───────────────────────────────────────────────────
  // Chronic: pays every month but always a few days late — structural habit
  const chronicLate = late_payment_count >= 3 && days_late_avg >= 3 && days_late_avg < 7

  // Escalating: getting progressively worse — high count AND high avg
  const escalatingLate = late_payment_count >= 4 && days_late_avg >= 7

  // Sudden non-payer: reliably paid before, now a full month owed — often hardship
  const suddenNonpayer =
    late_payment_count <= 1 && !previous_delinquency &&
    monthsOwed >= 0.8 && daysPastDue >= 3

  // Partial payer: has a balance but it's less than 80% of one month's rent
  const partialPayer = balance_due > 0 && rent_amount > 0 && monthsOwed > 0 && monthsOwed < 0.8

  function derivePattern(): TenantPattern {
    if (repeatOffender) return 'repeat_offender'
    if (escalatingLate) return 'escalating_late'
    if (chronicLate) return 'chronic_late'
    if (suddenNonpayer) return 'sudden_nonpayer'
    if (firstOffense) return 'first_offense'
    return 'stable'
  }
  const tenantPattern = derivePattern()

  const fmt = {
    balance: `$${balance_due.toLocaleString()}`,
    months:  `${Math.round(monthsOwed * 10) / 10} month${monthsOwed !== 1 ? 's' : ''}`,
    days:    daysPastDue > 0 ? `${daysPastDue} days past due` : 'balance outstanding',
  }

  // ── LEGAL — File Unlawful Detainer ────────────────────────────────────────
  // 3+ months owed regardless of days.
  // 2+ months owed AND either repeat offender or 45+ days past due.
  // 1.5+ months owed AND 60+ days past due — two full billing cycles ignored.
  // Source: NBER (2024), practitioner consensus — file between Day 45–60 max.
  if (
    monthsOwed >= 3 ||
    (monthsOwed >= 2 && repeatOffender) ||
    (monthsOwed >= 2 && daysPastDue >= 45) ||
    (monthsOwed >= 1.5 && daysPastDue >= 60)
  ) {
    const reasons: string[] = [
      `${fmt.months} rent outstanding (${fmt.balance})`,
    ]
    if (daysPastDue > 0)          reasons.push(`${daysPastDue} days since rent was due`)
    if (previous_delinquency)     reasons.push('Prior eviction or delinquency on record')
    if (late_payment_count >= 5)  reasons.push(`${late_payment_count} late payments — established pattern`)
    if (escalatingLate)           reasons.push(`Avg ${days_late_avg} days late — deteriorating over time`)

    const narrative =
      `At ${fmt.months} overdue${daysPastDue > 0 ? ` and ${daysPastDue} days since the 1st` : ''}, ` +
      `the window for voluntary resolution has effectively closed. ` +
      `Filing an Unlawful Detainer is the most cost-effective path — every additional week of ` +
      `negotiation adds more unpaid rent with a low probability of recovery.` +
      (repeatOffender ? ` The prior delinquency record makes a self-correction unlikely.` : '') +
      (escalatingLate ? ` The worsening payment pattern suggests this isn't a temporary hardship.` : '')

    return {
      score: 'red', tier: 'legal',
      recommended_action: 'File for Eviction',
      action_type: 'legal_packet',
      reasons, narrative, tenant_pattern: tenantPattern,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: true,
    }
  }

  // ── CASH FOR KEYS — Day 30-45 ─────────────────────────────────────────────
  // Optimal CFK window: Day 30–45. Tenant anxiety is highest, no attorney yet,
  // eviction not yet on public record. Source: RentPrep, BiggerPockets practitioners.
  if (
    (monthsOwed >= 1.5 && daysPastDue >= 30) ||
    (monthsOwed >= 1.5 && repeatOffender) ||
    (monthsOwed >= 1 && daysPastDue >= 45)
  ) {
    const reasons: string[] = [
      `${fmt.balance} outstanding (${fmt.months})`,
    ]
    if (daysPastDue > 0)      reasons.push(`${daysPastDue} days since last payment`)
    if (previous_delinquency) reasons.push('Prior delinquency — high re-offense risk')
    if (repeatOffender)       reasons.push('Established pattern of non-payment')
    if (escalatingLate)       reasons.push(`Avg ${days_late_avg} days late — pattern worsening`)

    const narrative =
      `With ${fmt.months} owed${daysPastDue > 0 ? ` and ${daysPastDue} days on the clock` : ''}, ` +
      `court costs and lost rent during eviction proceedings will likely exceed the cost of a ` +
      `cash-for-keys offer. Offering $500–$1,500 for a voluntary move-out within 14 days is ` +
      `typically faster and cheaper than filing — and removes the uncertainty of a court ruling.` +
      (repeatOffender ? ` Given the payment history, this tenant is unlikely to self-correct.` : '') +
      (escalatingLate ? ` The worsening payment trend reinforces this conclusion.` : '')

    return {
      score: 'red', tier: 'cash_for_keys',
      recommended_action: 'Offer Cash for Keys',
      action_type: 'cash_for_keys',
      reasons, narrative, tenant_pattern: tenantPattern,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: false,
    }
  }

  // ── PAY OR QUIT — Day 15-30 ───────────────────────────────────────────────
  // Issue by Day 15 for 1+ month owed — starts clock, most tenants pay within 3–7 days.
  // Waiting past Day 20 gives tenants more runway to prepare delay tactics.
  // Source: NBER (2024), practitioner consensus.
  if (
    monthsOwed >= 2 ||
    (monthsOwed >= 1 && daysPastDue >= 15) ||
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
    if (escalatingLate)          reasons.push(`Avg ${days_late_avg} days late — pattern deteriorating`)
    if (chronicLate && !escalatingLate) reasons.push(`Chronic pattern: avg ${days_late_avg} days late over ${late_payment_count} payments`)

    const narrative =
      `${daysPastDue > 0 ? `At ${daysPastDue} days past due` : 'With a balance outstanding'} ` +
      `and ${fmt.balance} owed, a Pay or Quit notice starts the legal clock without committing to ` +
      `eviction. Most tenants pay within 3–7 days of receiving one — and if they don't, you've ` +
      `already completed the first required step for Unlawful Detainer, putting you weeks ahead.` +
      (repeatOffender ? ` Given this tenant's history, sending the notice now protects your position.` : '') +
      (escalatingLate ? ` The deteriorating payment trend makes voluntary resolution less likely without formal pressure.` : '')

    return {
      score: 'red', tier: 'pay_or_quit',
      recommended_action: 'Issue Pay or Quit Notice',
      action_type: 'legal_packet',
      reasons, narrative, tenant_pattern: tenantPattern,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: true,
    }
  }

  // ── PAYMENT PLAN — Day 15-25 ──────────────────────────────────────────────
  // Structure repayment before it escalates. Balance + time pressure (15+ days),
  // existing late history, OR a full month owed.
  if (balance_due > 0 && (monthsOwed >= 1 || daysPastDue >= 15 || hasHistory)) {
    const reasons: string[] = [`${fmt.balance} outstanding`]
    if (daysPastDue >= 15)       reasons.push(`${daysPastDue} days since rent was due`)
    if (late_payment_count >= 2)  reasons.push(`${late_payment_count} late payments in history`)
    if (days_late_avg >= 3)      reasons.push(`Averages ${days_late_avg} days late`)
    if (chronicLate)             reasons.push(`Chronic pattern: consistently ${days_late_avg} days late`)
    if (escalatingLate)          reasons.push(`Pattern deteriorating — avg ${days_late_avg} days late across ${late_payment_count} payments`)
    if (partialPayer)            reasons.push('Partial payment received — balance still outstanding')

    const narrative = (() => {
      if (chronicLate) {
        return `This tenant has a pattern of paying ${days_late_avg} days late on average. ` +
          `A payment plan addresses the current balance of ${fmt.balance}, but the underlying pattern ` +
          `warrants a direct conversation about autopay or adjusting the due date — ` +
          `otherwise expect the same issue next month.`
      }
      if (partialPayer) {
        return `A partial payment was received — the remaining ${fmt.balance} is still outstanding. ` +
          `A structured plan to cover the remainder over 2-3 installments is more likely to ` +
          `recover the balance than waiting, and avoids the cost of a formal notice at this stage.`
      }
      return `${daysPastDue >= 15 ? `At ${daysPastDue} days past due` : 'Given the payment history'}, ` +
        `a structured payment plan is more likely to recover the ${fmt.balance} than waiting. ` +
        `Offering to split the balance over 2–3 payments gives the tenant a realistic path to ` +
        `compliance and keeps escalation available if they miss the plan.`
    })()

    return {
      score: 'red', tier: 'payment_plan',
      recommended_action: 'Offer Payment Plan',
      action_type: 'split_pay_offer',
      reasons, narrative, tenant_pattern: tenantPattern,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: false,
    }
  }

  // ── REMINDER — Day 1-14, first/second offense ─────────────────────────────
  // Early days with a clean or nearly-clean record — a nudge resolves most cases.
  if (balance_due > 0) {
    const reasons: string[] = [`${fmt.balance} outstanding`]
    if (daysPastDue > 0) reasons.push(`${daysPastDue} days since rent was due`)
    if (firstOffense)    reasons.push('No significant late payment history — likely an oversight')
    if (suddenNonpayer)  reasons.push('First missed payment — previously reliable payer')
    if (partialPayer)    reasons.push('Partial payment received — remainder outstanding')

    const narrative = (() => {
      if (suddenNonpayer) {
        return `This tenant has paid on time consistently — a sudden first missed payment often signals ` +
          `a personal hardship, not willful non-payment. A check-in call before any formal notice ` +
          `typically resolves this faster and preserves the relationship. ` +
          `If no response within 5 days, escalate to a payment plan.`
      }
      if (chronicLate) {
        return `This tenant consistently pays ${days_late_avg} days late — a structural pattern, ` +
          `not an emergency. A direct conversation about autopay or adjusting the due date may ` +
          `solve this permanently. Without a change, expect the same behavior next month.`
      }
      if (partialPayer) {
        return `A partial payment was received — the remaining ${fmt.balance} is still outstanding. ` +
          `A quick message asking for the remainder is likely all it takes at this stage.`
      }
      return `${daysPastDue > 0 ? `${daysPastDue} days past due` : 'A balance is outstanding'} ` +
        `with no significant late payment history. A friendly reminder resolves the vast majority ` +
        `of cases at this stage — the tenant likely needs a nudge, not a legal notice. ` +
        `If no response within 5 days, escalate to a payment plan or Pay or Quit depending on the balance.`
    })()

    const recommended_action = suddenNonpayer
      ? 'Check In — Possible Hardship'
      : chronicLate
      ? 'Send Reminder + Discuss Pattern'
      : 'Send Friendly Reminder'

    return {
      score: 'yellow', tier: 'reminder',
      recommended_action, action_type: 'payment_reminder',
      reasons, narrative, tenant_pattern: tenantPattern,
      days_past_due: daysPastDue, late_fee: lateFee,
      requires_attorney: false,
    }
  }

  // ── WATCH — Predictive, no current balance ────────────────────────────────
  // Behavioral signals indicate risk before the 1st — act proactively.
  // Pre-due timing signals take priority when days_until_due is provided.
  const watchReasons: string[] = []

  // Pre-due urgency (most time-sensitive signal)
  if (days_until_due !== undefined && days_until_due >= 0) {
    if (days_until_due <= 1 && (late_payment_count >= 2 || days_late_avg >= 3)) {
      watchReasons.push(
        days_until_due === 0
          ? `Rent due TODAY — ${late_payment_count} late payment${late_payment_count !== 1 ? 's' : ''} on record, not yet confirmed`
          : `Rent due TOMORROW — high-risk tenant, payment not yet confirmed (${late_payment_count} late payments, avg ${days_late_avg}d late)`
      )
    } else if (days_until_due <= 5 && (late_payment_count >= 2 || days_late_avg >= 3)) {
      watchReasons.push(
        `Rent due in ${days_until_due} day${days_until_due !== 1 ? 's' : ''} — proactive outreach recommended (${late_payment_count} late payments on record)`
      )
    }
  }

  // Chronic late pattern — structural risk every month
  if (escalatingLate) {
    watchReasons.push(`Deteriorating pattern: avg ${days_late_avg} days late across ${late_payment_count} payments — worsening each cycle`)
  } else if (chronicLate) {
    watchReasons.push(`Chronic pattern: pays consistently ${days_late_avg} days late — proactive reminder every month reduces collection time`)
  } else if (late_payment_count >= 3) {
    watchReasons.push(`${late_payment_count} late payments — likely to be late this month`)
  } else if (days_late_avg >= 3) {
    watchReasons.push(`Averages ${days_late_avg} days late — proactive reminder recommended`)
  }

  // No payment method
  if (noPaymentMethod) {
    watchReasons.push('No payment method confirmed — rent collection not guaranteed on the 1st')
  }

  // Card expiry (14-day window, then 30-day)
  if (card_expiry) {
    if (cardExpiresWithinDays(card_expiry, 7)) {
      watchReasons.push('Payment card expiring within 7 days — update before rent is due')
    } else if (cardExpiresWithinDays(card_expiry, 14)) {
      watchReasons.push('Payment card expiring within 14 days — renewal needed soon')
    } else if (cardExpiresWithinDays(card_expiry, 30)) {
      watchReasons.push('Payment card expiring within 30 days')
    }
  }

  if (watchReasons.length > 0) {
    const isUrgentPreDue = days_until_due !== undefined && days_until_due <= 1

    const narrative = (() => {
      if (isUrgentPreDue) {
        return `Rent is due ${days_until_due === 0 ? 'today' : 'tomorrow'} and payment hasn't been confirmed. ` +
          `With ${late_payment_count} late payment${late_payment_count !== 1 ? 's' : ''} on record, ` +
          `a direct follow-up now is the fastest way to avoid a balance. ` +
          `Every hour of delay today is a day of collection time tomorrow.`
      }
      if (escalatingLate) {
        return `No balance currently, but this tenant's payment pattern is deteriorating — ` +
          `averaging ${days_late_avg} days late across ${late_payment_count} payments. ` +
          `Proactive outreach before the 1st is essential; at this trajectory, ` +
          `expect a late payment this month without intervention.`
      }
      if (chronicLate) {
        return `No balance, but this tenant reliably pays ${days_late_avg} days late every month. ` +
          `A proactive reminder ${days_until_due !== undefined ? `${days_until_due} days before` : 'before'} the 1st ` +
          `can reduce collection time significantly. Consider a conversation about autopay.`
      }
      return `No balance currently, but behavioral signals suggest elevated risk this month. ` +
        (noPaymentMethod ? `No confirmed payment method means rent is not guaranteed on the 1st. ` : '') +
        (late_payment_count >= 3 ? `With ${late_payment_count} late payments on record, a proactive reminder before the 1st significantly improves on-time collection. ` : '') +
        `Acting now costs nothing — waiting risks chasing a late payment next month.`
    })()

    const recommended_action = (() => {
      if (isUrgentPreDue) return 'Follow Up — Rent Due Immediately'
      if (escalatingLate) return 'Schedule Tenant Check-In'
      if (chronicLate) return 'Send Proactive Reminder + Discuss Pattern'
      if (noPaymentMethod) return 'Confirm Payment Method'
      return 'Send Proactive Reminder'
    })()

    return {
      score: 'yellow', tier: 'watch',
      recommended_action,
      action_type: 'proactive_reminder',
      reasons: watchReasons, narrative, tenant_pattern: tenantPattern,
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
    tenant_pattern: tenantPattern,
    days_past_due: 0, late_fee: 0,
    requires_attorney: false,
  }
}
