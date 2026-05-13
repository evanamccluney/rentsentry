import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { revalidateTag } from "next/cache"
import { normalizePhone } from "@/lib/phone"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json()

  const { error } = await supabase.from("tenants").insert({
    name: body.name,
    email: body.email || null,
    phone: (normalizePhone(body.phone) ?? body.phone) || null,
    unit: body.unit,
    property_id: body.property_id,
    rent_amount: parseFloat(body.rent_amount) || 0,
    balance_due: parseFloat(body.balance_due) || 0,
    rent_due_day: parseInt(body.rent_due_day) || 1,
    payment_method: body.payment_method || "unknown",
    card_expiry: body.card_expiry || null,
    lease_start: body.lease_start || null,
    lease_end: body.lease_end || null,
    last_payment_date: body.last_payment_date || null,
    days_late_avg: parseFloat(body.days_late_avg) || 0,
    late_payment_count: parseInt(body.late_payment_count) || 0,
    previous_delinquency: body.previous_delinquency ?? false,
    status: "active",
    user_id: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`tenant-data-${user.id}`)

  return NextResponse.json({ ok: true })
}
