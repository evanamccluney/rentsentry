import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { sendTenantSms } from "@/lib/sms"

import { FEE_RATE } from "@/lib/payment-config"
import { checkRateLimit } from "@/lib/rate-limit"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  if (!checkRateLimit(`payment-plan:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 })
  }

  const { tenantId, installments, frequency, enableAutopay } = await req.json()
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
    .select("id, name, phone, unit, balance_due, stripe_customer_id")
    .eq("id", tenantId)
    .eq("user_id", user.id)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const totalAmount = installments.reduce((sum: number, inst: { amount: number }) => sum + inst.amount, 0)
  const first = installments[0]
  const amountCents = Math.round(first.amount * 100)
  const feeCents = Math.round(amountCents * FEE_RATE)
  const planType = "arrears"

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
            name: `Past-due Rent Payment - Unit ${tenant.unit} (Installment 1 of ${installments.length})`,
            description: `Arrears payment plan installment 1 of ${installments.length}. You may also pay by check - contact your landlord for details.`,
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
      plan_type: planType,
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
      plan_type: planType,
      total_plan_amount: totalAmount,
      balance_due_at_creation: tenant.balance_due ?? 0,
      frequency,
      first_checkout_url: session.url,
    },
  })

  await svc.from("tenants").update({
    resolution_status: "payment_plan",
    updated_at: new Date().toISOString(),
  }).eq("id", tenant.id)

  if (tenant.phone && session.url) {
    await sendTenantSms(
      svc,
      tenant.id,
      tenant.phone,
      `Hi ${tenant.name}, your ${profile.pm_display_name || "property manager"} set up a ${installments.length}-payment plan for your $${(tenant.balance_due ?? totalAmount).toLocaleString()} past-due balance on Unit ${tenant.unit}. Pay installment 1 ($${first.amount.toLocaleString()}) now: ${session.url} You may also pay by check. Reply STOP to opt out.`
    )
  }

  // If autopay enabled, create Stripe customer + setup session and SMS tenant
  let autopayUrl: string | null = null
  if (enableAutopay) {
    let customerId = tenant.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: { tenant_id: tenant.id, landlord_id: user.id },
      })
      customerId = customer.id
      await svc.from("tenants").update({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }).eq("id", tenant.id)
    }

    const setupSession = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["us_bank_account", "card"],
      payment_method_options: {
        us_bank_account: {
          financial_connections: { permissions: ["payment_method"] },
        },
      },
      metadata: { tenant_id: tenant.id, landlord_id: user.id, plan_type: planType },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/autopay-confirmed`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/cancelled`,
    })
    autopayUrl = setupSession.url

    if (tenant.phone && setupSession.url) {
      await sendTenantSms(
        svc,
        tenant.id,
        tenant.phone,
        `Hi ${tenant.name}, save your bank account to enable autopay for your payment plan on Unit ${tenant.unit}: ${setupSession.url} Installments will be charged automatically — no card fees. Reply STOP to opt out.`
      )
    }
  }

  return NextResponse.json({ url: session.url, autopayUrl, success: true })
}
