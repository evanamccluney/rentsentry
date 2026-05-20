/**
 * Profile-aware SMS templates.
 *
 * Each function returns a message tailored to the tenant's behavioral profile:
 *   stable   → friendly, no pressure
 *   timing   → empathetic, specific deadline (fits their pay cycle)
 *   chronic  → firm, loss-aversion framing, compressed deadlines
 *   repeat   → formal, explicit consequences, hard deadlines
 *   distress → hardship-focused, offer accommodation not pressure
 *
 * All messages end with "Reply STOP to opt out." per TCPA.
 */

import { type TenantProfile, payByDate } from "@/lib/tenant-profiles"

export function splitPayOfferSms(
  profile: TenantProfile,
  firstName: string,
  total: number,
  maxInstallments: number,
  offerUrl: string,
  daysPastDue: number,
  includesNextMonth: boolean,
  pmFrom: string,
): string {
  const t = total.toLocaleString()
  const deadline = payByDate(profile === 'chronic' || profile === 'repeat' ? 7 : 14)
  const scope = includesNextMonth ? "balance (past due + upcoming rent)" : "past-due balance"

  switch (profile) {
    case 'stable':
      return `Hi ${firstName}, ${pmFrom} is offering to split your $${t} ${scope} into up to ${maxInstallments} payments. Choose your plan: ${offerUrl} Reply STOP to opt out.`

    case 'timing':
      return `Hi ${firstName}, ${pmFrom} is offering to split your $${t} ${scope} into ${maxInstallments} payments — choose a schedule that fits your pay cycle: ${offerUrl} Pay by ${deadline}. Reply STOP to opt out.`

    case 'chronic':
      return `Hi ${firstName}, your $${t} is ${daysPastDue}d past due. ${maxInstallments} short payments available — avoid further action, pay by ${deadline}: ${offerUrl} Reply STOP to opt out.`

    case 'repeat':
      return `Hi ${firstName}, your $${t} past-due balance requires immediate attention. One payment plan available — expires ${deadline}: ${offerUrl} Reply STOP to opt out.`

    case 'distress':
      return `Hi ${firstName}, ${pmFrom} is offering flexible installments for your $${t} ${scope}. Choose the terms that work for you: ${offerUrl} Reply STOP to opt out.`
  }
}

export function balanceReminderSms(
  profile: TenantProfile,
  firstName: string,
  balance: number,
  daysPastDue: number,
): string {
  const b = balance.toLocaleString()
  const deadline = payByDate(3)

  switch (profile) {
    case 'stable':
      return `Hi ${firstName}, your $${b} balance is still outstanding. Please arrange payment or reply to discuss options. Reply STOP to opt out.`

    case 'timing':
      return `Hi ${firstName}, your $${b} balance is due. If paycheck timing is tight this month, reply to discuss a split payment. Reply STOP to opt out.`

    case 'chronic':
      return `Hi ${firstName}, your $${b} is ${daysPastDue}d past due. Avoid additional fees — pay by ${deadline} or reply to arrange payment. Reply STOP to opt out.`

    case 'repeat':
      return `Hi ${firstName}, $${b} is ${daysPastDue}d past due. Resolve by ${deadline} to avoid formal action. Reply STOP to opt out.`

    case 'distress':
      return `Hi ${firstName}, your $${b} balance is outstanding. Reply to discuss flexible payment options — we want to find a solution. Reply STOP to opt out.`
  }
}

export function planFollowupSms(
  profile: TenantProfile,
  firstName: string,
  balance: number,
  offerUrl: string | null,
): string {
  const b = balance.toLocaleString()
  const expiry = payByDate(3)
  const link = offerUrl ? `Choose a plan: ${offerUrl}` : `Reply to arrange payment.`

  switch (profile) {
    case 'stable':
      return offerUrl
        ? `Hi ${firstName}, following up — your payment plan offer is still open. ${link} Reply STOP to opt out.`
        : `Hi ${firstName}, following up on your $${b} balance. Please reply to arrange payment. Reply STOP to opt out.`

    case 'timing':
      return offerUrl
        ? `Hi ${firstName}, your payment plan offer expires ${expiry}. Still available — ${link} Reply STOP to opt out.`
        : `Hi ${firstName}, your $${b} balance is still outstanding. Pay by ${expiry}. Reply STOP to opt out.`

    case 'chronic':
      return offerUrl
        ? `Hi ${firstName}, plan offer expires ${expiry}. Avoid further action — ${link} Reply STOP to opt out.`
        : `Hi ${firstName}, $${b} outstanding. Avoid further action — pay by ${expiry}. Reply STOP to opt out.`

    case 'repeat':
      return offerUrl
        ? `Hi ${firstName}, final follow-up — plan offer expires ${expiry}: ${offerUrl} Further action follows after this date. Reply STOP to opt out.`
        : `Hi ${firstName}, $${b} unresolved. Formal action may follow by ${expiry}. Reply STOP to opt out.`

    case 'distress':
      return offerUrl
        ? `Hi ${firstName}, your payment plan offer is still open. Need different terms? Just reply. Or choose: ${offerUrl} Reply STOP to opt out.`
        : `Hi ${firstName}, your $${b} balance is still outstanding. Reply — we can find a solution together. Reply STOP to opt out.`
  }
}

export function planEscalationSms(
  profile: TenantProfile,
  firstName: string,
  balance: number,
  daysSince: number,
): string {
  const b = balance.toLocaleString()
  const deadline = payByDate(profile === 'repeat' ? 3 : 5)

  switch (profile) {
    case 'stable':
      return `Hi ${firstName}, your $${b} balance is still unresolved after ${daysSince} days. Please reply to arrange payment or a formal notice may follow. Reply STOP to opt out.`

    case 'timing':
      return `Hi ${firstName}, your $${b} has been outstanding ${daysSince} days. Resolve by ${deadline} to avoid a formal notice. Reply STOP to opt out.`

    case 'chronic':
      return `Hi ${firstName}, $${b} unresolved for ${daysSince} days. Formal notice may be issued after ${deadline} without response. Reply STOP to opt out.`

    case 'repeat':
      return `Hi ${firstName}, $${b} unresolved for ${daysSince} days. Formal notice may be issued by ${deadline}. Immediate action required. Reply STOP to opt out.`

    case 'distress':
      return `Hi ${firstName}, your $${b} remains unresolved after ${daysSince} days. We want to find a solution before taking further steps — please reply. Reply STOP to opt out.`
  }
}

export function proactiveReminderSms(
  profile: TenantProfile,
  firstName: string,
  rentAmount: number,
  daysUntilDue: number,
  rentDueDay: number,
): string {
  const r = rentAmount.toLocaleString()
  const suffix = rentDueDay === 1 ? 'st' : rentDueDay === 2 ? 'nd' : rentDueDay === 3 ? 'rd' : 'th'
  const dueDate = `the ${rentDueDay}${suffix}`
  const deadline = payByDate(daysUntilDue)

  switch (profile) {
    case 'stable':
      return `Hi ${firstName}, rent is due in ${daysUntilDue} days. Just a heads-up based on your payment history. Reply if you have any questions. Reply STOP to opt out.`

    case 'timing':
      return `Hi ${firstName}, rent of $${r} is due in ${daysUntilDue} days. If your paycheck timing runs close this month, now's a good time to plan ahead. Reply STOP to opt out.`

    case 'chronic':
      return `Hi ${firstName}, rent of $${r} is due in ${daysUntilDue} days. Avoid a late fee — pay by ${deadline} on ${dueDate}. Reply STOP to opt out.`

    case 'repeat':
      return `Hi ${firstName}, rent of $${r} is due in ${daysUntilDue} days. Your account requires on-time payment. Due date: ${deadline}. Reply STOP to opt out.`

    case 'distress':
      return `Hi ${firstName}, rent is due in ${daysUntilDue} days. If this month is difficult, reply now — we can work something out before ${dueDate}. Reply STOP to opt out.`
  }
}

export function preDueUrgentSms(
  profile: TenantProfile,
  firstName: string,
  daysUntilDue: number,
): string {
  const when = daysUntilDue === 0 ? 'today' : 'tomorrow'

  switch (profile) {
    case 'stable':
      return `Hi ${firstName}, rent is due ${when}. Please make sure payment is ready. Reply with any questions. Reply STOP to opt out.`

    case 'timing':
      return `Hi ${firstName}, rent is due ${when}. If timing is off, reply to arrange a quick split payment. Reply STOP to opt out.`

    case 'chronic':
      return `Hi ${firstName}, rent is due ${when}. Pay today to avoid a late fee. Reply STOP to opt out.`

    case 'repeat':
      return `Hi ${firstName}, rent is due ${when}. Non-payment triggers a late fee and further action. Reply STOP to opt out.`

    case 'distress':
      return `Hi ${firstName}, rent is due ${when}. If you need help, reply now — options are available before this becomes an issue. Reply STOP to opt out.`
  }
}

export function preDueDelinquentWarningSms(
  profile: TenantProfile,
  firstName: string,
  balance: number,
  rentAmount: number,
  daysUntilDue: number,
): string {
  const b = balance.toLocaleString()
  const r = rentAmount.toLocaleString()
  const total = (balance + rentAmount).toLocaleString()
  const days = `${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`
  const deadline = payByDate(daysUntilDue)

  switch (profile) {
    case 'stable':
      return `Hi ${firstName}, you have a $${b} balance and $${r} due in ${days}. Please arrange payment or reply to discuss options. Reply STOP to opt out.`

    case 'timing':
      return `Hi ${firstName}, $${b} outstanding + $${r} due in ${days} — total $${total}. Reply to arrange a split payment before it stacks further. Reply STOP to opt out.`

    case 'chronic':
      return `Hi ${firstName}, $${b} outstanding + $${r} due in ${days}. Resolve by ${deadline} to avoid late fees on both. Reply STOP to opt out.`

    case 'repeat':
      return `Hi ${firstName}, $${b} outstanding + $${r} due in ${days}. Full payment required by ${deadline} to avoid formal action. Reply STOP to opt out.`

    case 'distress':
      return `Hi ${firstName}, $${b} outstanding + $${r} due in ${days}. Reply to discuss options — we want to help you stay current. Reply STOP to opt out.`
  }
}

export function phase1ProactiveReminderSms(
  profile: TenantProfile,
  firstName: string,
  rentAmount: number,
  daysUntilDue: number,
): string {
  const r = rentAmount > 0 ? ` of $${rentAmount.toLocaleString()}` : ''
  const deadline = payByDate(daysUntilDue)

  switch (profile) {
    case 'stable':
      return `Hi ${firstName}, rent${r} is due in ${daysUntilDue} days. Heads up based on your payment history. Reply with any questions. Reply STOP to opt out.`

    case 'timing':
      return `Hi ${firstName}, rent${r} is due in ${daysUntilDue} days. If your pay cycle runs close, now's the time to plan ahead to avoid a late fee. Reply STOP to opt out.`

    case 'chronic':
      return `Hi ${firstName}, rent${r} is due in ${daysUntilDue} days. Pay by ${deadline} to avoid a late fee. Reply STOP to opt out.`

    case 'repeat':
      return `Hi ${firstName}, rent${r} is due in ${daysUntilDue} days. On-time payment is required — due date: ${deadline}. Reply STOP to opt out.`

    case 'distress':
      return `Hi ${firstName}, rent${r} is due in ${daysUntilDue} days. If this month is difficult, reach out now — options are available. Reply STOP to opt out.`
  }
}
