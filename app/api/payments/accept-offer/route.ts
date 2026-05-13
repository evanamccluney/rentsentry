import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { sendTenantSms } from "@/lib/sms"

import { FEE_RATE } from "@/lib/payment-config"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find the offer intervention by token
  const { data: offers } = await supabase
    .from("interventions")
    .select("id, tenant_id, user_id, status, snapshot")
    .eq("type", "pre_due_installment_offer")
    .filter("snapshot->>offer_token", "eq", token)
    .limit(1)

  const offer = offers?.[0]
  if (!offer) return NextResponse.json({ error: "Offer not found or expired" }, { status: 404 })
  if (offer.status === "accepted") return NextResponse.json({ error: "Already accepted" }, { status: 409 })

  const snap = offer.snapshot as {
    installments: { amount: number; due_date: string }[]
    rent_amount: number
    expires_at: string
    offer_token: string
  }

  if (new Date(snap.expires_at) < new Date()) {
    return NextResponse.json({ error: "This offer has expired. Contact your landlord." }, { status: 410 })
  }

  // Fetch tenant + landlord profile
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, phone, unit, stripe_customer_id")
    .eq("id", offer.tenant_id)
    .single()

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, pm_display_name")
    .eq("id", offer.user_id)
    .single()

  if (!tenant || !profile?.stripe_account_id) {
    return NextResponse.json({ error: "Unable to process offer" }, { status: 500 })
  }

  const first = snap.installments[0]
  const amountCents = Math.round(first.amount * 100)
  const feeCents = Math.round(amountCents * FEE_RATE)

  // Create first installment checkout
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["us_bank_account", "card"],
    payment_method_options: {
      us_bank_account: {
        financial_connections: { permissions: ["payment_method"] },
      },
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Rent Payment — Unit ${tenant.unit} (Installment 1 of ${snap.installments.length})`,
            description: `Payment plan installment 1 of ${snap.installments.length}. You may also pay by check — contact your landlord for details.`,
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
      landlord_id: offer.user_id,
      installment_index: "0",
      installment_total: snap.installments.length.toString(),
      rent_amount_cents: amountCents.toString(),
    },
    payment_intent_data: {
      application_fee_amount: feeCents,
      transfer_data: { destination: profile.stripe_account_id },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/offer/${token}`,
  })

  // Create the official payment plan intervention
  await supabase.from("interventions").insert({
    tenant_id: tenant.id,
    user_id: offer.user_id,
    type: "payment_plan_agreed",
    status: "sent",
    sent_at: new Date().toISOString(),
    snapshot: {
      installments: snap.installments,
      total_plan_amount: snap.rent_amount,
      frequency: "biweekly",
      first_checkout_url: session.url,
      initiated_by: "tenant",
    },
  })

  // Update tenant resolution_status
  await supabase.from("tenants").update({
    resolution_status: "payment_plan",
    updated_at: new Date().toISOString(),
  }).eq("id", tenant.id)

  // Mark offer as accepted
  await supabase.from("interventions")
    .update({ status: "accepted" })
    .eq("id", offer.id)

  // SMS tenant with autopay setup link if they have a customer ID
  if (tenant.phone && tenant.stripe_customer_id) {
    try {
      const setupSession = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: tenant.stripe_customer_id,
        payment_method_types: ["us_bank_account", "card"],
        payment_method_options: {
          us_bank_account: {
            financial_connections: { permissions: ["payment_method"] },
          },
        },
        metadata: { tenant_id: tenant.id, landlord_id: offer.user_id },
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/autopay-confirmed`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/cancelled`,
      })
      if (setupSession.url) {
        await sendTenantSms(
          supabase,
          tenant.id,
          tenant.phone,
          `Hi ${tenant.name}, one more step — link your bank account to activate autopay for your payment plan: ${setupSession.url} Reply STOP to opt out.`
        )
      }
    } catch {}
  }

  return NextResponse.json({ url: session.url })
}
