import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId, amount, date, note } = await req.json()
  if (!tenantId || !amount) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

  // Fetch current balance
  const { data: tenant } = await supabase
    .from("tenants")
    .select("balance_due")
    .eq("id", tenantId)
    .eq("user_id", user.id)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const newBalance = Math.max(0, (tenant.balance_due ?? 0) - amount)

  // Record the payment
  await supabase.from("payments").insert({
    tenant_id: tenantId,
    user_id: user.id,
    amount,
    date: date ?? new Date().toISOString().split("T")[0],
    source: "manual",
    note: note ?? null,
  })

  // Update tenant balance
  await supabase
    .from("tenants")
    .update({ balance_due: newBalance })
    .eq("id", tenantId)
    .eq("user_id", user.id)

  return NextResponse.json({
    ok: true,
    newBalance,
    message: newBalance === 0 ? "Payment recorded — balance cleared." : `Payment recorded — $${newBalance.toLocaleString()} remaining.`,
  })
}
