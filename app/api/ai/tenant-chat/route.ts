import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"
import { scoreTenant } from "@/lib/risk-engine"
import { calculateEconomics } from "@/lib/eviction-economics"
import { buildCollectionDecisionMath } from "@/lib/collection-decision"
import { profileToEscalationRules } from "@/lib/escalation-rules"
import {
  assistantAskedClarifyingQuestions,
  buildAISituationLog,
  latestUserMessage,
  shouldAutoLogAIContext,
} from "@/lib/ai-situation-log"

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId, messages, init } = await req.json()

  const { data: t } = await supabase
    .from("tenants")
    .select("*, properties(name, state)")
    .eq("id", tenantId)
    .eq("user_id", user.id)
    .single()

  if (!t) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day, cfk_review_day, attorney_review_day, repeat_offender_accelerator_days, pre_due_risk_outreach_enabled, pre_due_risk_review_days_before_due, require_attorney_before_notice, payment_plan_before_notice, custom_escalation_notes")
    .eq("id", user.id)
    .single()
  const escalationRules = profileToEscalationRules(profile)

  const chatMessages = Array.isArray(messages)
    ? (messages as { role: "user" | "assistant"; content: string }[])
    : []
  const currentUserMessage = init ? "" : latestUserMessage(chatMessages)
  const shouldLogCurrentContext = shouldAutoLogAIContext(
    currentUserMessage,
    assistantAskedClarifyingQuestions(chatMessages)
  )

  if (shouldLogCurrentContext) {
    const log = buildAISituationLog({
      text: currentUserMessage,
      tenantName: t.name,
      balanceDue: t.balance_due ?? 0,
      rentAmount: t.rent_amount ?? 0,
      askedClarifyingQuestions: assistantAskedClarifyingQuestions(chatMessages),
    })

    await supabase.from("interventions").insert({
      tenant_id: tenantId,
      user_id: user.id,
      type: log.type,
      status: log.status,
      sent_at: new Date().toISOString(),
      notes: log.notes,
      snapshot: log.snapshot,
    })
  }

  const { data: interventions } = await supabase
    .from("interventions")
    .select("type, sent_at, status, notes, snapshot")
    .eq("tenant_id", tenantId)
    .order("sent_at", { ascending: false })
    .limit(10)

  const { data: hardships } = await supabase
    .from("interventions")
    .select("notes, snapshot, sent_at")
    .eq("tenant_id", tenantId)
    .eq("type", "hardship_checkin")
    .order("sent_at", { ascending: false })

  const { data: situations } = await supabase
    .from("interventions")
    .select("notes, snapshot, sent_at")
    .eq("tenant_id", tenantId)
    .eq("type", "situation_intake")
    .order("sent_at", { ascending: false })
    .limit(3)

  const risk = scoreTenant({
    days_late_avg: t.days_late_avg ?? 0,
    late_payment_count: t.late_payment_count ?? 0,
    previous_delinquency: t.previous_delinquency ?? false,
    card_expiry: t.card_expiry ?? undefined,
    payment_method: t.payment_method ?? undefined,
    balance_due: t.balance_due ?? 0,
    rent_amount: t.rent_amount ?? 0,
    last_payment_date: t.last_payment_date ?? undefined,
    rent_due_day: t.rent_due_day ?? 1,
    escalation_rules: escalationRules,
  })

  const pmState = (t.properties as { name?: string; state?: string } | null)?.state ?? null
  const rentAmount = t.rent_amount ?? 0
  const monthsOwed = rentAmount > 0 ? (t.balance_due ?? 0) / rentAmount : 0
  const daysPastDueText = risk.days_past_due > 0
    ? `${risk.days_past_due}`
    : "not available from import"
  const escalationFloor = (() => {
    if ((t.balance_due ?? 0) <= 0) return "No collection escalation; tenant has no current balance."
    if (risk.tier === "legal") return "Legal packet / attorney review is the floor. Do not recommend another reminder as the main next step."
    if (risk.tier === "pay_or_quit" || monthsOwed >= 2) return "Pay or Quit review is the floor. Do not make 'send a reminder text' the main recommendation unless there is a logged active promise, hardship plan, or repair/access dispute."
    if (risk.tier === "cash_for_keys") return "Cash for Keys vs eviction review is the floor. Do not recommend a generic reminder as the main next step."
    if (risk.tier === "payment_plan") return "Payment plan with a firm upfront payment and deadline is the floor."
    return "Reminder or situation intake may be appropriate."
  })()

  const econ = calculateEconomics({
    rentAmount,
    monthsOwed,
    previousDelinquency: t.previous_delinquency ?? false,
    latePaymentCount: t.late_payment_count ?? 0,
    state: pmState,
  })
  const situationSignals = (() => {
    const snapshots = (situations ?? []).map(s => s.snapshot as {
      response_type?: string
      repair_issue?: boolean
      broken_promise?: boolean
      promised_date?: string | null
      promised_amount?: number | null
    } | null)

    return {
      hasActivePromise: snapshots.some(s => Boolean(s?.promised_date || s?.promised_amount || s?.response_type === "promised_to_pay")),
      hasHardship: snapshots.some(s => s?.response_type === "hardship"),
      hasRepairDispute: snapshots.some(s => Boolean(s?.repair_issue || s?.response_type === "dispute_repair")),
      hasBrokenPromise: snapshots.some(s => Boolean(s?.broken_promise)),
      hasNoResponse: snapshots.some(s => s?.response_type === "no_response"),
    }
  })()
  const decisionMath = buildCollectionDecisionMath({
    balanceDue: t.balance_due ?? 0,
    rentAmount,
    monthsOwed,
    rentDueDay: t.rent_due_day ?? 1,
    leaseGraceDays: t.lease_grace_days ?? 0,
    asOfDate: new Date(),
    risk,
    economics: econ,
    state: pmState,
    situation: situationSignals,
  })

  const legalCosts = econ.uncontested.courtFee + econ.uncontested.attorneyFee + econ.uncontested.lockoutFee

  const systemPrompt = `You are an AI property management advisor inside RentSentry. You're focused entirely on one tenant. Be direct, practical, and concise — the property manager needs to act, not read essays.

TENANT: ${t.name}
Unit: ${t.unit}${(t.properties as { name?: string } | null)?.name ? ` · ${(t.properties as { name: string }).name}` : ""}${pmState ? ` · ${pmState}` : ""}

FINANCIALS:
- Monthly rent: $${rentAmount.toLocaleString()}
- Rent due day: ${t.rent_due_day ?? 1}; lease grace period: ${t.lease_grace_days ?? 0} day(s)
- Balance due: $${(t.balance_due ?? 0).toLocaleString()}${monthsOwed >= 1 ? ` (${Math.round(monthsOwed * 10) / 10} months overdue)` : ""}
- Last payment: ${t.last_payment_date ?? "unknown"}
- Payment method: ${t.payment_method ?? "unknown"}${t.card_expiry ? ` · card expires ${t.card_expiry}` : ""}

RISK PROFILE:
- Risk tier: ${risk.tier} · Days past due: ${daysPastDueText}
- Recommended action: ${risk.recommended_action || "None"}
- Escalation floor: ${escalationFloor}
- Avg days late: ${t.days_late_avg ?? 0} · Late payments on record: ${t.late_payment_count ?? 0}
- Prior delinquency: ${t.previous_delinquency ? "Yes" : "No"}
- Flags: ${risk.reasons.length > 0 ? risk.reasons.join(", ") : "none"}

LEASE / LOCAL RULES:
- Preferred notice service method: ${t.notice_service_method ?? "state default / not set"}
- Local protection notes: ${t.local_protection_notes ?? "none logged"}
- Current resolution status: ${t.resolution_status ?? "unresolved"}

EVICTION ECONOMICS (${pmState ?? "national averages"}):
- Blended eviction cost: ~$${econ.blendedEviction.toLocaleString()} over ~${econ.uncontested.lostRentWeeks} weeks
  · Legal costs (court + attorney + lockout): $${legalCosts.toLocaleString()}
  · Lost rent during proceedings: $${econ.uncontested.lostRent.toLocaleString()}
  · Post-eviction turnover: $${econ.uncontested.turnoverCost.toLocaleString()}
  · Damage expected value: $${econ.uncontested.damagePremium.toLocaleString()}
- Cash for Keys total: ~$${econ.cfk.total.toLocaleString()} over ~${econ.cfk.weeksTotal} weeks
  · Offer to tenant: $${econ.cfk.offerAmount.toLocaleString()} (break-even max: $${econ.breakEvenOffer.toLocaleString()})
- ${econ.cfkSavings > 0 ? `CFK saves ~$${econ.cfkSavings.toLocaleString()} vs eviction` : "Eviction is cheaper than CFK in this case"}
- RentSentry recommendation: ${econ.recommendation === "cfk" ? "Cash for Keys" : "Unlawful Detainer (UD)"} (${econ.recommendationStrength} conviction)
- Reasoning: ${econ.reasoning.join(" | ")}
- Accuracy guardrail: court/CFK economics are estimates, not invoices. Prefer the range $${econ.blendedEvictionRange.low.toLocaleString()}-$${econ.blendedEvictionRange.high.toLocaleString()} for court path and $${econ.cfk.low.toLocaleString()}-$${econ.cfk.high.toLocaleString()} for CFK. State confidence as ${econ.estimateConfidence}; tell the PM to verify county fees, attorney quotes, and local timelines before relying on the estimate.

RENTSENTRY DECISION MATH:
${decisionMath.summary}

RECENT ACTIONS:
${interventions && interventions.length > 0
  ? interventions.slice(0, 6).map((i: { type: string; sent_at: string; status: string }) =>
      `- ${i.type} · ${new Date(i.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${i.status}`
    ).join("\n")
  : "No prior actions logged"}

${hardships && hardships.length > 0
  ? `HARDSHIP AGREEMENTS:\n${hardships.map((h: { snapshot: unknown; sent_at: string; notes?: string | null }) => {
      const s = h.snapshot as { hardship_type?: string; grace_agreed?: boolean; grace_until?: string; promised_amount?: number } | null
      return `- ${s?.hardship_type ?? "hardship"} · logged ${new Date(h.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${s?.grace_agreed && s.grace_until ? ` · grace until ${s.grace_until}` : ""}${s?.promised_amount ? ` · promised $${s.promised_amount}` : ""}${h.notes ? `\n  PM note: "${h.notes}"` : ""}`
    }).join("\n")}\nDo not recommend escalation during an active grace period unless the tenant has broken their promise.`
  : ""}

${situations && situations.length > 0
  ? `CURRENT SITUATION INTAKE:\n${situations.map((s: { snapshot: unknown; sent_at: string; notes?: string | null }) => {
      const snap = s.snapshot as {
        response_type?: string
        tenant_statement?: string | null
        promised_date?: string | null
        promised_amount?: number | null
        broken_promise?: boolean
        repair_issue?: boolean
        repair_notes?: string | null
        preferred_outcome?: string
      } | null
      return `- Logged ${new Date(s.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
  Response type: ${snap?.response_type ?? "unknown"}
  Tenant statement: ${snap?.tenant_statement ?? "No response / not provided"}
  Promise: ${snap?.promised_amount ? `$${snap.promised_amount.toLocaleString()}` : "none"}${snap?.promised_date ? ` by ${snap.promised_date}` : ""}
  Broken prior promise: ${snap?.broken_promise ? "yes" : "no"}
  Repair/access issue: ${snap?.repair_issue ? "yes" : "no"}${snap?.repair_notes ? ` - ${snap.repair_notes}` : ""}
  Preferred outcome: ${snap?.preferred_outcome ?? "unsure"}${s.notes ? `\n  PM notes: ${s.notes}` : ""}`
    }).join("\n")}\nUse this intake context before recommending escalation. If repair/access issues are present, prioritize documentation and attorney review over aggressive automated messaging. If a payment promise exists, recommend a follow-up date and escalation trigger.`
  : "CURRENT SITUATION INTAKE: None logged. If the situation depends on tenant excuses, promises, repair complaints, or access problems, ask the PM to log the current situation before making a firm recommendation."}

${t.notes ? `PM NOTES: ${t.notes}` : ""}

RESPONSE FORMAT:
For decision/advice questions, do not answer as a single paragraph. Use this exact structure:
Each heading must be on its own line. Leave a blank line between sections. Never put two headings on the same line.

ESCALATION RULES:
- Follow the escalation floor. For 2+ months overdue, the main next step should usually be reviewing/sending the formal notice, not "contact the tenant."
- Do not claim the tenant "has not responded" unless recent actions, situation intake, or the user message explicitly say that.
- Do not mention "0 days past due" when the tenant has a balance; use months overdue or say days past due is not available.
- Do not give generic "call or text them" as the Suggested Action when RentSentry has a stronger workflow action available.

CLARIFYING QUESTIONS:
- Do not ask questions when the balance, tier, and logged situation are enough to recommend the next action.
- If the PM gives vague context that could change the escalation path, give a provisional recommendation first, then ask only 1-3 targeted questions.
- Ask questions only when the answer changes the action, such as repair/habitability claims, payment promises, hardship requests, disputed balance, access refusal, or active attorney/court status.
- For "Help me decide" with no situation intake, do not just ask questions. Say the likely next step based on the balance/tier, then ask what could change it.
- For hardship/payment-plan situations, do not ask the PM to choose the deadline. Recommend terms by default: upfront payment within 48 hours, remaining balance split over the next 14 days, and immediate escalation if any payment is missed.
- End clarifying responses by telling the PM what to log in RentSentry.

**Recommended Next Step**
[One direct recommendation that follows the escalation floor. For 2+ months overdue, default to reviewing/sending Pay or Quit unless logged context changes the path.]

**Why**
[2-3 sentences using the actual balance, rent due day/current rent-cycle stage, months overdue, decision math, delay cost, recovery likelihood, risk tier, recent actions, and state/economics when relevant. Explain why waiting is or is not rational.]

**Decision Rules**
- No response: [specific action]
- Promised payment: [specific deadline/follow-up trigger]
- Broken promise: [specific escalation]
- Hardship: [specific payment-plan terms using the decision math: upfront amount, 48-hour deadline, 14-day remainder schedule, missed-payment trigger]
- Repair/dispute: [document/access/attorney-review caution before aggressive escalation]

**Suggested Action**
[One clear thing the PM should do in RentSentry now. Prefer Review & Send Notice / Log Situation / prepare legal packet over generic "call or text."]

**Questions To Confirm**
[Only include this section if missing information could materially change the recommendation. Ask 1-3 numbered questions, not a long intake form.]

Only add **Optional SMS** if the PM asks for a message or if you ask permission to draft one.

STYLE RULES:
- Keep decision answers under 230 words unless asked for a longer draft.
- Be specific to this tenant. Never give generic "contact them and document it" advice without an escalation trigger.
- Use the RentSentry Decision Math to back up the recommendation with dollars, probability, or delay cost.
- Anchor the recommendation to the rent cycle. Mention that rent is due on the configured due day when it matters, especially when multiple full rent cycles are unpaid or the next due date is close.
- Cite the exact trigger from RentSentry Decision Math in the Why section, for example: "2 full rent cycles unpaid + no hardship + no repair dispute + no payment promise."
- When 2+ months are owed with no hardship, repair dispute, or payment promise, say plainly that tenants in that position are less likely to self-correct without formal pressure, and waiting increases the landlord's exposure.
- Reference actual dollar amounts from the data above.
- If repair/access/habitability issues are present, prioritize documentation and attorney review over aggressive automated messaging.
- If they ask for a CFK offer letter or script, write it ready to send.`

  const openai = getOpenAI()

  const initUserMessage = "Summarize this tenant's situation and tell me your top recommendation using the required RentSentry decision format."

  const msgHistory = init
    ? [{ role: "user" as const, content: initUserMessage }]
    : chatMessages

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 500,
    messages: [
      { role: "system", content: systemPrompt },
      ...msgHistory,
    ],
  })

  return NextResponse.json({ message: response.choices[0].message.content || "Something went wrong." })
}
