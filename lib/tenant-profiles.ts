/**
 * Tenant behavioral profiles — classifies tenants into one of five categories
 * based on payment history. Each profile drives different cadence, tone, plan
 * sizing, and outreach timing throughout the automation system.
 *
 * Profiles (ordered by severity):
 *   stable   — first-timer or reliable; soft touch, max 14-day dedup
 *   timing   — cash-flow timing issue; pays late but always pays; personalized trigger
 *   chronic  — structural habit (3+ late, avg 5+ days); firm, compressed cadence
 *   repeat   — prior delinquency or 5+ late; formal, one plan offer max
 *   distress — sudden large balance with clean history; hardship pivot
 */

export type TenantProfile = 'stable' | 'timing' | 'chronic' | 'repeat' | 'distress'

export interface ProfileConfig {
  /** Days between any two automation messages (global dedup window) */
  dedup_days: number
  /** Max installments offered in a payment plan */
  plan_max_installments: number
  /** Days between installments */
  plan_installment_window_days: number
  /** Max plan offers before automation stops offering and defers to Phase 2 escalation */
  plan_max_offers: number
  /** SMS tone */
  tone: 'friendly' | 'empathetic' | 'firm' | 'formal' | 'hardship'
  /** Use loss-aversion framing ("avoid late fee") vs. gain framing */
  use_loss_aversion: boolean
  /** Include specific "pay by [date]" deadline in messages */
  include_deadline: boolean
  /** Days before due date Phase 1 fires (base; timing profile uses personalized calc) */
  phase1_days_trigger: number
  label: string
}

export const PROFILE_CONFIGS: Record<TenantProfile, ProfileConfig> = {
  stable: {
    dedup_days: 14,
    plan_max_installments: 3,
    plan_installment_window_days: 14,
    plan_max_offers: 2,
    tone: 'friendly',
    use_loss_aversion: false,
    include_deadline: false,
    phase1_days_trigger: 7,
    label: 'First-time / Reliable',
  },
  timing: {
    dedup_days: 10,
    plan_max_installments: 3,
    plan_installment_window_days: 14,
    plan_max_offers: 3,
    tone: 'empathetic',
    use_loss_aversion: false,
    include_deadline: true,
    phase1_days_trigger: 5,
    label: 'Cash-flow Timing',
  },
  chronic: {
    dedup_days: 7,
    plan_max_installments: 2,
    plan_installment_window_days: 7,
    plan_max_offers: 2,
    tone: 'firm',
    use_loss_aversion: true,
    include_deadline: true,
    phase1_days_trigger: 3,
    label: 'Chronic Late',
  },
  repeat: {
    dedup_days: 7,
    plan_max_installments: 2,
    plan_installment_window_days: 7,
    plan_max_offers: 1,
    tone: 'formal',
    use_loss_aversion: true,
    include_deadline: true,
    phase1_days_trigger: 3,
    label: 'Repeat Offender',
  },
  distress: {
    dedup_days: 14,
    plan_max_installments: 4,
    plan_installment_window_days: 21,
    plan_max_offers: 3,
    tone: 'hardship',
    use_loss_aversion: false,
    include_deadline: false,
    phase1_days_trigger: 7,
    label: 'Financial Distress',
  },
}

export function classifyTenantProfile(
  days_late_avg: number,
  late_payment_count: number,
  previous_delinquency: boolean,
  balance_due: number,
  rent_amount: number,
): TenantProfile {
  const monthsOwed = rent_amount > 0 ? balance_due / rent_amount : 0

  // Sudden large balance with clean history → likely a hardship event, not a habit
  if (late_payment_count <= 1 && !previous_delinquency && monthsOwed >= 0.8) return 'distress'

  // Prior eviction or 5+ late payments → won't self-correct, needs fastest path
  if (previous_delinquency || late_payment_count >= 5) return 'repeat'

  // Structural habit: 3+ late with consistently high average days late
  if (late_payment_count >= 3 && days_late_avg >= 5) return 'chronic'

  // Cash-flow timing: pays late but always pays, 2+ late with 3+ avg days
  if (late_payment_count >= 2 && days_late_avg >= 3) return 'timing'

  return 'stable'
}

/**
 * For the timing profile, personalize the Phase 1 pre-due trigger day to
 * their actual payment pattern: remind them (avg days late + 3) days before
 * due so they have the right lead time for their cash-flow cycle.
 */
export function getPersonalizedPreDueTrigger(profile: TenantProfile, days_late_avg: number): number {
  if (profile === 'timing') {
    return Math.min(14, Math.max(3, Math.ceil(days_late_avg) + 3))
  }
  return PROFILE_CONFIGS[profile].phase1_days_trigger
}

/** Format a "pay by" deadline date (e.g. "Jun 3") */
export function payByDate(daysOut: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOut)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
