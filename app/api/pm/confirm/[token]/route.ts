import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

interface ConfirmationItem {
  index: number
  tenant_id: string
  name: string
  unit: string | null
  amount: number
  status: 'pending' | 'paid' | 'skipped'
}

interface ConfirmSnapshot {
  token: string
  expires_at: string
  confirmations: ConfirmationItem[]
  date: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { index, action } = await req.json() as { index: number; action: 'paid' | 'skip' }

  if (action !== 'paid' && action !== 'skip') {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: rows } = await supabase
    .from("interventions")
    .select("id, user_id, snapshot")
    .eq("type", "pm_confirmation_sent")
    .filter("snapshot->>'token'", "eq", token)
    .limit(1)

  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const snap = row.snapshot as ConfirmSnapshot

  if (new Date(snap.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link has expired" }, { status: 410 })
  }

  const item = snap.confirmations.find(c => c.index === index)
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: "Already actioned" }, { status: 409 })

  const updatedConfirmations = snap.confirmations.map(c =>
    c.index === index ? { ...c, status: action === 'paid' ? 'paid' as const : 'skipped' as const } : c
  )

  if (action === 'paid') {
    const today = new Date().toISOString().split("T")[0]
    const now = new Date().toISOString()

    const { data: currentTenant } = await supabase
      .from("tenants")
      .select("balance_due")
      .eq("id", item.tenant_id)
      .single()

    const newBalance = Math.max(0, (currentTenant?.balance_due ?? 0) - item.amount)

    await supabase
      .from("tenants")
      .update({ balance_due: newBalance, last_payment_date: today, updated_at: now })
      .eq("id", item.tenant_id)

    await supabase.from("payments").insert({
      tenant_id: item.tenant_id,
      user_id: row.user_id,
      amount: item.amount,
      date: today,
      source: "manual",
      note: "Confirmed via PM link",
    })

    await supabase.from("interventions").insert({
      tenant_id: item.tenant_id,
      user_id: row.user_id,
      type: "pm_confirmed_paid",
      status: "sent",
      sent_at: now,
      notes: `PM confirmed $${item.amount.toLocaleString()} payment via confirmation link`,
    })
  }

  await supabase
    .from("interventions")
    .update({ snapshot: { ...snap, confirmations: updatedConfirmations } })
    .eq("id", row.id)

  const allDone = updatedConfirmations.every(c => c.status !== 'pending')
  if (allDone) {
    await supabase.from("interventions").update({ status: "resolved" }).eq("id", row.id)
  }

  return NextResponse.json({ ok: true, status: action === 'paid' ? 'paid' : 'skipped' })
}
