import OpenAI from "openai"

const openai = new OpenAI()

const ACTION_CONTEXT: Record<string, string> = {
  payment_reminder:
    "a payment reminder — the tenant has an overdue balance. Invite them to reply directly to this message to ask questions, arrange payment, or request a payment plan.",
  proactive_reminder:
    "a proactive heads-up sent before rent is due, based on this tenant's pattern of paying late — friendly but direct. Invite them to reply if they anticipate any issues.",
  card_expiry_alert:
    "a payment method expiry alert — the card or account on file is expiring soon and needs to be updated before rent is due",
  split_pay_offer:
    "an installment plan offer — let the tenant know their property manager is offering to split their balance into payments and that a link to choose their plan is included in this message. Keep it warm and clear.",
  cash_for_keys:
    "a time-sensitive message that the property manager needs to speak with the tenant about their housing situation today — do not hint at what the conversation is about or mention move-out",
  legal_packet:
    "an urgent final notice — the tenant has not responded to prior outreach and this is the last contact before the property manager escalates. The tone must be serious and urgent. Do NOT mention eviction, court, attorneys, legal proceedings, or filing — but make clear this requires immediate action.",
}

export interface SmsDraftContext {
  name: string
  balance_due?: number
  rent_amount?: number
  days_past_due?: number
  days_late_avg?: number
  late_payment_count?: number
  previous_delinquency?: boolean
  tier?: string
  late_fee_day?: number
}

export async function generateSmsDraft(
  actionType: string,
  tenant: SmsDraftContext,
  situationNotes?: string | null
): Promise<string | null> {
  const description = ACTION_CONTEXT[actionType]
  if (!description) return null

  const firstName = tenant.name.split(" ")[0]
  const contextLines: string[] = [`Tenant first name: ${firstName}`]
  if ((tenant.balance_due ?? 0) > 0) contextLines.push(`Outstanding balance: $${Number(tenant.balance_due).toLocaleString()}`)
  if ((tenant.days_past_due ?? 0) > 0) contextLines.push(`Days past due: ${tenant.days_past_due}`)
  if ((tenant.late_payment_count ?? 0) > 0) contextLines.push(`Late payments on record: ${tenant.late_payment_count}`)
  if (tenant.previous_delinquency) contextLines.push(`Has a prior delinquency history`)
  if ((tenant.days_late_avg ?? 0) > 3) contextLines.push(`Typically pays ${Math.round(tenant.days_late_avg!)} days late on average`)
  if ((tenant.rent_amount ?? 0) > 0) contextLines.push(`Monthly rent: $${Number(tenant.rent_amount).toLocaleString()}`)
  if (tenant.late_fee_day && (tenant.days_past_due ?? 0) < tenant.late_fee_day) {
    contextLines.push(`Late fee kicks in on Day ${tenant.late_fee_day} — mention this deadline if relevant`)
  }
  if (situationNotes) contextLines.push(`\nLandlord-logged situation context (use this to personalize the message):\n${situationNotes}`)

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You write SMS messages from a property manager to a tenant about rent or housing matters.

Non-negotiable rules:
- Use ONLY the facts provided. Never invent dates, deadlines, dollar amounts not given, names, or any other details.
- Never mention eviction, court, legal proceedings, attorneys, sheriffs, or lawsuits — not even implied.
- Do not be aggressive, threatening, or condescending. Professional and direct only.
- Address the tenant by first name only.
- Write as if from the property manager. Never mention "RentSentry" or any software product.
- You MUST end the message with exactly: "Reply STOP to opt out."
- The entire message including the STOP line must be 160 characters or fewer. Be concise — cut filler words ruthlessly.
- Never say "contact your property manager" — this IS an automated system that can handle replies. Say "reply to this message" instead.
- Never say "us" or "we" — write as "I" (the automated system speaking for the property manager).
- Return only the raw SMS body. No subject line, no greeting header, no explanation, no quotes around the message.`,
        },
        {
          role: "user",
          content: `Write ${description} SMS.\n\nContext:\n${contextLines.join("\n")}`,
        },
      ],
    })

    return response.choices[0]?.message?.content?.trim() ?? null
  } catch {
    return null
  }
}

// Determine the right action type for an automated send based on tenant risk profile
export function autoActionType(
  days: number,
  latePaymentCount: number,
  daysLateAvg: number,
  previousDelinquency: boolean,
  paymentPlanDay: number
): string {
  const isStruggling = latePaymentCount >= 2 || daysLateAvg >= 5 || previousDelinquency

  // Struggling tenant past grace period → offer payment plan proactively
  if (isStruggling && days >= 3) return "split_pay_offer"

  // Everyone at or past the payment plan threshold → offer payment plan
  if (days >= paymentPlanDay) return "split_pay_offer"

  // First-time or rarely-late tenant → standard reminder
  return "payment_reminder"
}

// Fallback static messages if AI generation fails
export function fallbackSms(actionType: string, name: string, days: number, balance: number, lateFeeDay?: number): string {
  const firstName = name.split(" ")[0]
  const feeWarning = lateFeeDay && days < lateFeeDay ? ` Pay before Day ${lateFeeDay} to avoid a late fee.` : ""
  if (actionType === "split_pay_offer") {
    return `Hi ${firstName}, your balance of $${balance.toLocaleString()} is ${days} days past due. Choose a payment plan that works for you: [link] Reply STOP to opt out.`
  }
  if (days <= 1) {
    return `Hi ${firstName}, your rent is due.${feeWarning} Reply to this message with any questions. Reply STOP to opt out.`
  }
  return `Hi ${firstName}, your rent is ${days} days past due — $${balance.toLocaleString()} owed.${feeWarning} Reply to this message to arrange payment. Reply STOP to opt out.`
}
