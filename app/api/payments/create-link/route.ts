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

  if (!checkRateLimit(`payment-link:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 })
  }

  const { tenantId } = await req.json()

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
    .select("id, name, phone, rent_amount, balance_due, unit")
    .eq("id", tenantId)
    .eq("user_id", user.id)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const amountDollars = tenant.balance_due > 0 ? tenant.balance_due : tenant.rent_amount
  const amountCents = Math.round(amountDollars * 100)
  const feeCents = Math.round(amountCents * FEE_RATE)
  const totalCents = amountCents + feeCents // tenant pays rent + fee

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
            name: `Rent Payment — Unit ${tenant.unit}`,
            description: `Payment to ${profile.pm_display_name || "your property manager"} via RentSentry. You may also pay by check — contact your landlord for details.`,
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
    metadata: { tenant_id: tenant.id, landlord_id: user.id, rent_amount_cents: amountCents.toString() },
    payment_intent_data: {
      application_fee_amount: feeCents,
      transfer_data: { destination: profile.stripe_account_id },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/cancelled`,
  })

  // Send SMS to tenant with payment link
  if (tenant.phone && session.url) {
    try {
      await sendTenantSms(
        supabase,
        tenant.id,
        tenant.phone,
        `Hi ${tenant.name}, your ${profile.pm_display_name || "property manager"} has sent you a secure payment link for $${amountDollars.toLocaleString()} due on Unit ${tenant.unit}. Pay now: ${session.url} Reply STOP to opt out.`
      )

      const svc = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      await svc.from("interventions").insert({
        tenant_id: tenant.id,
        user_id: user.id,
        type: "payment_link_sent",
        status: "sent",
        sent_at: new Date().toISOString(),
        snapshot: { amount: amountDollars, payment_url: session.url },
      })
    } catch {
      // SMS failed but link was created — not fatal
    }
  }

  return NextResponse.json({ url: session.url })
}
