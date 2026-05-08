import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import Twilio from "twilio"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const twilio = Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const FEE_RATE = 0.005

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId, installments, frequency } = await req.json()
  // installments: [{ amount: number; due_date: string }, ...]

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, pm_display_name")
    .eq("id", user.id)
    .single()

  if (!profile?.stripe_account_id) {
    return NextResponse.json({ error: "Stripe not connected. Connect your Stripe account in Settings." }, { status: 400 })
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, phone, unit, balance_due")
    .eq("id", tenantId)
    .eq("user_id", user.id)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const totalAmount = installments.reduce((sum: number, inst: { amount: number }) => sum + inst.amount, 0)
  const first = installments[0]
  const amountCents = Math.round(first.amount * 100)
  const feeCents = Math.round(amountCents * FEE_RATE)

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Rent Payment — Unit ${tenant.unit} (Installment 1 of ${installments.length})`,
            description: `Payment plan installment 1 of ${installments.length}. You may also pay by check — contact your landlord for details.`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Payment processing fee" },
          unit_amount: feeCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      tenant_id: tenant.id,
      landlord_id: user.id,
      installment_index: "0",
      installment_total: installments.length.toString(),
      rent_amount_cents: amountCents.toString(),
    },
    payment_intent_data: {
      application_fee_amount: feeCents,
      transfer_data: { destination: profile.stripe_account_id },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/cancelled`,
  })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await svc.from("interventions").insert({
    tenant_id: tenant.id,
    user_id: user.id,
    type: "payment_plan_agreed",
    status: "sent",
    sent_at: new Date().toISOString(),
    snapshot: {
      installments,
      total_plan_amount: totalAmount,
      frequency,
      first_checkout_url: session.url,
    },
  })

  await svc.from("tenants").update({
    resolution_status: "payment_plan",
    updated_at: new Date().toISOString(),
  }).eq("id", tenant.id)

  if (tenant.phone && session.url) {
    try {
      const freqLabel = frequency === "biweekly" ? "every 2 weeks" : frequency === "weekly" ? "weekly" : "monthly"
      await twilio.messages.create({
        body: `Hi ${tenant.name}, your ${profile.pm_display_name || "property manager"} set up a ${installments.length}-payment plan for Unit ${tenant.unit}. Pay installment 1 ($${first.amount.toLocaleString()}) now: ${session.url} You may also pay by check. Reply STOP to opt out.`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: tenant.phone,
      })
    } catch {
      // SMS failure is not fatal
    }
  }

  return NextResponse.json({ url: session.url, success: true })
}
