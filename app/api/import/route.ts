import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { revalidateTag } from "next/cache"
import type { TenantImportRow } from "@/lib/import-mappers"
import { normalizePhone } from "@/lib/phone"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { rows, propertyId } = await req.json() as {
    rows: TenantImportRow[]
    propertyId: string | null
  }

  if (!rows?.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 })

  const validRows = rows.filter(r => r.name && r.unit && !r._errors?.length)

  const inserts = validRows.map(r => ({
    user_id:              user.id,
    property_id:          propertyId ?? null,
    name:                 r.name,
    unit:                 r.unit,
    email:                r.email ?? null,
    phone:                normalizePhone(r.phone) ?? r.phone ?? null,
    rent_amount:          r.rent_amount ?? 0,
    balance_due:          r.balance_due ?? 0,
    lease_start:          r.lease_start ?? null,
    lease_end:            r.lease_end ?? null,
    rent_due_day:         r.rent_due_day ?? 1,
    payment_method:       r.payment_method ?? "unknown",
    card_expiry:          r.card_expiry ?? null,
    previous_delinquency: r.previous_delinquency ?? false,
    late_payment_count:   r.late_payment_count ?? 0,
    days_late_avg:        r.days_late_avg ?? 0,
    notes:                r.notes ?? null,
    status:               "active",
    risk_score:           "green",
    risk_reasons:         [],
  }))

  const { error, count } = await supabase
    .from("tenants")
    .insert(inserts)
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`tenant-data-${user.id}`, 'max')

  return NextResponse.json({ ok: true, imported: inserts.length })
}
