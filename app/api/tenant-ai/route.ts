import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"
import { STATE_RULES } from "@/lib/pay-or-quit"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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

  // Build tenant context
  const prop = tenant.properties as { name?: string; address?: string; state?: string } | null
  const stateCode = (prop?.state ?? "").toUpperCase()
  const stateRule = stateCode ? STATE_RULES[stateCode] : null
  const balanceMonths = tenant.rent_amount > 0
    ? Math.round((tenant.balance_due / tenant.rent_amount) * 10) / 10
    : 0

  const now = new Date()
  const today = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })

  // Derive explicit delinquency status so the AI can't misread it
  const isCurrentlyOverdue = (tenant.balance_due ?? 0) > 0
  const delinquencyStatus = isCurrentlyOverdue
    ? `CURRENTLY DELINQUENT — $${(tenant.balance_due ?? 0).toLocaleString()} unpaid (${balanceMonths > 0 ? `${balanceMonths} month${balanceMonths !== 1 ? "s" : ""}` : "partial month"} overdue, ${tenant.days_past_due ?? 0} days past due)`
    : "CURRENT — no balance owed"

  const systemPrompt = `You are a property management advisor built into RentSentry, a rent collection tool for landlords.
A property manager is asking for advice about a specific tenant. Give direct, actionable guidance calibrated exactly to this tenant's situation.

TODAY: ${today}

TENANT PROFILE:
- Name: ${tenant.name}
- Unit: ${tenant.unit}${prop?.name ? ` at ${prop.name}` : ""}${prop?.address ? ` (${prop.address})` : ""}
- State: ${stateCode || "Unknown"}${stateRule ? ` — ${stateRule.title} (${stateRule.days}-day notice required)` : ""}
- Rent: $${(tenant.rent_amount ?? 0).toLocaleString()}/mo
- Payment Status: ${delinquencyStatus}
- Historical Late Payments: ${tenant.late_payment_count ?? 0} recorded (avg ${tenant.days_late_avg ?? 0} days late) — NOTE: this count reflects past logged payments only, NOT the current overdue balance above
- Previous Delinquency/Eviction: ${tenant.previous_delinquency ? "Yes" : "No"}
- Payment Method on File: ${tenant.payment_method || "Unknown"}
${stateRule ? `\nSTATE LAW (${stateCode}): ${stateRule.legalText}\nService: ${stateRule.serviceNote}` : ""}

RECENT ACTIONS TAKEN:
${interventions && interventions.length > 0
  ? interventions.map(i => `- ${i.type.replace(/_/g, " ")} (${i.status}) on ${new Date(i.sent_at).toLocaleDateString()}`).join("\n")
  : "- None yet"}

RECENT PAYMENTS:
${payments && payments.length > 0
  ? payments.map(p => `- $${p.amount} on ${p.date}${p.note ? ` (${p.note})` : ""}`).join("\n")
  : "- None recorded"}

YOUR ROLE:
- Be direct and concise — this PM needs to know what to do, not get a lecture
- Always base your advice on the Payment Status field above — it is the ground truth for whether rent is owed right now
- If Historical Late Payments is 0 but the tenant IS currently delinquent, treat them as currently late (possibly first time) — do NOT say they have no late history as if they're on time
- Reference the actual numbers (exact balance, months overdue, days past due, state law) in your advice
- When the PM says the tenant made a promise (e.g. "pays next week"), advise how to hold them to it with documentation and a deadline
- If no response from tenant after an outreach, tell the PM exactly what to do next given the overdue amount and timeline
- If the situation calls for Pay or Quit, Cash for Keys, or starting eviction, say so clearly
- Keep responses under 150 words unless the situation genuinely needs more
- Never give generic landlord advice — every response must be specific to this tenant's current data
- When your advice leads to a specific message worth sending, end with: "Want me to draft an SMS to send ${tenant.name.split(" ")[0]}?" — do NOT include the draft automatically

SENDING SMS:
Only include a draft when the PM explicitly asks you to (e.g. "yes", "draft it", "send it", "write the message"). When they do, use EXACTLY this format:

---SMS_DRAFT---
[the SMS text here, addressed to the tenant by first name, under 160 chars, plain text only]
---END_DRAFT---

Do not include the draft block unless the PM has asked for it in this conversation.`

  const response = await openai.chat.completions.create({
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
