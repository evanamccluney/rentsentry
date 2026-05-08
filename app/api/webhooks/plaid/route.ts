/**
 * /api/webhooks/plaid — Plaid transaction sync webhook
 *
 * Fires when new transactions land in a connected bank account.
 * Runs each credit transaction through the matching algorithm:
 *   90+ confidence  → auto-mark tenant paid, no PM action needed
 *   50-89           → SMS PM asking "Did [name] pay?"
 *   <50             → ignored
 *
 * Matching algorithm (additive confidence score out of 100):
 *   +50  amount matches tenant's rent exactly
 *   +20  transaction date within 5 days of rent due day
 *   +40  full tenant name found in description (case-insensitive)
 *   +15  any name token (first or last) found in description
 *
 * Plaid sign convention: negative amount = credit (money in). We
 * only process amount < 0 (deposits/transfers received).
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getPlaidClient } from "@/lib/plaid"
import { normalizePhone } from "@/lib/phone"
import twilio from "twilio"

const twClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

type Tenant = {
  id: string
  name: string
  rent_amount: number
  rent_due_day: number
  balance_due: number
  last_payment_date: string | null
  status: string
}

type Transaction = {
  transaction_id: string
  amount: number             // Plaid: negative = money in
  date: string               // YYYY-MM-DD
  name: string               // merchant/counterparty name
  merchant_name: string | null
}

function confidenceScore(tx: Transaction, tenant: Tenant): number {
  let score = 0
  const rentAmt = tenant.rent_amount ?? 0
  const receivedAmt = Math.abs(tx.amount)
  const desc = `${tx.name} ${tx.merchant_name ?? ""}`.toLowerCase()
  const tenantNameLower = tenant.name.toLowerCase()
  const tokens = tenantNameLower.split(/\s+/).filter(Boolean)

  if (rentAmt > 0 && Math.abs(receivedAmt - rentAmt) < 0.01) score += 50
  else if (rentAmt > 0 && Math.abs(receivedAmt - rentAmt) / rentAmt <= 0.05) score += 25

  const dueDay = Math.min(Math.max(tenant.rent_due_day ?? 1, 1), 28)
  const txDate = new Date(tx.date)
  const txDay = txDate.getDate()
  if (Math.abs(txDay - dueDay) <= 5 || (dueDay <= 5 && txDay >= 26)) score += 20

  if (desc.includes(tenantNameLower)) {
    score += 40
  } else if (tokens.some(tok => tok.length >= 3 && desc.includes(tok))) {
    score += 15
  }

  return score
}

async function recordPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  tenant: Tenant,
  amount: number,
  txDate: string,
  txId: string
) {
  const newBalance = Math.max(0, (tenant.balance_due ?? 0) - amount)

  await supabase.from("payments").insert({
    tenant_id: tenant.id,
    user_id: userId,
    amount,
    date: txDate,
    source: "plaid_auto",
    note: `Auto-matched from bank feed (tx ${txId})`,
  })

  await supabase
    .from("tenants")
    .update({ balance_due: newBalance, last_payment_date: txDate })
    .eq("id", tenant.id)

  await supabase.from("interventions").insert({
    tenant_id: tenant.id,
    user_id: userId,
    type: "plaid_payment_auto",
    status: "sent",
    sent_at: new Date().toISOString(),
    notes: `Auto-matched rent payment $${amount} from bank feed`,
  })
}

async function sendSmsConfirm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  pmPhone: string,
  tenantList: { tenant_id: string; name: string; amount: number; code: number }[],
  txDate: string
) {
  const plural = tenantList.length > 1
  const list = tenantList.map(t => `${t.code}. ${t.name} ($${t.amount})`).join("\n")
  const msg = plural
    ? `RentSentry: Possible rent payments on ${txDate}:\n${list}\n\nReply PAID followed by numbers (e.g. PAID 1,2), ALL, or NONE.`
    : `RentSentry: Did ${tenantList[0].name} pay $${tenantList[0].amount} on ${txDate}? Reply YES or NO.`

  const { data: confirm } = await supabase.from("interventions").insert({
    tenant_id: tenantList[0].tenant_id,
    user_id: userId,
    type: "pm_confirmation_sent",
    status: "pending",
    sent_at: new Date().toISOString(),
    notes: "Plaid transaction — awaiting PM confirmation",
    snapshot: { confirmations: tenantList },
  }).select("id").single()

  await twClient.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: pmPhone,
    body: msg,
  })

  return confirm?.id
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { webhook_type, webhook_code, item_id } = body

  // Only handle transaction updates
  if (webhook_type !== "TRANSACTIONS") {
    return new NextResponse(null, { status: 200 })
  }

  if (webhook_code !== "SYNC_UPDATES_AVAILABLE" && webhook_code !== "DEFAULT_UPDATE") {
    return new NextResponse(null, { status: 200 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find the PM who owns this item
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plaid_access_token, plaid_cursor, pm_phone, auto_mode")
    .eq("plaid_item_id", item_id)
    .single()

  if (!profile?.plaid_access_token) {
    return new NextResponse(null, { status: 200 })
  }

  const plaid = getPlaidClient()

  // Sync all new transactions using cursor
  let cursor = profile.plaid_cursor ?? undefined
  const addedTransactions: Transaction[] = []
  let hasMore = true

  while (hasMore) {
    const syncRes = await plaid.transactionsSync({
      access_token: profile.plaid_access_token,
      cursor,
      count: 100,
    })
    const { added, next_cursor, has_more } = syncRes.data
    cursor = next_cursor
    hasMore = has_more
    addedTransactions.push(...(added as Transaction[]))
  }

  // Persist updated cursor immediately
  await supabase
    .from("profiles")
    .update({ plaid_cursor: cursor })
    .eq("id", profile.id)

  if (addedTransactions.length === 0) {
    return new NextResponse(null, { status: 200 })
  }

  // Only look at credits (money coming in) — Plaid negative = deposit
  const credits = addedTransactions.filter(tx => tx.amount < 0)
  if (credits.length === 0) return new NextResponse(null, { status: 200 })

  // Load all active tenants with a balance for this PM
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, rent_amount, rent_due_day, balance_due, last_payment_date, status")
    .eq("user_id", profile.id)
    .gt("balance_due", 0)
    .eq("status", "active")

  if (!tenants || tenants.length === 0) return new NextResponse(null, { status: 200 })

  // Track which tenants we've already processed in this webhook call
  const processedTenantIds = new Set<string>()

  const pmPhone = profile.pm_phone ? normalizePhone(profile.pm_phone) : null

  // Accumulate low-confidence candidates for a single batched SMS
  const confirmCandidates: { tenant_id: string; name: string; amount: number; code: number }[] = []

  for (const tx of credits) {
    const received = Math.abs(tx.amount)

    // Score every tenant against this transaction
    const scores = tenants
      .filter(t => !processedTenantIds.has(t.id))
      .map(t => ({ tenant: t, score: confidenceScore(tx, t) }))
      .sort((a, b) => b.score - a.score)

    const top = scores[0]
    if (!top || top.score < 50) continue

    const second = scores[1]
    const ambiguous = second && top.score - second.score <= 10 && second.score >= 50

    if (ambiguous) {
      // Can't auto-match — SMS PM with both candidates
      if (pmPhone) {
        const candidates = [top, second].map((s, i) => ({
          tenant_id: s.tenant.id,
          name: s.tenant.name,
          amount: received,
          code: confirmCandidates.length + i + 1,
        }))
        confirmCandidates.push(...candidates)
      }
      continue
    }

    if (top.score >= 90) {
      // High confidence — auto-mark paid
      processedTenantIds.add(top.tenant.id)
      await recordPayment(supabase, profile.id, top.tenant, received, tx.date, tx.transaction_id)

      // Notify PM if alerts are enabled
      if (pmPhone && profile.auto_mode) {
        await twClient.messages.create({
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: pmPhone,
          body: `RentSentry: ${top.tenant.name}'s $${received} rent payment auto-matched from your bank feed on ${tx.date}. Balance updated.`,
        })
      }
    } else {
      // Medium confidence — ask PM
      if (pmPhone) {
        confirmCandidates.push({
          tenant_id: top.tenant.id,
          name: top.tenant.name,
          amount: received,
          code: confirmCandidates.length + 1,
        })
      }
    }
  }

  // Send a single batched SMS for all confirm candidates
  if (confirmCandidates.length > 0 && pmPhone) {
    const deduped = confirmCandidates.reduce<typeof confirmCandidates>((acc, c) => {
      if (!acc.find(x => x.tenant_id === c.tenant_id)) acc.push(c)
      return acc
    }, []).map((c, i) => ({ ...c, code: i + 1 }))

    const txDate = credits[0].date
    await sendSmsConfirm(supabase, profile.id, pmPhone, deduped, txDate)
  }

  return new NextResponse(null, { status: 200 })
}
