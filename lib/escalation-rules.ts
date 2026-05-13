export type EscalationPreset = "professional" | "balanced" | "lenient" | "custom"

export interface EscalationRules {
  preset: EscalationPreset
  reminderDay: number
  paymentPlanDay: number
  payOrQuitDay: number
  cfkReviewDay: number
  attorneyReviewDay: number
  preDueRiskOutreachEnabled: boolean
  preDueRiskReviewDaysBeforeDue: number
  repeatOffenderAcceleratorDays: number
  requireAttorneyBeforeNotice: boolean
  paymentPlanBeforeNotice: boolean
  customPolicyNotes: string
}

export const PROFESSIONAL_DEFAULT_RULES: EscalationRules = {
  preset: "professional",
  reminderDay: 1,
  paymentPlanDay: 5,
  payOrQuitDay: 5,
  cfkReviewDay: 21,
  attorneyReviewDay: 30,
  preDueRiskOutreachEnabled: true,
  preDueRiskReviewDaysBeforeDue: 5,
  repeatOffenderAcceleratorDays: 7,
  requireAttorneyBeforeNotice: true,
  paymentPlanBeforeNotice: true,
  customPolicyNotes: "",
}

export const ESCALATION_PRESETS: Record<Exclude<EscalationPreset, "custom">, EscalationRules> = {
  professional: PROFESSIONAL_DEFAULT_RULES,
  balanced: {
    ...PROFESSIONAL_DEFAULT_RULES,
    preset: "balanced",
    paymentPlanDay: 7,
    payOrQuitDay: 10,
    cfkReviewDay: 25,
    attorneyReviewDay: 35,
  },
  lenient: {
    ...PROFESSIONAL_DEFAULT_RULES,
    preset: "lenient",
    reminderDay: 3,
    paymentPlanDay: 10,
    payOrQuitDay: 14,
    cfkReviewDay: 30,
    attorneyReviewDay: 45,
    repeatOffenderAcceleratorDays: 5,
  },
}

type RulesInput = Partial<Record<keyof EscalationRules, unknown>> | null | undefined

function clampDay(value: unknown, fallback: number): number {
  const num = typeof value === "string" ? Number(value) : value
  if (typeof num !== "number" || !Number.isFinite(num)) return fallback
  return Math.min(90, Math.max(0, Math.round(num)))
}

function normalizePreset(value: unknown): EscalationPreset {
  return value === "balanced" || value === "lenient" || value === "custom" || value === "professional"
    ? value
    : "professional"
}

export function rulesForPreset(preset: EscalationPreset): EscalationRules {
  if (preset === "custom") return { ...PROFESSIONAL_DEFAULT_RULES, preset: "custom" }
  return { ...ESCALATION_PRESETS[preset] }
}

export function normalizeEscalationRules(input?: RulesInput): EscalationRules {
  const preset = normalizePreset(input?.preset)
  const base = preset === "custom" ? PROFESSIONAL_DEFAULT_RULES : rulesForPreset(preset)

  const paymentPlanDay = clampDay(input?.paymentPlanDay, base.paymentPlanDay)
  const payOrQuitDay = Math.max(paymentPlanDay, clampDay(input?.payOrQuitDay, base.payOrQuitDay))
  const cfkReviewDay = Math.max(payOrQuitDay, clampDay(input?.cfkReviewDay, base.cfkReviewDay))
  const attorneyReviewDay = Math.max(cfkReviewDay, clampDay(input?.attorneyReviewDay, base.attorneyReviewDay))

  return {
    preset,
    reminderDay: clampDay(input?.reminderDay, base.reminderDay),
    paymentPlanDay,
    payOrQuitDay,
    cfkReviewDay,
    attorneyReviewDay,
    preDueRiskOutreachEnabled: typeof input?.preDueRiskOutreachEnabled === "boolean" ? input.preDueRiskOutreachEnabled : base.preDueRiskOutreachEnabled,
    preDueRiskReviewDaysBeforeDue: clampDay(input?.preDueRiskReviewDaysBeforeDue, base.preDueRiskReviewDaysBeforeDue),
    repeatOffenderAcceleratorDays: clampDay(input?.repeatOffenderAcceleratorDays, base.repeatOffenderAcceleratorDays),
    requireAttorneyBeforeNotice: typeof input?.requireAttorneyBeforeNotice === "boolean" ? input.requireAttorneyBeforeNotice : base.requireAttorneyBeforeNotice,
    paymentPlanBeforeNotice: typeof input?.paymentPlanBeforeNotice === "boolean" ? input.paymentPlanBeforeNotice : base.paymentPlanBeforeNotice,
    customPolicyNotes: typeof input?.customPolicyNotes === "string" ? input.customPolicyNotes.trim() : "",
  }
}

type ProfileRow = Record<string, unknown> | null | undefined

export function profileToEscalationRules(profile: ProfileRow): EscalationRules {
  return normalizeEscalationRules({
    preset: profile?.escalation_preset ?? profile?.escalationStyle,
    reminderDay: profile?.reminder_day,
    paymentPlanDay: profile?.payment_plan_day,
    payOrQuitDay: profile?.pay_or_quit_day,
    cfkReviewDay: profile?.cfk_review_day,
    attorneyReviewDay: profile?.attorney_review_day,
    preDueRiskOutreachEnabled: profile?.pre_due_risk_outreach_enabled,
    preDueRiskReviewDaysBeforeDue: profile?.pre_due_risk_review_days_before_due,
    repeatOffenderAcceleratorDays: profile?.repeat_offender_accelerator_days,
    requireAttorneyBeforeNotice: profile?.require_attorney_before_notice,
    paymentPlanBeforeNotice: profile?.payment_plan_before_notice,
    customPolicyNotes: profile?.custom_escalation_notes,
  })
}

export function escalationRulesToProfileUpdate(rules: EscalationRules) {
  const normalized = normalizeEscalationRules(rules)
  return {
    escalation_preset: normalized.preset,
    escalation_style: normalized.preset === "professional" ? "aggressive" : normalized.preset,
    reminder_day: normalized.reminderDay,
    payment_plan_day: normalized.paymentPlanDay,
    pay_or_quit_day: normalized.payOrQuitDay,
    cfk_review_day: normalized.cfkReviewDay,
    attorney_review_day: normalized.attorneyReviewDay,
    pre_due_risk_outreach_enabled: normalized.preDueRiskOutreachEnabled,
    pre_due_risk_review_days_before_due: normalized.preDueRiskReviewDaysBeforeDue,
    repeat_offender_accelerator_days: normalized.repeatOffenderAcceleratorDays,
    require_attorney_before_notice: normalized.requireAttorneyBeforeNotice,
    payment_plan_before_notice: normalized.paymentPlanBeforeNotice,
    custom_escalation_notes: normalized.customPolicyNotes || null,
  }
}
