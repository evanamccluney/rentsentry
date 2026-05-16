import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { revalidateTag } from "next/cache"
import { normalizePhone } from "@/lib/phone"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  // Only allow updating owned tenants
  const { data: existing } = await supabase
    .from("tenants")
    .select("id, balance_due")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const allowed = [
    "name", "email", "phone", "unit", "property_id",
    "rent_amount", "balance_due", "rent_due_day",
    "payment_method", "card_expiry",
    "lease_start", "lease_end", "last_payment_date",
    "days_late_avg", "late_payment_count", "previous_delinquency",
    "delinquency_start_date", "intake_status", "intake_action", "auto_contact_approved",
    "notes", "status",
  ]

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) {
      patch[key] = key === "phone" && typeof body[key] === "string"
        ? (normalizePhone(body[key]) ?? body[key] ?? null)
        : body[key]
    }
  }

  if ("balance_due" in body) {
    const nextBalance = parseFloat(String(body.balance_due)) || 0
    const previousBalance = Number(existing.balance_due ?? 0)
    if (nextBalance <= 0) {
      patch.intake_status = "normal"
      patch.intake_action = null
      patch.auto_contact_approved = true
    } else if (previousBalance <= 0 && !("auto_contact_approved" in body) && body.source === "manual") {
      patch.intake_status = "needs_review"
      patch.intake_action = "manual_review"
      patch.auto_contact_approved = false
    }
  }

  const { error } = await supabase
    .from("tenants")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`tenant-data-${user.id}`, 'max')

  return NextResponse.json({ ok: true })
}
