type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

type SituationLogInput = {
  text: string
  tenantName: string
  balanceDue: number
  rentAmount: number
  askedClarifyingQuestions?: boolean
}

const GENERIC_PROMPTS = [
  "help me decide",
  "help me decide the next step",
  "what should i do",
  "what do i do",
  "next step",
]

const RELEVANT_PATTERNS = [
  /repair|maintenance|mold|leak|plumb|habitability|broken|heat|ac|water|sewer|septic|inspection|access/i,
  /promise|promised|pay|payment|friday|monday|tuesday|wednesday|thursday|next week|tomorrow|partial/i,
  /hardship|lost job|hours cut|medical|sick|divorce|custody|emergency/i,
  /dispute|wrong balance|doesn't owe|does not owe|withhold|refuse|not paying/i,
  /no response|not responding|ghost|quiet|ignored|won't answer|will not answer/i,
  /attorney|court|eviction|notice|pay or quit|legal/i,
]

function inferResponseType(text: string) {
  if (/repair|maintenance|mold|leak|plumb|habitability|broken|heat|ac|water|sewer|septic|inspection|access/i.test(text)) {
    return "dispute_repair"
  }
  if (/promise|promised|pay|payment|friday|monday|tuesday|wednesday|thursday|next week|tomorrow|partial/i.test(text)) {
    return "promised_to_pay"
  }
  if (/hardship|lost job|hours cut|medical|sick|divorce|custody|emergency/i.test(text)) {
    return "hardship"
  }
  if (/no response|not responding|ghost|quiet|ignored|won't answer|will not answer/i.test(text)) {
    return "no_response"
  }
  if (/dispute|wrong balance|doesn't owe|does not owe|withhold|refuse|not paying/i.test(text)) {
    return "dispute"
  }
  return "other"
}

export function latestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find(message => message.role === "user")?.content?.trim() ?? ""
}

export function assistantAskedClarifyingQuestions(messages: ChatMessage[]) {
  const latestAssistant = [...messages].reverse().find(message => message.role === "assistant")?.content ?? ""
  return /Questions To Confirm|\*\*Questions To Confirm\*\*|\?\s*$|1\.\s/i.test(latestAssistant)
}

export function shouldAutoLogAIContext(text: string, askedClarifyingQuestions = false) {
  const normalized = text.trim().toLowerCase()
  if (normalized.length < 8) return false
  if (GENERIC_PROMPTS.includes(normalized)) return false
  if (GENERIC_PROMPTS.some(prompt => normalized === prompt || normalized === `${prompt}?`)) return false
  if (RELEVANT_PATTERNS.some(pattern => pattern.test(text))) return true
  return askedClarifyingQuestions && normalized.length >= 18
}

export function buildAISituationLog(input: SituationLogInput) {
  const responseType = inferResponseType(input.text)
  const repairIssue = responseType === "dispute_repair"
  const promisedPayment = responseType === "promised_to_pay"

  return {
    type: "situation_intake",
    status: "logged",
    notes: [
      "Auto-logged from AI chat.",
      input.askedClarifyingQuestions ? "PM answered AI follow-up questions." : "PM shared tenant context in AI chat.",
      `PM note: ${input.text}`,
    ].join("\n"),
    snapshot: {
      source: "ai_chat",
      auto_logged: true,
      response_type: responseType,
      tenant_statement: input.text,
      promised_date: null,
      promised_amount: null,
      broken_promise: /broken promise|missed|didn't pay|did not pay|failed to pay/i.test(input.text),
      repair_issue: repairIssue,
      repair_notes: repairIssue ? input.text : null,
      preferred_outcome: "unsure",
      promise_mentioned: promisedPayment,
      tenant_name: input.tenantName,
      balance_due: input.balanceDue,
      rent_amount: input.rentAmount,
    },
  }
}
