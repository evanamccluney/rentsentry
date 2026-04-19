import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { messages } = await req.json()

  const { data: tenants } = await supabase
    .from("tenants")
    .select("*, properties(name)")
    .eq("user_id", user.id)
    .eq("status", "active")

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .eq("user_id", user.id)

  const now = new Date()
  const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const daysUntilRent = Math.ceil((firstOfNext.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  const tenantSummary = (tenants || []).map(t => ({
    unit: t.unit,
    name: t.name,
    email: t.email,
    property: (t as { properties?: { name?: string } }).properties?.name,
    rent: t.rent_amount,
    balance_due: t.balance_due,
    risk: t.risk_score,
    flags: t.risk_reasons,
    days_late_avg: t.days_late_avg,
    late_count: t.late_payment_count,
    payment_method: t.payment_method,
    card_expiry: t.card_expiry,
    lease_end: t.lease_end,
  }))

  const red = tenantSummary.filter(t => t.risk === "red")
  const yellow = tenantSummary.filter(t => t.risk === "yellow")

  const systemPrompt = `You are an AI assistant built into RentSentry, a proactive revenue protection tool for property managers. You help property managers understand their tenant risk, decide what actions to take, and prevent missed rent before it happens.

Today's date: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
Days until rent is due (1st of month): ${daysUntilRent} days

PORTFOLIO SUMMARY:
- Total active tenants: ${tenantSummary.length}
- High risk (red): ${red.length}
- At risk (yellow): ${yellow.length}
- Healthy (green): ${tenantSummary.filter(t => t.risk === "green").length}
- Total monthly rent: $${tenantSummary.reduce((s, t) => s + t.rent, 0).toLocaleString()}
- Total balance due: $${tenantSummary.reduce((s, t) => s + t.balance_due, 0).toLocaleString()}

PROPERTIES:
${(properties || []).map(p => `- ${p.name}${p.address ? ` (${p.address})` : ""}`).join("\n")}

HIGH RISK TENANTS:
${red.length === 0 ? "None" : red.map(t => `- ${t.name} | Unit ${t.unit} | ${t.property} | Rent $${t.rent} | Balance $${t.balance_due} | Flags: ${t.flags?.join(", ")}`).join("\n")}

AT RISK TENANTS:
${yellow.length === 0 ? "None" : yellow.map(t => `- ${t.name} | Unit ${t.unit} | ${t.property} | Rent $${t.rent} | Flags: ${t.flags?.join(", ")}`).join("\n")}

YOUR ROLE:
- Be direct, concise, and actionable — like a sharp asset manager, not a chatbot
- When asked who needs attention, prioritize by risk and days until the 1st
- Recommend specific actions: Card Alert, Split Pay Offer, Cash for Keys, or Legal Packet
- Explain WHY a tenant is risky in plain English
- If all tenants are healthy, say so clearly
- Never make up tenant data — only use what's provided above
- Keep responses short unless asked for detail
- You can suggest the property manager trigger actions from the Tenants page`

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
  })

  const text = response.choices[0]?.message?.content || "Something went wrong."
  return NextResponse.json({ message: text })
}
