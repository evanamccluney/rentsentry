import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import Twilio from "twilio"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const twilio = Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature")!
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // RentSentry subscription checkout completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    // Autopay card setup completed
    if (session.mode === "setup") {
      const tenantId = session.metadata?.tenant_id
      if (tenantId && session.setup_intent) {
        const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string)
        const paymentMethodId = setupIntent.payment_method as string
        if (paymentMethodId) {
          await supabase.from("tenants").update({
            stripe_payment_method_id: paymentMethodId,
            updated_at: new Date().toISOString(),
          }).eq("id", tenantId)

          await supabase.from("interventions").insert({
            tenant_id: tenantId,
            user_id: session.metadata?.landlord_id,
            type: "autopay_enabled",
            status: "sent",
            sent_at: new Date().toISOString(),
            snapshot: { payment_method_id: paymentMethodId },
          })
        }
      }
    }

    // Platform subscription checkout
    const userId = session.metadata?.user_id
    if (userId && session.mode === "subscription") {
      await supabase.from("subscriptions").upsert({
        user_id: userId,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        status: "active",
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", sub.id)
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice
    await supabase
      .from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("stripe_customer_id", invoice.customer as string)
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account
    if (account.charges_enabled && account.details_submitted) {
      await supabase
        .from("profiles")
        .update({ stripe_connect_at: new Date().toISOString() })
        .eq("stripe_account_id", account.id)
    }
  }

  // Autopay charge declined
  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent
    const tenantId = pi.metadata?.tenant_id
    const landlordId = pi.metadata?.landlord_id
    const isAutopay = pi.metadata?.is_autopay === "true"

    if (!tenantId || !landlordId || !isAutopay) return NextResponse.json({ received: true })

    const installmentIndex = pi.metadata?.installment_index
    const amountDollars = (pi.metadata?.rent_amount_cents ? parseInt(pi.metadata.rent_amount_cents) : pi.amount) / 100

    // Log the decline
    await supabase.from("interventions").insert({
      tenant_id: tenantId,
      user_id: landlordId,
      type: "payment_declined",
      status: "sent",
      sent_at: new Date().toISOString(),
      snapshot: {
        amount: amountDollars,
        installment_index: installmentIndex !== undefined ? parseInt(installmentIndex) : null,
        decline_reason: pi.last_payment_error?.message || "Card declined",
      },
    })

    // Count declines in last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentDeclines } = await supabase
      .from("interventions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("type", "payment_declined")
      .gte("sent_at", thirtyDaysAgo.toISOString())

    const declineCount = recentDeclines?.length ?? 1

    // Fetch tenant name + landlord phone for SMS alert
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, unit")
      .eq("id", tenantId)
      .single()

    const { data: profile } = await supabase
      .from("profiles")
      .select("pm_phone, pm_alerts_enabled, pm_alert_triggers")
      .eq("id", landlordId)
      .single()

    const triggers: string[] = Array.isArray(profile?.pm_alert_triggers)
      ? profile.pm_alert_triggers
      : ["autopay_declined"]

    if (profile?.pm_alerts_enabled && triggers.includes("autopay_declined") && profile?.pm_phone && tenant) {
      try {
        const installmentLabel = installmentIndex !== undefined
          ? ` (installment ${parseInt(installmentIndex) + 1})`
          : ""

        const message = declineCount >= 2
          ? `RentSentry Alert: ${tenant.name} (Unit ${tenant.unit}) has had ${declineCount} autopay declines in 30 days — $${amountDollars.toLocaleString()}${installmentLabel}. Financial distress likely. Review their profile and decide next steps.`
          : `RentSentry Alert: Autopay declined for ${tenant.name} (Unit ${tenant.unit}) — $${amountDollars.toLocaleString()}${installmentLabel}. This may be temporary. Check in with your tenant.`

        await twilio.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: profile.pm_phone,
        })
      } catch {
        // SMS failure is not fatal
      }
    }
  }

  return NextResponse.json({ received: true })
}
