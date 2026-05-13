import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { scoreTenant } from "@/lib/risk-engine"
import { calculateEconomics } from "@/lib/eviction-economics"
import { profileToEscalationRules } from "@/lib/escalation-rules"

const anthropic = new Anthropic()

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24))
}

function daysUntil(iso: string | null | undefined) {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function monthsSince(iso: string | null | undefined) {
  if (!iso) return null
  return Math.round(daysBetween(iso, new Date().toISOString()) / 30)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all data in parallel
  const [
    { data: tenant },
    { data: profile },
    { data: payments },
    { data: interventions },
  ] = await Promise.all([
    supabase
      .from("tenants")
      .select(`
        id, unit, name, email, phone,
        rent_amount, balance_due, rent_due_day,
        days_late_avg, late_payment_count, previous_delinquency,
        card_expiry, payment_method, last_payment_date,
        lease_start, lease_end, move_in_date,
        resolution_status, stripe_payment_method_id,
        stripe_customer_id,
        properties(name, state, address)
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("profiles")
      .select("escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day, cfk_review_day, attorney_review_day, repeat_offender_accelerator_days, pm_display_name, stripe_account_id")
      .eq("id", user.id)
      .single(),
    svc
      .from("payments")
      .select("amount, date, note, created_at")
      .eq("tenant_id", id)
      .order("date", { ascending: false })
      .limit(24),
    svc
      .from("interventions")
      .select("type, sent_at, status, notes, snapshot")
      .eq("tenant_id", id)
      .order("sent_at", { ascending: false })
      .limit(50),
  ])

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const property = tenant.properties as { name?: string; state?: string; address?: string } | null
  const escalationRules = profileToEscalationRules(profile)

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

  const rentAmount = tenant.rent_amount ?? 0
  const monthsOwed = rentAmount > 0 ? (tenant.balance_due ?? 0) / rentAmount : 0
  const econ = calculateEconomics({
    rentAmount,
    monthsOwed,
    previousDelinquency: tenant.previous_delinquency ?? false,
    latePaymentCount: tenant.late_payment_count ?? 0,
    state: property?.state ?? null,
  })

  // Analyze communication from interventions
  const now = new Date()
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const recentCalls = (interventions ?? []).filter(
    i => i.type === "call_logged" && new Date(i.sent_at) >= last7Days
  )
  const communicationStatus = recentCalls.length === 0
    ? "unknown"
    : recentCalls.some(c => (c.notes as string | null)?.toLowerCase().includes("completed"))
    ? "responsive"
    : "unresponsive"

  const autopayDeclines = (interventions ?? []).filter(
    i => i.type === "payment_declined" && new Date(i.sent_at) >= last30Days
  ).length

  const priorPaymentPlansBroken = (interventions ?? []).filter(
    i => i.type === "payment_plan_agreed" && i.status === "broken"
  ).length

  const priorCfkAttempts = (interventions ?? []).filter(i => i.type === "cash_for_keys").length
  const legalNoticesSent = (interventions ?? []).filter(i => i.type === "legal_packet").length
  const hasAutopay = !!(tenant.stripe_payment_method_id)
  const leaseEndsInDays = daysUntil(tenant.lease_end)
  const tenantAgeMonths = monthsSince(tenant.move_in_date ?? tenant.lease_start)

  // Format payment history for Claude
  const paymentHistory = (payments ?? []).slice(0, 12).map(p => ({
    amount: p.amount,
    date: p.date,
    note: p.note || null,
    daysFromDue: tenant.rent_due_day
      ? (() => {
          const d = new Date(p.date)
          const dueDay = tenant.rent_due_day ?? 1
          const due = new Date(d.getFullYear(), d.getMonth(), dueDay)
          return d.getDate() >= dueDay
            ? d.getDate() - dueDay
            : daysBetween(new Date(d.getFullYear(), d.getMonth() - 1, dueDay).toISOString(), p.date)
        })()
      : null,
  }))

  // Format intervention history for Claude
  const interventionHistory = (interventions ?? []).slice(0, 30).map(i => ({
    type: i.type,
    date: new Date(i.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    status: i.status,
    notes: i.notes || null,
  }))

  // Build the full context prompt
  const contextBlock = `
TENANT PROFILE
==============
Name: ${tenant.name}
Unit: ${tenant.unit}
Property: ${property?.name ?? "Unknown"} (${property?.state ?? "State not set"})
Tenant relationship length: ${tenantAgeMonths !== null ? `${tenantAgeMonths} months` : "Unknown"}
Monthly rent: $${rentAmount.toLocaleString()}
Current balance due: $${(tenant.balance_due ?? 0).toLocaleString()} (${monthsOwed.toFixed(1)} months of rent)
Lease ends: ${tenant.lease_end ? `${new Date(tenant.lease_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (${leaseEndsInDays !== null ? `${leaseEndsInDays} days from now` : "unknown"})` : "No lease end date"}
Resolution status: ${tenant.resolution_status ?? "none"}

PAYMENT BEHAVIOR
================
Late payment count (all time): ${tenant.late_payment_count ?? 0}
Average days late: ${tenant.days_late_avg ?? 0} days
Prior eviction or serious delinquency: ${tenant.previous_delinquency ? "YES" : "No"}
Days past due right now: ${risk.days_past_due}
Risk tier: ${risk.tier}
Risk pattern classification: ${risk.tenant_pattern}
Payment method on file: ${tenant.payment_method ?? "Unknown"}
Autopay (bank/card saved): ${hasAutopay ? "YES — payment method saved" : "No"}
Autopay declines in last 30 days: ${autopayDeclines}

PAYMENT HISTORY (most recent ${paymentHistory.length} payments)
===============
${paymentHistory.length === 0 ? "No payment records found." : paymentHistory.map(p =>
  `- ${p.date}: $${p.amount.toLocaleString()}${p.daysFromDue !== null ? ` (${p.daysFromDue === 0 ? "on time" : `${p.daysFromDue} days after due date`})` : ""}${p.note ? ` — Note: ${p.note}` : ""}`
).join("\n")}

COMMUNICATION & ESCALATION HISTORY
====================================
Communication status (last 7 days): ${communicationStatus}
Prior payment plans that were broken: ${priorPaymentPlansBroken}
Prior Cash for Keys attempts: ${priorCfkAttempts}
Formal legal notices sent: ${legalNoticesSent}

Recent activity log (last ${interventionHistory.length} entries):
${interventionHistory.map(i =>
  `- [${i.date}] ${i.type}${i.status ? ` (${i.status})` : ""}${i.notes ? `: ${i.notes}` : ""}`
).join("\n")}

RISK ASSESSMENT (system-computed)
==================================
Recommended tier: ${risk.tier}
Recommended action: ${risk.recommended_action}
System reasoning: ${risk.reasons.join("; ")}
Risk narrative: ${risk.narrative}

FINANCIAL ECONOMICS (${property?.state ?? "national average"})
============================================================
Eviction cost estimate: $${econ.blendedEviction.toLocaleString()} (range: $${econ.blendedEvictionRange.low.toLocaleString()}–$${econ.blendedEvictionRange.high.toLocaleString()})
Eviction timeline: ~${econ.uncontested.lostRentWeeks} weeks in court
Cash for Keys estimate: $${econ.cfk.offerAmount.toLocaleString()} offer (total cost: $${econ.cfk.low.toLocaleString()}–$${econ.cfk.high.toLocaleString()})
CFK vs eviction savings: ${econ.cfkSavings > 0 ? `CFK saves ~$${econ.cfkSavings.toLocaleString()}` : "Eviction may be cheaper in this case"}
Max viable CFK offer (break-even): $${econ.breakEvenOffer.toLocaleString()}
Economics recommendation: ${econ.recommendation === "cfk" ? "Cash for Keys" : "Pursue Eviction"} (${econ.recommendationStrength} confidence)
`.trim()

  const systemPrompt = `You are an expert property management advisor for RentSentry, a landlord decision support platform. Your job is to analyze tenant data and give landlords extremely specific, actionable guidance on how to handle late rent situations.

You have deep knowledge of:
- US eviction law and timelines by state
- Tenant behavior patterns and what they predict about payment recovery
- The financial math of eviction vs cash for keys vs payment plans
- Common landlord mistakes that cost them money (like accepting partial payment during eviction)
- How communication responsiveness predicts recovery probability
- How autopay declines signal financial distress
- The leverage dynamics of lease timing
- How tenant relationship length affects negotiation strategy

Your response must be a single valid JSON object. No markdown, no explanation outside the JSON. Be specific to THIS tenant's actual data — not generic advice. Reference specific numbers and patterns from their history. The "keyInsight" field is the most important: it should be something a rule-based system would never catch — a pattern, contradiction, or nuance unique to this tenant's situation.`

  const userPrompt = `Analyze this tenant and provide a precise action plan. Return ONLY valid JSON matching this exact schema:

{
  "immediateAction": "string — one specific action to take right now (be direct, not vague)",
  "immediateDetail": "string — 2-3 sentences explaining exactly why and how. Reference actual numbers from the data.",
  "trigger": {
    "condition": "string — what must NOT happen for this to escalate",
    "days": number — how many days to wait before escalating,
    "nextAction": "string — the exact next step if trigger fires"
  } or null if this is the terminal action,
  "warning": "string — the single most important mistake the landlord could make right now, or null if no critical risk",
  "recoveryOdds": number — 0 to 100, your honest probability of recovering the balance without eviction,
  "recoveryContext": "string — explain what drives this probability using actual data from this tenant",
  "keyInsight": "string — the most important thing about this tenant's situation that a simple rule engine would miss. This must be specific to their data — patterns in payment timing, lease dynamics, behavioral signals, combinations of factors, or anything that changes the strategy."
}

TENANT DATA:
${contextBlock}`

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1024,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    })

    const rawText = message.content[0].type === "text" ? message.content[0].text.trim() : ""

    // Strip markdown code fences if present
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

    const plan = JSON.parse(jsonText)

    // Validate required fields
    if (!plan.immediateAction || !plan.immediateDetail || typeof plan.recoveryOdds !== "number") {
      throw new Error("Invalid plan structure")
    }

    return NextResponse.json({ plan, tier: risk.tier })
  } catch (err) {
    console.error("AI action plan error:", err)
    return NextResponse.json({ error: "AI unavailable" }, { status: 500 })
  }
}
