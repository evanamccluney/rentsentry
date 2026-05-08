import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"
import { STATE_RULES } from "@/lib/pay-or-quit"
import { scoreTenant } from "@/lib/risk-engine"
import { calculateEconomics } from "@/lib/eviction-economics"
import { buildCollectionDecisionMath } from "@/lib/collection-decision"
import { profileToEscalationRules } from "@/lib/escalation-rules"
import {
  assistantAskedClarifyingQuestions,
  buildAISituationLog,
  shouldAutoLogAIContext,
} from "@/lib/ai-situation-log"

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId, message, history = [] } = await req.json()
  if (!tenantId || !message) return NextResponse.json({ error: "Missing tenantId or message" }, { status: 400 })

  // Fetch full tenant + property
  const { data: tenant } = await supabase
    .from("tenants")
    .select("*, properties(name, address, state)")
    .eq("id", tenantId)
    .eq("user_id", user.id)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day, cfk_review_day, attorney_review_day, repeat_offender_accelerator_days, pre_due_risk_outreach_enabled, pre_due_risk_review_days_before_due, require_attorney_before_notice, payment_plan_before_notice, custom_escalation_notes")
    .eq("id", user.id)
    .single()
  const escalationRules = profileToEscalationRules(profile)

  const chatHistory = Array.isArray(history)
    ? (history as { role: "user" | "assistant"; content: string }[])
    : []
  const shouldLogCurrentContext = shouldAutoLogAIContext(
    message,
    assistantAskedClarifyingQuestions(chatHistory)
  )

  if (shouldLogCurrentContext) {
    const log = buildAISituationLog({
      text: message,
      tenantName: tenant.name,
      balanceDue: tenant.balance_due ?? 0,
      rentAmount: tenant.rent_amount ?? 0,
      askedClarifyingQuestions: assistantAskedClarifyingQuestions(chatHistory),
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

  // Fetch recent interventions for this tenant
  const { data: interventions } = await supabase
    .from("interventions")
    .select("type, status, sent_at")
    .eq("tenant_id", tenantId)
    .order("sent_at", { ascending: false })
    .limit(5)

  // Fetch recent payments
  const { data: payments } = await supabase
    .from("payments")
    .select("amount, date, note")
    .eq("tenant_id", tenantId)
    .order("date", { ascending: false })
    .limit(3)

  const { data: situations } = await supabase
    .from("interventions")
    .select("snapshot")
    .eq("tenant_id", tenantId)
    .eq("type", "situation_intake")
    .order("sent_at", { ascending: false })
    .limit(3)

  // Build tenant context
  const prop = tenant.properties as { name?: string; address?: string; state?: string } | null
  const stateCode = (prop?.state ?? "").toUpperCase()
  const stateRule = stateCode ? STATE_RULES[stateCode] : null
  const balanceMonths = tenant.rent_amount > 0
    ? Math.round((tenant.balance_due / tenant.rent_amount) * 10) / 10
    : 0
  const risk = scoreTenant({
    days_late_avg: tenant.days_late_avg ?? 0,
    late_payment_count: tenant.late_payment_count ?? 0,
    previous_delinquency: tenant.previous_delinquency ?? false,
    card_expiry: tenant.card_expiry ?? undefined,
    payment_method: tenant.payment_method ?? undefined,
    balance_due: tenant.balance_due ?? 0,
    rent_amount: tenant.rent_amount ?? 0,
    last_payment_date: tenant.last_payment_date ?? undefined,
    rent_due_day: tenant.rent_due_day ?? 1,
    escalation_rules: escalationRules,
  })
  const daysPastDue = Math.max(tenant.days_past_due ?? 0, risk.days_past_due ?? 0)
  const daysPastDueText = daysPastDue > 0
    ? `${daysPastDue} days past due`
    : "days past due not available from import"
  const escalationFloor = (() => {
    if ((tenant.balance_due ?? 0) <= 0) return "No collection escalation; tenant has no current balance."
    if (risk.tier === "legal") return "Legal packet / attorney review is the floor. Do not recommend another reminder as the main next step."
    if (risk.tier === "pay_or_quit" || balanceMonths >= 2) return "Pay or Quit review is the floor. Do not make 'send a reminder text' the main recommendation unless there is a logged active promise, hardship plan, or repair/access dispute."
    if (risk.tier === "cash_for_keys") return "Cash for Keys vs eviction review is the floor. Do not recommend a generic reminder as the main next step."
    if (risk.tier === "payment_plan") return "Payment plan with a firm upfront payment and deadline is the floor."
    return "Reminder or situation intake may be appropriate."
  })()
  const now = new Date()
  const economics = calculateEconomics({
    rentAmount: tenant.rent_amount ?? 0,
    monthsOwed: balanceMonths,
    previousDelinquency: tenant.previous_delinquency ?? false,
    latePaymentCount: tenant.late_payment_count ?? 0,
    state: stateCode,
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
    balanceDue: tenant.balance_due ?? 0,
    rentAmount: tenant.rent_amount ?? 0,
    monthsOwed: balanceMonths,
    rentDueDay: tenant.rent_due_day ?? 1,
    leaseGraceDays: tenant.lease_grace_days ?? 0,
    asOfDate: now,
    risk,
    economics,
    state: stateCode,
    situation: situationSignals,
  })

  const today = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })

  // Derive explicit delinquency status so the AI can't misread it
  const isCurrentlyOverdue = (tenant.balance_due ?? 0) > 0
  const delinquencyStatus = isCurrentlyOverdue
    ? `CURRENTLY DELINQUENT — $${(tenant.balance_due ?? 0).toLocaleString()} unpaid (${balanceMonths > 0 ? `${balanceMonths} month${balanceMonths !== 1 ? "s" : ""}` : "partial month"} overdue, ${tenant.days_past_due ?? 0} days past due)`
    : "CURRENT — no balance owed"

  const decisionStatus = isCurrentlyOverdue
    ? `CURRENTLY DELINQUENT - $${(tenant.balance_due ?? 0).toLocaleString()} unpaid (${balanceMonths > 0 ? `${balanceMonths} month${balanceMonths !== 1 ? "s" : ""}` : "partial month"} overdue, ${daysPastDueText})`
    : "CURRENT - no balance owed"
  void delinquencyStatus

  const systemPrompt = `You are a property management advisor built into RentSentry, a rent collection tool for landlords.
A property manager is asking for advice about a specific tenant. Give direct, actionable guidance calibrated exactly to this tenant's situation.

TODAY: ${today}

TENANT PROFILE:
- Name: ${tenant.name}
- Unit: ${tenant.unit}${prop?.name ? ` at ${prop.name}` : ""}${prop?.address ? ` (${prop.address})` : ""}
- State: ${stateCode || "Unknown"}${stateRule ? ` — ${stateRule.title} (${stateRule.days}-day notice required)` : ""}
- Rent: $${(tenant.rent_amount ?? 0).toLocaleString()}/mo
- Rent Due Day: ${tenant.rent_due_day ?? 1}
- Lease Grace Period: ${tenant.lease_grace_days ?? 0} day(s)
- Payment Status: ${decisionStatus}
- RentSentry Risk Tier: ${risk.tier}
- RentSentry Recommended Action: ${risk.recommended_action || "None"}
- Escalation Floor: ${escalationFloor}
- Historical Late Payments: ${tenant.late_payment_count ?? 0} recorded (avg ${tenant.days_late_avg ?? 0} days late) — NOTE: this count reflects past logged payments only, NOT the current overdue balance above
- Previous Delinquency/Eviction: ${tenant.previous_delinquency ? "Yes" : "No"}
- Payment Method on File: ${tenant.payment_method || "Unknown"}
- Preferred Notice Service Method: ${tenant.notice_service_method || "state default / not set"}
- Local Protection Notes: ${tenant.local_protection_notes || "none logged"}
- Current Resolution Status: ${tenant.resolution_status || "unresolved"}
${stateRule ? `\nSTATE LAW (${stateCode}): ${stateRule.legalText}\nService: ${stateRule.serviceNote}` : ""}

RECENT ACTIONS TAKEN:
${interventions && interventions.length > 0
  ? interventions.map(i => `- ${i.type.replace(/_/g, " ")} (${i.status}) on ${new Date(i.sent_at).toLocaleDateString()}`).join("\n")
  : "- None yet"}

RECENT PAYMENTS:
${payments && payments.length > 0
  ? payments.map(p => `- $${p.amount} on ${p.date}${p.note ? ` (${p.note})` : ""}`).join("\n")
  : "- None recorded"}

RENTSENTRY DECISION MATH:
${decisionMath.summary}

ECONOMICS ACCURACY GUARDRAIL:
- Balance due and monthly rent are ledger/import numbers.
- Rent exposure is calendar-prorated and is not a separate fee.
- Court/CFK economics are estimates, not invoices. If discussing them, prefer ranges: court path $${economics.blendedEvictionRange.low.toLocaleString()}-$${economics.blendedEvictionRange.high.toLocaleString()}, CFK $${economics.cfk.low.toLocaleString()}-$${economics.cfk.high.toLocaleString()}, confidence ${economics.estimateConfidence}.
- Tell the PM to verify county court fees, attorney quotes, lockout fees, and local timelines before relying on those estimates.

YOUR ROLE:
- Be direct and concise — this PM needs to know what to do, not get a lecture
- Always base your advice on the Payment Status field above — it is the ground truth for whether rent is owed right now
- If Historical Late Payments is 0 but the tenant IS currently delinquent, treat them as currently late (possibly first time) — do NOT say they have no late history as if they're on time
- Reference the actual numbers (exact balance, months overdue, days past due, state law) in your advice
- When the PM says the tenant made a promise (e.g. "pays next week"), advise how to hold them to it with documentation and a deadline
- If no response from tenant after an outreach, tell the PM exactly what to do next given the overdue amount and timeline
- If the situation calls for Pay or Quit, Cash for Keys, or starting eviction, say so clearly
- Never give generic landlord advice — every response must be specific to this tenant's current data
- When your advice leads to a specific message worth sending, end with: "Want me to draft an SMS to send ${tenant.name.split(" ")[0]}?" — do NOT include the draft automatically

ESCALATION RULES:
- Follow the Escalation Floor. For 2+ months overdue, the main next step should usually be reviewing/sending the formal notice, not "contact the tenant."
- Do not claim the tenant "has not responded" unless recent actions or the user message explicitly say that.
- Do not mention "0 days past due" when the tenant has a balance; use months overdue or say days past due is not available.
- Do not give generic "call or text them" as the Suggested Action when RentSentry has a stronger workflow action available.

CLARIFYING QUESTIONS:
- Do not ask questions when the balance, tier, and logged situation are enough to recommend the next action.
- If the PM gives vague context that could change the escalation path, give a provisional recommendation first, then ask only 1-3 targeted questions.
- Ask questions only when the answer changes the action, such as repair/habitability claims, payment promises, hardship requests, disputed balance, access refusal, or active attorney/court status.
- For "Help me decide" with no situation intake, do not just ask questions. Say the likely next step based on the balance/tier, then ask what could change it.
- For hardship/payment-plan situations, do not ask the PM to choose the deadline. Recommend terms by default: upfront payment within 48 hours, remaining balance split over the next 14 days, and immediate escalation if any payment is missed.
- End clarifying responses by telling the PM what to log in RentSentry.

RESPONSE FORMAT:
For decision/advice questions, do not answer as a single paragraph. Use this exact structure:
Each heading must be on its own line. Leave a blank line between sections. Never put two headings on the same line.

**Recommended Next Step**
[One direct recommendation that follows the Escalation Floor. For 2+ months overdue, default to reviewing/sending Pay or Quit unless logged context changes the path.]

**Why**
[2-3 sentences using the exact balance, rent due day/current rent-cycle stage, months overdue, decision math, delay cost, recovery likelihood, state, notice rule, and recent actions/payments when relevant. Explain why waiting is or is not rational.]

**Decision Rules**
- No response: [specific action]
- Promised payment: [specific deadline/follow-up trigger]
- Broken promise: [specific escalation]
- Hardship: [specific payment-plan terms using the decision math: upfront amount, 48-hour deadline, 14-day remainder schedule, missed-payment trigger]
- Repair/dispute: [document/access/attorney-review caution before aggressive escalation]

**Suggested Action**
[One clear thing the PM should do now inside RentSentry. Prefer Review & Send Notice / Log Situation / prepare legal packet over generic "call or text."]

**Questions To Confirm**
[Only include this section if missing information could materially change the recommendation. Ask 1-3 numbered questions, not a long intake form.]

Only add **Optional SMS** if the PM asks for a message or if you ask permission to draft one.

STYLE RULES:
- Keep decision answers under 230 words unless asked for a longer draft.
- Do not give generic "contact them and document it" advice unless you also give a deadline and escalation trigger.
- Use the RentSentry Decision Math to back up the recommendation with dollars, probability, or delay cost.
- Anchor the recommendation to the rent cycle. Mention that rent is due on the configured due day when it matters, especially when multiple full rent cycles are unpaid or the next due date is close.
- Cite the exact trigger from RentSentry Decision Math in the Why section, for example: "2 full rent cycles unpaid + no hardship + no repair dispute + no payment promise."
- When 2+ months are owed with no hardship, repair dispute, or payment promise, say plainly that tenants in that position are less likely to self-correct without formal pressure, and waiting increases the landlord's exposure.
- Use bullets where it improves scanability.

SENDING SMS:
Only include a draft when the PM explicitly asks you to (e.g. "yes", "draft it", "send it", "write the message"). When they do, use EXACTLY this format:

---SMS_DRAFT---
[the SMS text here, addressed to the tenant by first name, under 160 chars, plain text only]
---END_DRAFT---

Do not include the draft block unless the PM has asked for it in this conversation.`

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 600,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message },
    ],
  })

  const text = response.choices[0]?.message?.content || "Something went wrong."
  return NextResponse.json({ message: text })
}
