import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { sendTenantSms } from "@/lib/sms"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const FEE_RATE = 0.005

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId, installmentIndex, amount, totalInstallments } = await req.json()

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, pm_display_name")
    .eq("id", user.id)
    .single()

  if (!profile?.stripe_account_id) {
    return NextResponse.json({ error: "Stripe not connected." }, { status: 400 })
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, phone, unit")
    .eq("id", tenantId)
    .eq("user_id", user.id)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const amountCents = Math.round(amount * 100)
  const feeCents = Math.round(amountCents * FEE_RATE)
  const installmentNum = installmentIndex + 1

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
            name: `Rent Payment — Unit ${tenant.unit} (Installment ${installmentNum} of ${totalInstallments})`,
            description: `Payment plan installment ${installmentNum} of ${totalInstallments}. You may also pay by check — contact your landlord for details.`,
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
      installment_index: installmentIndex.toString(),
      installment_total: totalInstallments.toString(),
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

  if (tenant.phone && session.url) {
    await sendTenantSms(
      supabase,
      tenant.id,
      tenant.phone,
      `Hi ${tenant.name}, installment ${installmentNum} of ${totalInstallments} ($${amount.toLocaleString()}) is due for Unit ${tenant.unit}. Pay now: ${session.url} Reply STOP to opt out.`
    )
  }

  await svc.from("interventions").insert({
    tenant_id: tenant.id,
    user_id: user.id,
    type: "installment_reminder",
    status: "sent",
    sent_at: new Date().toISOString(),
    snapshot: { installment_index: installmentIndex, amount, payment_url: session.url },
  })

  return NextResponse.json({ url: session.url })
}
