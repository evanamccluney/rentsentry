import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"
import { scoreTenant } from "@/lib/risk-engine"
import { calculateEconomics } from "@/lib/eviction-economics"

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
  })

  const pmState = (t.properties as { name?: string; state?: string } | null)?.state ?? null
  const rentAmount = t.rent_amount ?? 0
  const monthsOwed = rentAmount > 0 ? (t.balance_due ?? 0) / rentAmount : 0

  const econ = calculateEconomics({
    rentAmount,
    monthsOwed,
    previousDelinquency: t.previous_delinquency ?? false,
    latePaymentCount: t.late_payment_count ?? 0,
    state: pmState,
  })

  const legalCosts = econ.uncontested.courtFee + econ.uncontested.attorneyFee + econ.uncontested.lockoutFee

  const systemPrompt = `You are an AI property management advisor inside RentSentry. You're focused entirely on one tenant. Be direct, practical, and concise — the property manager needs to act, not read essays.

TENANT: ${t.name}
Unit: ${t.unit}${(t.properties as { name?: string } | null)?.name ? ` · ${(t.properties as { name: string }).name}` : ""}${pmState ? ` · ${pmState}` : ""}

FINANCIALS:
- Monthly rent: $${rentAmount.toLocaleString()}
- Balance due: $${(t.balance_due ?? 0).toLocaleString()}${monthsOwed >= 1 ? ` (${Math.round(monthsOwed * 10) / 10} months overdue)` : ""}
- Last payment: ${t.last_payment_date ?? "unknown"}
- Payment method: ${t.payment_method ?? "unknown"}${t.card_expiry ? ` · card expires ${t.card_expiry}` : ""}

RISK PROFILE:
- Risk tier: ${risk.tier} · Days past due: ${risk.days_past_due}
- Avg days late: ${t.days_late_avg ?? 0} · Late payments on record: ${t.late_payment_count ?? 0}
- Prior delinquency: ${t.previous_delinquency ? "Yes" : "No"}
- Flags: ${risk.reasons.length > 0 ? risk.reasons.join(", ") : "none"}

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

${t.notes ? `PM NOTES: ${t.notes}` : ""}

Keep responses under 150 words unless asked for something longer (like a letter draft). Reference actual dollar amounts from the data above. If they ask for a CFK offer letter or script, write it ready to send.`

  const openai = getOpenAI()

  const initUserMessage = "Summarize this tenant's situation in 2-3 sentences and tell me your top recommendation. Be direct and specific."

  const msgHistory = init
    ? [{ role: "user" as const, content: initUserMessage }]
    : (messages as { role: "user" | "assistant"; content: string }[])

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
