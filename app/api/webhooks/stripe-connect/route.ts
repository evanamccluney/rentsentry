import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature")!
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_CONNECT_WEBHOOK_SECRET!)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const tenantId = session.metadata?.tenant_id
    const landlordId = session.metadata?.landlord_id

    if (!tenantId || !landlordId) return NextResponse.json({ received: true })

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const amountPaid = (session.amount_total || 0) / 100

    const { data: tenant } = await supabase
      .from("tenants")
      .select("balance_due")
      .eq("id", tenantId)
      .single()

    await supabase.from("tenants").update({
      balance_due: Math.max(0, (tenant?.balance_due || 0) - amountPaid),
      last_payment_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    }).eq("id", tenantId)

    await supabase.from("payments").insert({
      tenant_id: tenantId,
      user_id: landlordId,
      amount: amountPaid,
      date: new Date().toISOString().split("T")[0],
      source: "stripe_connect",
      notes: "Paid via RentSentry payment link",
    })

    await supabase.from("interventions").insert({
      tenant_id: tenantId,
      user_id: landlordId,
      type: "payment_link_paid",
      status: "sent",
      sent_at: new Date().toISOString(),
      snapshot: { amount_paid: amountPaid, source: "stripe_connect" },
    })
  }

  return NextResponse.json({ received: true })
}
