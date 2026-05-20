import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { revalidateTag } from "next/cache"
import type { Platform, TenantImportRow } from "@/lib/import-mappers"
import { normalizePhone } from "@/lib/phone"
import { planLimitFor, isOnTrial } from "@/lib/plan-limits"
import { inferDelinquencyStartDate } from "@/lib/delinquency"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { rows, propertyId, platform, columnMapping, filename } = await req.json() as {
    rows: TenantImportRow[]
    propertyId: string | null
    platform?: Platform | null
    columnMapping?: Record<string, keyof TenantImportRow> | null
    filename?: string | null
  }

  if (!rows?.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 })

  // ── Plan limit enforcement (skipped during 30-day trial) ──────────────────
  if (!isOnTrial(user.created_at)) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status, metadata")
      .eq("user_id", user.id)
      .single()

    if (subscription?.status === "active") {
      const limit = planLimitFor(subscription.metadata?.plan)
      if (limit !== null) {
        // Count existing active tenants
        const { count: currentCount } = await supabase
          .from("tenants")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "active")

        // Count existing unit names so we don't double-count upserts
        const { data: existingUnits } = await supabase
          .from("tenants")
          .select("unit")
          .eq("user_id", user.id)
          .eq("status", "active")

        const existingUnitSet = new Set((existingUnits ?? []).map(t => t.unit))
        const newUnitCount = rows.filter(r => r.name && r.unit && !r._errors?.length && !existingUnitSet.has(r.unit)).length
        const projectedTotal = (currentCount ?? 0) + newUnitCount

        if (projectedTotal > limit) {
          return NextResponse.json({
            error: `This import would bring you to ${projectedTotal} units, over your plan limit of ${limit}. Upgrade your plan or reduce the import.`,
            upgrade: true,
            current: currentCount,
            projected: projectedTotal,
            limit,
          }, { status: 403 })
        }
      }
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_rent_due_day")
    .eq("id", user.id)
    .single()

  const portfolioDefaultDueDay = Math.min(28, Math.max(1, profile?.default_rent_due_day ?? 1))

  const validRows = rows.filter(r => r.name && r.unit && !r._errors?.length)

  const inserts = validRows.map(r => {
    // Infer rent_due_day from last_payment_date if not explicitly set in the CSV
    let rentDueDay = r.rent_due_day ?? null
    if (!rentDueDay && r.last_payment_date) {
      const payDay = new Date(r.last_payment_date).getDate()
      // Tenants typically pay 0-5 days after due — subtract to get approximate due day
      rentDueDay = Math.min(28, Math.max(1, payDay <= 5 ? 1 : payDay - 3))
    }
    const finalRentDueDay = rentDueDay ?? portfolioDefaultDueDay
    return {
      user_id:              user.id,
      property_id:          propertyId ?? null,
      name:                 r.name,
      unit:                 r.unit,
      email:                r.email ?? null,
      phone:                normalizePhone(r.phone) ?? null,
      rent_amount:          r.rent_amount ?? 0,
      balance_due:          r.balance_due ?? 0,
      lease_start:          r.lease_start ?? null,
      lease_end:            r.lease_end ?? null,
      rent_due_day:         finalRentDueDay,
      last_payment_date:    r.last_payment_date ?? null,
      delinquency_start_date: inferDelinquencyStartDate({
        balanceDue: r.balance_due,
        rentDueDay: finalRentDueDay,
        lastPaymentDate: r.last_payment_date,
        daysPastDue: r.days_past_due,
      }),
      intake_status:        "normal",
      intake_action:        null,
      auto_contact_approved: true,
      payment_method:       r.payment_method ?? "unknown",
      card_expiry:          r.card_expiry ?? null,
      previous_delinquency: r.previous_delinquency ?? false,
      late_payment_count:   r.late_payment_count ?? 0,
      days_late_avg:        r.days_late_avg ?? 0,
      notes:                r.notes ?? null,
      status:               "active",
      risk_score:           "green",
      risk_reasons:         [],
    }
  })

  const { error } = await supabase
    .from("tenants")
    .upsert(inserts, { onConflict: "user_id,unit", ignoreDuplicates: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from("csv_uploads").insert({
    user_id: user.id,
    property_id: propertyId ?? null,
    filename: filename?.trim() || "tenant-import.csv",
    rows_imported: inserts.length,
    status: "complete",
  })

  if (platform && columnMapping && Object.keys(columnMapping).length > 0) {
    await supabase.from("import_profiles").upsert({
      user_id: user.id,
      platform,
      column_mapping: columnMapping,
      property_id: propertyId ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
  }

  revalidateTag(`tenant-data-${user.id}`, 'max')

  return NextResponse.json({ ok: true, imported: inserts.length, upserted: inserts.length })
}
