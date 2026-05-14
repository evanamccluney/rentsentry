import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const FEE_RATE = 0.005

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const today = now.toISOString().split("T")[0]
  const todayDay = now.getDate()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const results = { charged: 0, skipped: 0, failed: 0 }

  // Fetch all tenants enrolled in monthly autopay with a saved payment method
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, user_id, rent_amount, rent_due_day, stripe_customer_id, stripe_payment_method_id, balance_due")
    .eq("autopay_monthly", true)
    .eq("status", "active")
    .not("stripe_payment_method_id", "is", null)
    .not("stripe_customer_id", "is", null)

  if (!tenants?.length) return NextResponse.json({ ...results, message: "No autopay tenants" })

  for (const tenant of tenants) {
    const dueDay = Math.min(tenant.rent_due_day ?? 1, 28)

    // Last day of month handling: if due day > days in month, fire on last day
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const effectiveDueDay = dueDay > daysInMonth ? daysInMonth : dueDay

    if (todayDay !== effectiveDueDay) {
      results.skipped++
      continue
    }

    // Idempotency: skip if already charged this month
    const { data: existingCharge } = await supabase
      .from("payments")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("source", "monthly_autopay")
      .gte("date", monthStart)
      .limit(1)

    if (existingCharge?.length) {
      results.skipped++
      continue
    }

    // Fetch landlord's Stripe account
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", tenant.user_id)
      .single()

    if (!profile?.stripe_account_id) {
      results.skipped++
      continue
    }

    const amountCents = Math.round((tenant.rent_amount ?? 0) * 100)
    if (amountCents <= 0) { results.skipped++; continue }

    const feeCents = Math.round(amountCents * FEE_RATE)
    const totalCents = amountCents + feeCents

    try {
      await stripe.paymentIntents.create({
        amount: totalCents,
        currency: "usd",
        customer: tenant.stripe_customer_id,
        payment_method: tenant.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        application_fee_amount: feeCents,
        transfer_data: { destination: profile.stripe_account_id },
        metadata: {
          tenant_id: tenant.id,
          landlord_id: tenant.user_id,
          rent_amount_cents: amountCents.toString(),
          is_autopay: "true",
          autopay_type: "monthly",
        },
      })

      // Record payment and clear balance
      const newBalance = Math.max(0, (tenant.balance_due ?? 0) - (tenant.rent_amount ?? 0))
      await supabase.from("payments").insert({
        tenant_id: tenant.id,
        user_id: tenant.user_id,
        amount: tenant.rent_amount,
        date: today,
        source: "monthly_autopay",
        note: "Monthly autopay charge",
      })
      await supabase.from("tenants").update({
        balance_due: newBalance,
        last_payment_date: today,
        updated_at: now.toISOString(),
      }).eq("id", tenant.id)
      await supabase.from("interventions").insert({
        tenant_id: tenant.id,
        user_id: tenant.user_id,
        type: "autopay_charged",
        status: "sent",
        sent_at: now.toISOString(),
        snapshot: { amount: tenant.rent_amount, source: "monthly_autopay" },
      })

      results.charged++
    } catch {
      // payment_intent.payment_failed webhook handles decline logging
      results.failed++
    }
  }

  return NextResponse.json({ ...results, date: today })
}
