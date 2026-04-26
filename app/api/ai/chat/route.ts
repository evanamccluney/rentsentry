import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// Fields the AI is allowed to update on a tenant record
const ALLOWED_UPDATE_FIELDS = new Set([
  "rent_due_day", "balance_due", "rent_amount", "payment_method",
  "lease_start", "lease_end", "phone", "email", "card_expiry",
  "days_late_avg", "late_payment_count", "previous_delinquency",
  "last_payment_date", "notes",
])

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "update_tenants",
      description: "Update one or more tenant records in the database. Use this when the PM asks to change any tenant data — due day, balance, rent amount, payment method, lease dates, contact info, etc. You can update multiple tenants in a single call.",
      parameters: {
        type: "object",
        properties: {
          updates: {
            type: "array",
            description: "List of tenant updates to apply",
            items: {
              type: "object",
              properties: {
                tenant_id: { type: "string", description: "The tenant's ID" },
                tenant_name: { type: "string", description: "The tenant's name (for confirmation message)" },
                fields: {
                  type: "object",
                  description: "Fields to update. Only include fields that are changing.",
                  properties: {
                    rent_due_day:         { type: "number", description: "Day of month rent is due (1-28)" },
                    balance_due:          { type: "number", description: "Current balance owed in dollars" },
                    rent_amount:          { type: "number", description: "Monthly rent amount in dollars" },
                    payment_method:       { type: "string", description: "Payment method: card, ach, cash, or unknown" },
                    lease_start:          { type: "string", description: "Lease start date (YYYY-MM-DD)" },
                    lease_end:            { type: "string", description: "Lease end date (YYYY-MM-DD)" },
                    phone:                { type: "string", description: "Tenant phone number" },
                    email:                { type: "string", description: "Tenant email address" },
                    card_expiry:          { type: "string", description: "Card expiry in MM/YY format" },
                    days_late_avg:        { type: "number", description: "Average days late historically" },
                    late_payment_count:   { type: "number", description: "Number of late payments on record" },
                    previous_delinquency: { type: "boolean", description: "Whether tenant has a prior eviction or delinquency" },
                    last_payment_date:    { type: "string", description: "Date of last payment (YYYY-MM-DD)" },
                  },
                },
              },
              required: ["tenant_id", "fields"],
            },
          },
        },
        required: ["updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_payment",
      description: "Record a payment from a tenant, which reduces their balance_due. Use this when the PM says a tenant paid, settled their balance, or made a partial payment.",
      parameters: {
        type: "object",
        properties: {
          tenant_id:   { type: "string", description: "The tenant's ID" },
          tenant_name: { type: "string", description: "The tenant's name (for confirmation)" },
          amount:      { type: "number", description: "Amount paid in dollars" },
          date:        { type: "string", description: "Payment date in YYYY-MM-DD format (default today)" },
          note:        { type: "string", description: "Optional note about the payment" },
        },
        required: ["tenant_id", "amount"],
      },
    },
  },
]

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
    id: t.id,
    unit: t.unit,
    name: t.name,
    email: t.email,
    phone: t.phone,
    property: (t as { properties?: { name?: string } }).properties?.name,
    rent: t.rent_amount,
    balance_due: t.balance_due,
    rent_due_day: t.rent_due_day ?? 1,
    risk: t.risk_score,
    flags: t.risk_reasons,
    days_late_avg: t.days_late_avg,
    late_count: t.late_payment_count,
    payment_method: t.payment_method,
    card_expiry: t.card_expiry,
    lease_end: t.lease_end,
  }))

  const red    = tenantSummary.filter(t => t.risk === "red")
  const yellow = tenantSummary.filter(t => t.risk === "yellow")

  const systemPrompt = `You are an AI assistant built into RentSentry, a proactive revenue protection tool for property managers. You help PMs understand their tenant risk, take actions, and manage their portfolio — including making direct changes to tenant records when asked.

Today: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
Days until rent is due (1st): ${daysUntilRent} days

PORTFOLIO:
- Active tenants: ${tenantSummary.length}
- High risk: ${red.length} | At risk: ${yellow.length} | Healthy: ${tenantSummary.filter(t => t.risk === "green").length}
- Monthly rent roll: $${tenantSummary.reduce((s, t) => s + t.rent, 0).toLocaleString()}
- Total balance due: $${tenantSummary.reduce((s, t) => s + t.balance_due, 0).toLocaleString()}

PROPERTIES:
${(properties || []).map(p => `- ${p.name}${p.address ? ` (${p.address})` : ""}`).join("\n")}

ALL TENANTS (use IDs when calling tools):
${tenantSummary.map(t =>
  `- [${t.id}] ${t.name} | Unit ${t.unit} | ${t.property ?? "No property"} | Rent $${t.rent} | Balance $${t.balance_due} | Due day: ${t.rent_due_day} | Risk: ${t.risk}${t.flags?.length ? ` | Flags: ${t.flags.join(", ")}` : ""}`
).join("\n")}

YOUR CAPABILITIES:
You can read AND write. When the PM asks you to change something, use your tools to do it immediately — don't just describe what they should do. Examples:
- "Change Sarah's due day to the 14th" → call update_tenants for Sarah
- "Mark Kevin as paid" → call record_payment for Kevin
- "Update Jennifer and Marcus's rent to $1,800" → call update_tenants for both in one call
- "Clear Sandra's balance" → call record_payment with her full balance amount

After executing a change, confirm what you did in plain English. If you can't find a tenant by name, say so and list similar names.

ADVICE ROLE:
- Be direct and concise — this PM needs to act, not read essays
- Prioritize by risk and urgency
- Reference actual numbers from the data above
- Never make up data not provided`

  const openai = getOpenAI()

  // First completion — may include tool calls
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 800,
    tools,
    tool_choice: "auto",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
  })

  const firstChoice = response.choices[0].message

  // No tool calls — return the text response directly
  if (!firstChoice.tool_calls || firstChoice.tool_calls.length === 0) {
    return NextResponse.json({ message: firstChoice.content || "Something went wrong." })
  }

  // Execute tool calls
  const toolResults: OpenAI.Chat.ChatCompletionMessageParam[] = []

  for (const call of firstChoice.tool_calls) {
    if (call.type !== "function") continue
    const args = JSON.parse(call.function.arguments)
    let result = ""

    if (call.function.name === "update_tenants") {
      const { updates } = args as {
        updates: { tenant_id: string; tenant_name?: string; fields: Record<string, unknown> }[]
      }

      const succeeded: string[] = []
      const failed: string[] = []

      for (const update of updates) {
        // Strip any fields the AI isn't allowed to change
        const safeFields = Object.fromEntries(
          Object.entries(update.fields).filter(([key]) => ALLOWED_UPDATE_FIELDS.has(key))
        )

        if (Object.keys(safeFields).length === 0) {
          failed.push(`${update.tenant_name ?? update.tenant_id}: no valid fields to update`)
          continue
        }

        const { error } = await supabase
          .from("tenants")
          .update(safeFields)
          .eq("id", update.tenant_id)
          .eq("user_id", user.id)

        if (error) {
          failed.push(`${update.tenant_name ?? update.tenant_id}: ${error.message}`)
        } else {
          succeeded.push(update.tenant_name ?? update.tenant_id)
        }
      }

      result = succeeded.length > 0
        ? `Updated: ${succeeded.join(", ")}.${failed.length > 0 ? ` Failed: ${failed.join(", ")}.` : ""}`
        : `All updates failed: ${failed.join(", ")}`

    } else if (call.function.name === "record_payment") {
      const { tenant_id, tenant_name, amount, date, note } = args as {
        tenant_id: string; tenant_name?: string; amount: number; date?: string; note?: string
      }

      const { data: tenant } = await supabase
        .from("tenants")
        .select("balance_due")
        .eq("id", tenant_id)
        .eq("user_id", user.id)
        .single()

      if (!tenant) {
        result = `Tenant not found.`
      } else {
        const newBalance = Math.max(0, (tenant.balance_due ?? 0) - amount)
        const paymentDate = date ?? now.toISOString().split("T")[0]

        await supabase.from("payments").insert({
          tenant_id, user_id: user.id, amount,
          date: paymentDate, source: "ai", note: note ?? null,
        })

        await supabase
          .from("tenants")
          .update({ balance_due: newBalance, last_payment_date: paymentDate })
          .eq("id", tenant_id)
          .eq("user_id", user.id)

        result = `Payment of $${amount.toLocaleString()} recorded for ${tenant_name ?? tenant_id}. New balance: $${newBalance.toLocaleString()}.`
      }
    }

    toolResults.push({
      role: "tool",
      tool_call_id: call.id,
      content: result,
    })
  }

  // Second completion — AI confirms what was done
  const followUp = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "assistant", content: firstChoice.content ?? "", tool_calls: firstChoice.tool_calls },
      ...toolResults,
    ],
  })

  return NextResponse.json({ message: followUp.choices[0]?.message?.content || "Done." })
}
