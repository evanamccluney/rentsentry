import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { revalidateTag } from "next/cache"
import { normalizePhone } from "@/lib/phone"
import { planLimitFor, isOnTrial } from "@/lib/plan-limits"


function validateTenantBody(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== "string" || !body.name.trim())
    return "name is required"
  if (!body.unit || typeof body.unit !== "string" || !body.unit.trim())
    return "unit is required"
  const rent = parseFloat(body.rent_amount as string)
  if (isNaN(rent) || rent <= 0 || rent > 50000)
    return "rent_amount must be a number between 1 and 50000"
  const balance = parseFloat(body.balance_due as string)
  if (!isNaN(balance) && balance < 0)
    return "balance_due cannot be negative"
  const dueDay = parseInt(body.rent_due_day as string)
  if (!isNaN(dueDay) && (dueDay < 1 || dueDay > 28))
    return "rent_due_day must be between 1 and 28"
  const daysLate = parseFloat(body.days_late_avg as string)
  if (!isNaN(daysLate) && daysLate < 0)
    return "days_late_avg cannot be negative"
  const lateCount = parseInt(body.late_payment_count as string)
  if (!isNaN(lateCount) && lateCount < 0)
    return "late_payment_count cannot be negative"
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json()

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
        const { count } = await supabase
          .from("tenants")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "active")
        if ((count ?? 0) >= limit) {
          return NextResponse.json({
            error: `Your plan supports up to ${limit} units. Upgrade your plan to add more tenants.`,
            upgrade: true,
          }, { status: 403 })
        }
      }
    }
  }

  const validationError = validateTenantBody(body)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const rentAmount = parseFloat(body.rent_amount)
  const balanceDue = parseFloat(body.balance_due) || 0
  const rentDueDay = Math.min(28, Math.max(1, parseInt(body.rent_due_day) || 1))
  const hasExistingBalance = balanceDue > 0
  const intakeAction = typeof body.intake_action === "string" ? body.intake_action : "manual_review"

  // If PM has Auto Mode on and tenant has a balance, auto-approve instead of requiring manual review
  let autoApproved = false
  let pmProfile: { auto_mode?: boolean; pm_phone?: string | null; pm_alerts_enabled?: boolean } | null = null
  if (hasExistingBalance && intakeAction !== "no_contact") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("auto_mode, pm_phone, pm_alerts_enabled")
      .eq("id", user.id)
      .single()
    pmProfile = profile
    autoApproved = !!(profile?.auto_mode)
  }

  const { data: inserted, error } = await supabase.from("tenants").insert({
    name: body.name.trim(),
    email: body.email || null,
    phone: (normalizePhone(body.phone) ?? body.phone) || null,
    unit: body.unit.trim(),
    property_id: body.property_id,
    rent_amount: rentAmount,
    balance_due: Math.max(0, balanceDue),
    rent_due_day: rentDueDay,
    payment_method: body.payment_method || "unknown",
    card_expiry: body.card_expiry || null,
    lease_start: body.lease_start || null,
    lease_end: body.lease_end || null,
    last_payment_date: body.last_payment_date || null,
    delinquency_start_date: body.delinquency_start_date || null,
    intake_status: hasExistingBalance ? (intakeAction === "no_contact" ? "no_contact" : (autoApproved ? "normal" : "needs_review")) : "normal",
    intake_action: hasExistingBalance ? intakeAction : null,
    auto_contact_approved: !hasExistingBalance || autoApproved,
    days_late_avg: Math.max(0, parseFloat(body.days_late_avg) || 0),
    late_payment_count: Math.max(0, parseInt(body.late_payment_count) || 0),
    previous_delinquency: body.previous_delinquency ?? false,
    status: "active",
    user_id: user.id,
  }).select("id").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // PM heads-up SMS when auto-approving a new tenant with an existing balance
  if (autoApproved && inserted && pmProfile?.pm_alerts_enabled && pmProfile.pm_phone) {
    const pmPhone = normalizePhone(pmProfile.pm_phone)
    if (pmPhone) {
      const tenantFirstName = (body.name as string).trim().split(" ")[0]
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      try {
        const { default: twilio } = await import("twilio")
        const tw = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        await tw.messages.create({
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: pmPhone,
          body: `RentSentry: ${tenantFirstName} (Unit ${(body.unit as string).trim()}) was added with a $${balanceDue.toLocaleString()} balance. Auto Mode will send them outreach in ~24h. To pause: ${appUrl}/dashboard/tenants/${inserted.id}`,
        })
      } catch (e) { console.error("tenants: auto-approve PM heads-up SMS failed:", e) }
    }
  }

  revalidateTag(`tenant-data-${user.id}`, 'max')

  return NextResponse.json({ ok: true })
}
