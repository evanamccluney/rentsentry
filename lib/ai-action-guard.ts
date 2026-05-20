const HIGH_IMPACT_TOOLS = new Set([
  "update_tenants",
  "record_payment",
  "postpone_next_contact",
  "approve_automation",
  "block_automation",
  "send_sms",
  "schedule_sms",
  "send_split_pay_offer",
  "schedule_split_pay_offer",
])

const CONFIRMATION_PATTERNS = [
  /\bconfirm\b/i,
  /\byes\b/i,
  /\byep\b/i,
  /\bdo it\b/i,
  /\bgo ahead\b/i,
  /\bapproved?\b/i,
  /\bsend it\b/i,
  /\bsend now\b/i,
  /\brecord it\b/i,
  /\bmake the change\b/i,
]

export function isHighImpactAITool(name: string): boolean {
  return HIGH_IMPACT_TOOLS.has(name)
}

export function userExplicitlyConfirmed(message: string): boolean {
  return CONFIRMATION_PATTERNS.some(pattern => pattern.test(message))
}

export function summarizePendingAITools(toolNames: string[]): string {
  const unique = [...new Set(toolNames)]
  return unique.length === 1 ? unique[0] : unique.join(", ")
}
