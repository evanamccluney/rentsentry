import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  if (!checkRateLimit(`draft-sms:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { tenantName, tier, balanceDue, daysPastDue, latePaymentCount, daysLateAvg, pmDisplayName } = await req.json()

  const toneMap: Record<string, string> = {
    legal:         "very firm and urgent — legal action is being reviewed",
    pay_or_quit:   "firm and professional — this is a formal notice situation",
    cash_for_keys: "firm but offering an alternative resolution",
    payment_plan:  "professional and solution-focused — offering structured repayment",
    reminder:      latePaymentCount >= 3 ? "firm and direct — this is a recurring pattern" : "friendly and non-threatening — likely an oversight",
    watch:         "warm and proactive — rent is due soon",
  }

  const tone = toneMap[tier] || "professional and direct"
  const from = pmDisplayName || "your property manager"
  const bal = balanceDue || 0

  const prompt = `Draft a professional SMS from ${from} to a tenant named ${tenantName}.

Situation:
- Risk tier: ${tier}
- Balance owed: $${bal}
- Days past due: ${daysPastDue || 0}
- Late payment history: ${latePaymentCount || 0} late payments, avg ${daysLateAvg || 0} days late
- Required tone: ${tone}

Rules:
- Start with "Hi ${tenantName},"
- Be specific about the dollar amount if balance > 0
- End with a clear next step (call, pay, contact us, etc.)
- Do NOT mention legal threats unless tier is legal or pay_or_quit
- Do NOT include links — landlord will paste those in separately
- Do NOT include opt-out language
- Keep under 160 characters if possible (hard max 320)
- Sound human, not robotic

Respond with ONLY the SMS text. No quotes, no explanation, no labels.`

  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    })
    const text = resp.content[0].type === "text" ? resp.content[0].text.trim() : ""
    return NextResponse.json({ message: text })
  } catch {
    return NextResponse.json({ error: "Failed to generate message" }, { status: 500 })
  }
}
