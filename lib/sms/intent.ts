export type SmsIntent = "send_payment_link" | "send_plan_link" | "escalate_to_pm" | "setup_autopay"

export function detectIntent(msg: string): SmsIntent | null {
  const m = msg.toLowerCase()
  if (/installment|\bpayment\s+plan\b|pay\s+over\s+time|split\s+(my\s+)?(pay|rent|balance)|spread\s+(my\s+)?(pay|rent|balance)|partial\s+pay|multiple\s+pay|pay\s+in\s+part|two\s+pay|three\s+pay/.test(m))
    return "send_plan_link"
  if (/pay\s+now|pay\s+in\s+full|pay\s+today|pay\s+it\s+all|pay\s+everything|full\s+pay|pay.*balance|pay\s+online|send.*link|want\s+to\s+pay|how\s+do\s+i\s+pay/.test(m))
    return "send_payment_link"
  if (/\bauto.?pay\b|automatic\s+pay|set\s+up\s+(pay|auto)|recurring\s+pay|auto\s+charge|save\s+(my\s+)?(card|bank|payment)/.test(m))
    return "setup_autopay"
  if (/speak\s+to|talk\s+to|call\s+me|call\s+back|\bdispute\b|not\s+my\s+(balance|charge|amount)|wrong\s+amount|maintenance|broken|repair/.test(m))
    return "escalate_to_pm"
  return null
}
