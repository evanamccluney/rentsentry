import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { chargeAutopayTenant } from "@/lib/autopay/charge-tenant"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const querySecret = req.nextUrl.searchParams.get("secret")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && querySecret !== process.env.CRON_SECRET) {
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", tenant.user_id)
      .single()

    if (!profile?.stripe_account_id) {
      results.skipped++
      continue
    }

    if (!tenant.rent_amount || tenant.rent_amount <= 0) {
      results.skipped++
      continue
    }

    const result = await chargeAutopayTenant(tenant, profile.stripe_account_id, today, monthStart, now, stripe, supabase)
    if (result === "charged") results.charged++
    else results.failed++
  }

  return NextResponse.json({ ...results, date: today })
}
