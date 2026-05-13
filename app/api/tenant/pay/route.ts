import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import { getTenantIdFromSession } from "@/lib/tenant-auth"
import { FEE_RATE } from "@/lib/payment-config"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

export async function POST(req: NextRequest) {
  const tenantId = await getTenantIdFromSession()
  if (!tenantId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { type } = await req.json().catch(() => ({ type: "full" }))

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, unit, balance_due, rent_amount, user_id")
    .eq("id", tenantId)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", tenant.user_id)
    .single()

  if (!profile?.stripe_account_id) {
    return NextResponse.json({ error: "Online payments not configured for this property." }, { status: 400 })
  }

  const balance = (tenant.balance_due ?? 0) > 0 ? tenant.balance_due : tenant.rent_amount
  if (!balance || balance <= 0) {
    return NextResponse.json({ error: "No balance due." }, { status: 400 })
  }

  if (type === "plan") {
    // Create a 2-installment plan offer and return the offer URL
    const perInstallment = Math.round(balance / 2 * 100) / 100
    const installments = [
      { amount: perInstallment, due_date: new Date().toISOString().split("T")[0] },
      { amount: Math.round((balance - perInstallment) * 100) / 100, due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0] },
    ]
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString()

    await supabase.from("interventions").insert({
      tenant_id: tenant.id,
      user_id: tenant.user_id,
      type: "pre_due_installment_offer",
      status: "pending",
      sent_at: new Date().toISOString(),
      snapshot: { offer_token: token, installments, rent_amount: balance, expires_at: expiresAt, initiated_by: "tenant_portal" },
    })

    return NextResponse.json({ url: `${APP_URL}/pay/offer/${token}` })
  }

  // Full payment via Stripe checkout
  const amountCents = Math.round(balance * 100)
  const feeCents = Math.round(amountCents * FEE_RATE)

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["us_bank_account", "card"],
    payment_method_options: {
      us_bank_account: { financial_connections: { permissions: ["payment_method"] } },
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `Rent Payment — Unit ${tenant.unit}` },
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
    metadata: { tenant_id: tenant.id, landlord_id: tenant.user_id, rent_amount_cents: amountCents.toString() },
    payment_intent_data: {
      application_fee_amount: feeCents,
      transfer_data: { destination: profile.stripe_account_id },
    },
    success_url: `${APP_URL}/pay/success`,
    cancel_url: `${APP_URL}/tenant/portal`,
  })

  if (session.url) {
    await supabase.from("interventions").insert({
      tenant_id: tenant.id,
      user_id: tenant.user_id,
      type: "payment_link_sent",
      status: "sent",
      sent_at: new Date().toISOString(),
      snapshot: { amount: balance, payment_url: session.url, initiated_by: "tenant_portal" },
    })
  }

  return NextResponse.json({ url: session.url })
}
