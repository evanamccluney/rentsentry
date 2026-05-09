import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const FEE_RATE = 0.005

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().split("T")[0]
  const results = { charged: 0, skipped: 0, failed: 0 }

  // Fetch all active payment plans
  const { data: plans } = await supabase
    .from("interventions")
    .select("id, tenant_id, user_id, snapshot")
    .eq("type", "payment_plan_agreed")
    .eq("status", "sent")

  if (!plans?.length) return NextResponse.json({ ...results, message: "No active plans" })

  for (const plan of plans) {
    const snap = plan.snapshot as {
      installments: { amount: number; due_date: string }[]
      total_plan_amount: number
      frequency: string
    }
    if (!snap?.installments?.length) continue

    // Find installments due today
    const dueToday = snap.installments
      .map((inst, i) => ({ ...inst, index: i }))
      .filter(inst => inst.due_date === today)

    if (!dueToday.length) continue

    // Fetch tenant with payment method
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, stripe_customer_id, stripe_payment_method_id, balance_due")
      .eq("id", plan.tenant_id)
      .single()

    if (!tenant?.stripe_payment_method_id || !tenant?.stripe_customer_id) {
      results.skipped++
      continue
    }

    // Check which installments are already paid
    const { data: paidPayments } = await supabase
      .from("payments")
      .select("note")
      .eq("tenant_id", plan.tenant_id)
      .like("note", "installment:%")

    const paidIndices = new Set(
      (paidPayments ?? [])
        .map(p => parseInt((p.note as string).split(":")[1]))
        .filter(n => !isNaN(n))
    )

    // Fetch landlord stripe account
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", plan.user_id)
      .single()

    if (!profile?.stripe_account_id) continue

    for (const inst of dueToday) {
      if (paidIndices.has(inst.index)) continue

      const amountCents = Math.round(inst.amount * 100)
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
            landlord_id: plan.user_id,
            installment_index: inst.index.toString(),
            installment_total: snap.installments.length.toString(),
            rent_amount_cents: amountCents.toString(),
            is_autopay: "true",
          },
        })

        results.charged++
      } catch {
        // payment_intent.payment_failed webhook handles decline logging
        results.failed++
      }
    }
  }

  return NextResponse.json({ ...results, date: today })
}
