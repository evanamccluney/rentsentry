import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import Twilio from "twilio"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const twilio = Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const FEE_RATE = 0.005 // 0.5%

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

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
    payment_method_types: ["card"],
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
    metadata: { tenant_id: tenant.id, landlord_id: user.id },
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
      await twilio.messages.create({
        body: `Hi ${tenant.name}, your ${profile.pm_display_name || "property manager"} has sent you a secure payment link for $${amountDollars.toLocaleString()} due on Unit ${tenant.unit}. Pay now: ${session.url} You may also pay by check — contact your landlord for details. Reply STOP to opt out.`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: tenant.phone,
      })

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
