import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { generateShortCode } from "@/lib/short-link"
import { normalizePhone } from "@/lib/phone"

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
      name: "postpone_next_contact",
      description: "Delay the next automated outreach for a tenant by setting a snooze period. Use when the PM says things like 'push Kevin's schedule to 10 hours', 'don't contact Sarah until tomorrow', 'snooze Marcus for 3 days', or 'hold off on Rashad for 2 hours'.",
      parameters: {
        type: "object",
        properties: {
          tenant_id:   { type: "string", description: "The tenant's ID" },
          tenant_name: { type: "string", description: "The tenant's name (for confirmation)" },
          hours:       { type: "number", description: "Hours from now to snooze automation. Infer from the PM's request — '10 hours' → 10, 'tomorrow' → 24, '3 days' → 72, '2 weeks' → 336." },
        },
        required: ["tenant_id", "hours"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve_automation",
      description: "Approve automation for a tenant who is pending intake review. Use when the PM says 'approve Rashad', 'go ahead and contact Marcus', or 'release Kevin from review'.",
      parameters: {
        type: "object",
        properties: {
          tenant_id:   { type: "string", description: "The tenant's ID" },
          tenant_name: { type: "string", description: "The tenant's name (for confirmation)" },
        },
        required: ["tenant_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "block_automation",
      description: "Block all automated outreach for a tenant. Use when the PM says 'don't contact Sarah', 'pause automation for Marcus', 'stop all texts to Kevin', or 'put Rashad on no-contact'.",
      parameters: {
        type: "object",
        properties: {
          tenant_id:   { type: "string", description: "The tenant's ID" },
          tenant_name: { type: "string", description: "The tenant's name (for confirmation)" },
        },
        required: ["tenant_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send a payment reminder or proactive reminder SMS to a tenant right now. Use when the PM says 'text Kevin about his balance', 'send Sarah a reminder', or 'message Marcus now'. Only use for reminder-type messages — for payment plan offers, tell the PM to use the tenant's page.",
      parameters: {
        type: "object",
        properties: {
          tenant_id:   { type: "string", description: "The tenant's ID" },
          tenant_name: { type: "string", description: "The tenant's name (for confirmation)" },
          message:     { type: "string", description: "Optional custom message body. If not provided, a standard payment reminder is sent." },
        },
        required: ["tenant_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_sms",
      description: "Schedule a plain reminder SMS to be sent to a tenant at a specific future time. Use when the PM says things like 'send Rashad a text at 5pm', 'remind Kevin tomorrow morning', or 'message Sarah at noon'. Convert relative times to an ISO timestamp using the current date/time provided in the system context.",
      parameters: {
        type: "object",
        properties: {
          tenant_id:    { type: "string", description: "The tenant's ID" },
          tenant_name:  { type: "string", description: "The tenant's name (for confirmation)" },
          send_at:      { type: "string", description: "ISO 8601 timestamp for when to send the SMS (e.g. '2026-05-16T17:00:00.000Z'). Derive from the current time in context." },
          message:      { type: "string", description: "Optional custom message. If not provided, a standard payment reminder is sent at that time." },
        },
        required: ["tenant_id", "send_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_split_pay_offer",
      description: "Send a payment plan offer (with a real payment link) to a tenant RIGHT NOW. Use when the PM says 'send Rashad's payment plan', 'send the payment link to Kevin', 'send Marcus a split-pay offer', or 'send the payment plan now'. This generates a real link the tenant can click to choose their installment count and pay.",
      parameters: {
        type: "object",
        properties: {
          tenant_id:   { type: "string", description: "The tenant's ID" },
          tenant_name: { type: "string", description: "The tenant's name (for confirmation)" },
        },
        required: ["tenant_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_split_pay_offer",
      description: "Schedule a payment plan offer (split-pay link) to be sent to a tenant at a specific future time. Use when the PM says things like 'schedule Rashad a payment plan at 5pm', 'send Kevin a split-pay offer tomorrow', 'send the payment plan to Sarah at noon', 'send the payment link to Rashad at 11:15', or 'schedule the payment link for Marcus tonight'. The offer link lets the tenant choose their installment count. Convert relative times and timezone-aware times (e.g. '11:15 EST' = UTC-5, so 16:15 UTC) to an ISO timestamp.",
      parameters: {
        type: "object",
        properties: {
          tenant_id:    { type: "string", description: "The tenant's ID" },
          tenant_name:  { type: "string", description: "The tenant's name (for confirmation)" },
          send_at:      { type: "string", description: "ISO 8601 timestamp for when to send the offer (e.g. '2026-05-16T17:00:00.000Z'). Derive from the current time in context." },
        },
        required: ["tenant_id", "send_at"],
      },
    },
  },
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

  const { data: hardships } = await supabase
    .from("interventions")
    .select("tenant_id, notes, snapshot, sent_at, tenants(name)")
    .eq("user_id", user.id)
    .eq("type", "hardship_checkin")
    .order("sent_at", { ascending: false })

  const now = new Date()
  const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const daysUntilRent = Math.ceil((firstOfNext.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const nowDisplay = now.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })

  const tenantSummary = (tenants || []).map(t => {
    const snoozedUntil = (t as { snoozed_until?: string | null }).snoozed_until
    const isSnoozed = snoozedUntil && new Date(snoozedUntil) > now
    return {
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
      snoozed_until: isSnoozed ? snoozedUntil : null,
      auto_contact_approved: (t as { auto_contact_approved?: boolean }).auto_contact_approved,
      intake_status: (t as { intake_status?: string }).intake_status,
    }
  })

  const red    = tenantSummary.filter(t => t.risk === "red")
  const yellow = tenantSummary.filter(t => t.risk === "yellow")

  const systemPrompt = `You are RentSentry AI — a property management assistant with FULL ability to take actions. You do not just advise; you execute. When a PM asks you to do something, you call the appropriate tool immediately without hesitation or disclaimers.

RULE: Never say you "can't" or "don't have the capability" to send messages, schedule anything, or take any action listed in YOUR CAPABILITIES below. If the request matches a capability, call the tool. If you're unsure of a detail (like timezone), make a reasonable assumption, call the tool, and mention your assumption in the confirmation.

Now: ${nowDisplay}
Days until rent is due (1st): ${daysUntilRent} days

PORTFOLIO:
- Active tenants: ${tenantSummary.length}
- High risk: ${red.length} | At risk: ${yellow.length} | Healthy: ${tenantSummary.filter(t => t.risk === "green").length}
- Monthly rent roll: $${tenantSummary.reduce((s, t) => s + t.rent, 0).toLocaleString()}
- Total balance due: $${tenantSummary.reduce((s, t) => s + t.balance_due, 0).toLocaleString()}

PROPERTIES:
${(properties || []).map(p => `- ${p.name}${p.address ? ` (${p.address})` : ""}`).join("\n")}

ALL TENANTS (use IDs when calling tools):
${tenantSummary.map(t => {
  const monthsOwed = t.rent > 0 ? t.balance_due / t.rent : 0
  const escalation = monthsOwed >= 1.5 ? ` ⚠️ ${Math.round(monthsOwed * 10) / 10} MONTHS OVERDUE — recommend CFK or UD` : ""
  const snoozeNote = t.snoozed_until ? ` | SNOOZED until ${new Date(t.snoozed_until).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""
  const intakeNote = t.intake_status === "needs_review" ? " | AWAITING APPROVAL" : t.intake_status === "no_contact" ? " | NO-CONTACT" : ""
  return `- [${t.id}] ${t.name} | Unit ${t.unit} | ${t.property ?? "No property"} | Rent $${t.rent} | Balance $${t.balance_due} | Due day: ${t.rent_due_day} | Risk: ${t.risk}${t.flags?.length ? ` | Flags: ${t.flags.join(", ")}` : ""}${escalation}${snoozeNote}${intakeNote}`
}).join("\n")}

YOUR CAPABILITIES — call the tool, don't describe it:
- Update tenant data → update_tenants
- Record a payment / clear balance → record_payment
- Postpone next automated contact → postpone_next_contact
- Approve a tenant pending review → approve_automation
- Block all automation for a tenant → block_automation
- Send SMS right now → send_sms
- Schedule SMS for later → schedule_sms
- Send payment plan offer / payment link right now → send_split_pay_offer
- Schedule payment plan offer / payment link for later → schedule_split_pay_offer

TIMEZONE CONVERSION (use current time above):
- EST = UTC−5 | CST = UTC−6 | MST = UTC−7 | PST = UTC−8
- EDT = UTC−4 | CDT = UTC−5 | MDT = UTC−6 | PDT = UTC−7
- Example: "11:15 EST today" → add 5h → 16:15 UTC → ISO: 2026-05-16T16:15:00.000Z

After executing a change, confirm what you did in plain English. If you can't find a tenant by name, say so and list similar names.

ESCALATION DECISIONS (2+ months overdue):
When a tenant is flagged ⚠️ as 2+ months overdue, recommend either Cash for Keys (CFK) or Unlawful Detainer (UD filing) based on:
- Slow eviction state (12+ weeks): lean toward CFK — court costs more than the offer
- Repeat offender (previous_delinquency or 5+ late payments): lean toward UD — they won't self-correct
- 3+ months + repeat offender: UD is almost always right
- First offense, fast state: CFK is usually cheaper and faster
Always give a dollar reason: compare the CFK offer cost vs eviction + vacancy cost.
The tenant detail page now shows both action buttons — tell the PM they can choose either from the tenant's page.

ACTIVE HARDSHIP AGREEMENTS:
${hardships && hardships.length > 0
  ? hardships.map((h: any) => {
      const s = h.snapshot as { hardship_type?: string; grace_agreed?: boolean; grace_until?: string; promised_amount?: number } | null
      const name = h.tenants?.name ?? "Unknown"
      const type = s?.hardship_type ?? "unknown"
      const graceStr = s?.grace_agreed && s.grace_until ? ` — grace period until ${s.grace_until}` : ""
      const promiseStr = s?.promised_amount ? ` — promised $${s.promised_amount}` : ""
      const logged = new Date(h.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      return `- ${name}: ${type}${graceStr}${promiseStr} (logged ${logged})${h.notes ? `\n  PM note: "${h.notes}"` : ""}`
    }).join("\n")
  : "None logged."}
Factor hardship agreements into your advice — do not recommend escalation during an active grace period unless the tenant has broken their promise.

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

    } else if (call.function.name === "postpone_next_contact") {
      const { tenant_id, tenant_name, hours } = args as {
        tenant_id: string; tenant_name?: string; hours: number
      }
      const snoozeUntil = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString()
      const { error } = await supabase
        .from("tenants")
        .update({ snoozed_until: snoozeUntil })
        .eq("id", tenant_id)
        .eq("user_id", user.id)
      if (error) {
        result = `Failed to postpone contact for ${tenant_name ?? tenant_id}: ${error.message}`
      } else {
        const label = hours < 24
          ? `${hours} hour${hours === 1 ? "" : "s"}`
          : hours < 168
          ? `${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? "" : "s"}`
          : `${Math.round(hours / 168)} week${Math.round(hours / 168) === 1 ? "" : "s"}`
        result = `Automation postponed for ${tenant_name ?? tenant_id} — next contact scheduled in ${label}.`
      }

    } else if (call.function.name === "approve_automation") {
      const { tenant_id, tenant_name } = args as { tenant_id: string; tenant_name?: string }
      const { error } = await supabase
        .from("tenants")
        .update({ auto_contact_approved: true, intake_status: "normal" })
        .eq("id", tenant_id)
        .eq("user_id", user.id)
      result = error
        ? `Failed to approve ${tenant_name ?? tenant_id}: ${error.message}`
        : `Automation approved for ${tenant_name ?? tenant_id}. They'll be included in the next automation run.`

    } else if (call.function.name === "block_automation") {
      const { tenant_id, tenant_name } = args as { tenant_id: string; tenant_name?: string }
      const { error } = await supabase
        .from("tenants")
        .update({ auto_contact_approved: false, intake_action: "no_contact", intake_status: "no_contact" })
        .eq("id", tenant_id)
        .eq("user_id", user.id)
      result = error
        ? `Failed to block automation for ${tenant_name ?? tenant_id}: ${error.message}`
        : `Automation blocked for ${tenant_name ?? tenant_id}. No automated outreach will be sent to them.`

    } else if (call.function.name === "send_sms") {
      const { tenant_id, tenant_name, message } = args as {
        tenant_id: string; tenant_name?: string; message?: string
      }
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, phone, balance_due, sms_opted_out")
        .eq("id", tenant_id)
        .eq("user_id", user.id)
        .single()

      if (!tenant) {
        result = `Tenant not found.`
      } else if (tenant.sms_opted_out) {
        result = `${tenant_name ?? tenant.name} has opted out of SMS — message not sent.`
      } else if (!tenant.phone) {
        result = `No phone number on file for ${tenant_name ?? tenant.name} — message not sent.`
      } else {
        const firstName = (tenant.name as string).split(" ")[0]
        const smsBody = message?.trim()
          || (tenant.balance_due > 0
            ? `Hi ${firstName}, you have an outstanding balance of $${Number(tenant.balance_due).toLocaleString()}. Reply to this message to arrange payment. Reply STOP to opt out.`
            : `Hi ${firstName}, just a reminder — your rent payment is coming up. Reply to this message with any questions. Reply STOP to opt out.`)

        const { sendTenantSms: sendSms } = await import("@/lib/sms")
        const sent = await sendSms(supabase, tenant_id, tenant.phone, smsBody)

        if (sent) {
          await supabase.from("interventions").insert({
            tenant_id, user_id: user.id,
            type: "payment_reminder",
            status: "sent",
            sent_at: new Date().toISOString(),
            notes: "Sent via AI assistant",
          })
          result = `SMS sent to ${tenant_name ?? tenant.name}.`
        } else {
          result = `Failed to send SMS to ${tenant_name ?? tenant.name}.`
        }
      }

    } else if (call.function.name === "send_split_pay_offer") {
      const { tenant_id, tenant_name } = args as { tenant_id: string; tenant_name?: string }

      const serviceSupabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: tenant } = await serviceSupabase
        .from("tenants")
        .select("name, phone, balance_due, rent_amount, rent_due_day, sms_opted_out")
        .eq("id", tenant_id)
        .single()

      const { data: profile } = await serviceSupabase
        .from("profiles")
        .select("pm_display_name, pm_phone, pm_alerts_enabled, pm_alert_triggers, stripe_account_id")
        .eq("id", user.id)
        .single()

      if (!tenant || (tenant.balance_due ?? 0) <= 0) {
        result = `${tenant_name ?? tenant_id} has no outstanding balance — no offer sent.`
      } else {
        // Compute offer params (same logic as interventions route)
        const balanceDue = tenant.balance_due as number
        const rentAmount = (tenant.rent_amount ?? 0) as number
        const rentDueDay = (tenant.rent_due_day ?? 1) as number
        const dayOfMonth = now.getDate()
        const thisMonthDue = new Date(now.getFullYear(), now.getMonth(), rentDueDay)
        const nextDue = thisMonthDue > now ? thisMonthDue : new Date(now.getFullYear(), now.getMonth() + 1, rentDueDay)
        const daysUntilDue = Math.ceil((nextDue.getTime() - now.getTime()) / 86400000)
        const isBundled = dayOfMonth >= 15 && daysUntilDue <= 20 && rentAmount > 0 && balanceDue >= rentAmount * 0.8
        const offer = isBundled
          ? { totalAmount: Math.round((balanceDue + rentAmount) * 100) / 100, maxInstallments: 6, includesNextMonth: true }
          : (() => {
              const m = rentAmount > 0 ? balanceDue / rentAmount : 1
              return { totalAmount: balanceDue, maxInstallments: m >= 1.5 ? 4 : m >= 1 ? 3 : 2, includesNextMonth: false }
            })()

        const token = generateShortCode()
        const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()

        await serviceSupabase.from("interventions").insert({
          tenant_id,
          user_id: user.id,
          type: "split_pay_offer",
          status: "sent",
          sent_at: now.toISOString(),
          notes: "Sent via AI assistant",
          snapshot: {
            offer_token: token,
            total_amount: offer.totalAmount,
            balance_due: balanceDue,
            rent_amount: rentAmount,
            max_installments: offer.maxInstallments,
            min_installments: 2,
            includes_next_month: offer.includesNextMonth,
            rent_due_day: rentDueDay,
            expires_at: expiresAt,
          },
        })

        const offerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pay/offer/${token}`
        const pmName = profile?.pm_display_name?.trim() || null
        const pmFirst = pmName ? pmName.split(" ")[0] : null
        const from = pmFirst ? `your property manager ${pmFirst}` : "your property manager"
        const firstName = (tenant.name as string).split(" ")[0]
        const smsBody = offer.includesNextMonth
          ? `Hi ${firstName}, ${from} is offering to split your $${offer.totalAmount.toLocaleString()} balance (past due + upcoming rent) into up to ${offer.maxInstallments} payments. Choose your plan: ${offerUrl} Reply STOP to opt out.`
          : `Hi ${firstName}, ${from} is offering to split your $${offer.totalAmount.toLocaleString()} past-due balance into installments. Choose your plan: ${offerUrl} Reply STOP to opt out.`

        let smsSent = false
        if (!tenant.sms_opted_out && tenant.phone) {
          const phone = normalizePhone(tenant.phone as string)
          if (phone) {
            try {
              const { default: twilio } = await import("twilio")
              const tw = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
              await tw.messages.create({ from: process.env.TWILIO_PHONE_NUMBER!, to: phone, body: smsBody })
              smsSent = true
            } catch (e) { console.error("ai: send_split_pay_offer twilio error:", e) }
          }
        }

        // PM alert
        const pmTriggers: string[] = Array.isArray(profile?.pm_alert_triggers)
          ? profile.pm_alert_triggers
          : ["plan_sent"]
        if (smsSent && profile?.pm_alerts_enabled && pmTriggers.includes("plan_sent") && profile?.pm_phone) {
          const pmPhone = normalizePhone(profile.pm_phone)
          if (pmPhone) {
            try {
              const { default: twilio } = await import("twilio")
              const tw = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
              await tw.messages.create({
                from: process.env.TWILIO_PHONE_NUMBER!,
                to: pmPhone,
                body: `RentSentry: Payment plan offer sent to ${firstName} — $${offer.totalAmount.toLocaleString()} in up to ${offer.maxInstallments} installments. View: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tenants/${tenant_id}`,
              })
            } catch {}
          }
        }

        result = smsSent
          ? `Payment plan offer sent to ${tenant_name ?? firstName}. They'll receive a link to choose their plan and pay $${offer.totalAmount.toLocaleString()} in up to ${offer.maxInstallments} installments.`
          : `Offer created but SMS failed — no phone number on file or delivery error. Share this link manually: ${offerUrl}`
      }

    } else if (call.function.name === "schedule_sms" || call.function.name === "schedule_split_pay_offer") {
      const { tenant_id, tenant_name, message } = args as {
        tenant_id: string; tenant_name?: string; send_at: string; message?: string
      }
      const isSplitPay = call.function.name === "schedule_split_pay_offer"
      // Always target the next daily automation run (10:00 AM UTC) so the countdown matches exactly
      const today10am = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 0, 0))
      const nextRun = today10am > now ? today10am : new Date(today10am.getTime() + 86_400_000)
      const { error } = await supabase.from("interventions").insert({
        tenant_id,
        user_id: user.id,
        type: isSplitPay ? "scheduled_split_pay_offer" : "scheduled_sms",
        status: "pending",
        sent_at: now.toISOString(),
        notes: "Scheduled via AI assistant",
        snapshot: {
          scheduled_for: nextRun.toISOString(),
          ...(message ? { message } : {}),
        },
      })
      if (error) {
        result = `Failed to schedule for ${tenant_name ?? tenant_id}: ${error.message}`
      } else {
        const runDate = nextRun.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
        const isToday = nextRun.toDateString() === now.toDateString()
        const dateLabel = isToday ? "today" : `on ${runDate}`
        result = isSplitPay
          ? `Payment plan offer queued for ${tenant_name ?? tenant_id} — will send ${dateLabel} at the next automation run (10:00 AM UTC). They'll receive a link to choose their installment plan.`
          : `SMS queued for ${tenant_name ?? tenant_id} — will send ${dateLabel} at the next automation run (10:00 AM UTC).`
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
