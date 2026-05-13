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

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    // ── Setup mode: save payment method, no balance change ────────────────────
    if (session.mode === "setup") {
      const tenantId = session.metadata?.tenant_id
      if (!tenantId || !session.setup_intent) return NextResponse.json({ received: true })

      const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string)
      if (setupIntent.payment_method) {
        await supabase.from("tenants").update({
          stripe_payment_method_id: setupIntent.payment_method as string,
          updated_at: new Date().toISOString(),
        }).eq("id", tenantId)
      }
      return NextResponse.json({ received: true })
    }

    // ── Payment mode: clear balance ───────────────────────────────────────────
    if (session.mode !== "payment") return NextResponse.json({ received: true })

    const tenantId = session.metadata?.tenant_id
    const landlordId = session.metadata?.landlord_id

    if (!tenantId || !landlordId) return NextResponse.json({ received: true })

    // ── Idempotency: skip if this Stripe event was already processed ───────────
    const { data: alreadyProcessed } = await supabase
      .from("interventions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("type", "payment_link_paid")
      .eq("snapshot->>stripe_event_id" as string, event.id)
      .maybeSingle()

    if (alreadyProcessed) return NextResponse.json({ received: true })

    // ── Guard: bail if tenant no longer exists ─────────────────────────────────
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, balance_due")
      .eq("id", tenantId)
      .maybeSingle()

    if (!tenant) {
      console.error(`stripe-connect webhook: tenant ${tenantId} not found for event ${event.id}`)
      return NextResponse.json({ received: true })
    }

    const rentAmountCents = parseInt(session.metadata?.rent_amount_cents || "0")
    const amountPaid = rentAmountCents > 0
      ? rentAmountCents / 100
      : (session.amount_total || 0) / 100

    const installmentIndex = session.metadata?.installment_index
    const paymentNote = installmentIndex !== undefined
      ? `installment:${installmentIndex}`
      : "Paid via RentSentry payment link"

    // Run all writes in sequence — if any fail, Stripe will retry the webhook
    // and idempotency check above will prevent double-processing
    await supabase.from("tenants").update({
      balance_due: Math.max(0, (tenant.balance_due || 0) - amountPaid),
      last_payment_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    }).eq("id", tenantId)

    await supabase.from("payments").insert({
      tenant_id: tenantId,
      user_id: landlordId,
      amount: amountPaid,
      date: new Date().toISOString().split("T")[0],
      source: "stripe_connect",
      note: paymentNote,
    })

    // Store stripe_event_id in snapshot so idempotency check works on retry
    await supabase.from("interventions").insert({
      tenant_id: tenantId,
      user_id: landlordId,
      type: "payment_link_paid",
      status: "sent",
      sent_at: new Date().toISOString(),
      snapshot: {
        amount_paid: amountPaid,
        source: "stripe_connect",
        installment_index: installmentIndex !== undefined ? parseInt(installmentIndex) : null,
        stripe_event_id: event.id,
        stripe_session_id: session.id,
      },
    })
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account
    if (account.charges_enabled) {
      await supabase
        .from("profiles")
        .update({ stripe_charges_enabled: true })
        .eq("stripe_account_id", account.id)
    } else {
      await supabase
        .from("profiles")
        .update({ stripe_charges_enabled: false })
        .eq("stripe_account_id", account.id)
    }
    return NextResponse.json({ received: true })
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent
    if (pi.metadata?.is_autopay !== "true") return NextResponse.json({ received: true })

    const tenantId = pi.metadata?.tenant_id
    const landlordId = pi.metadata?.landlord_id
    if (!tenantId || !landlordId) return NextResponse.json({ received: true })

    // Count declines in last 30 days
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const { data: recentDeclines } = await supabase
      .from("interventions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("type", "payment_declined")
      .gte("sent_at", cutoff.toISOString())

    const declineCount = (recentDeclines?.length ?? 0) + 1

    await supabase.from("interventions").insert({
      tenant_id: tenantId,
      user_id: landlordId,
      type: "payment_declined",
      status: "sent",
      sent_at: new Date().toISOString(),
      snapshot: { decline_count: declineCount, stripe_event_id: event.id },
    })

    // PM alert — only fires if landlord has autopay_declined in their pm_alert_triggers
    const { data: profile } = await supabase
      .from("profiles")
      .select("pm_phone, pm_alerts_enabled, pm_alert_triggers, notification_email")
      .eq("id", landlordId)
      .single()

    const triggers: string[] = Array.isArray(profile?.pm_alert_triggers)
      ? profile.pm_alert_triggers
      : ["pay_or_quit", "legal", "installment_missed", "autopay_declined"]

    if (triggers.includes("autopay_declined") && profile?.pm_alerts_enabled) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name, unit, rent_amount")
        .eq("id", tenantId)
        .single()

      const alertMsg = `RentSentry: Autopay declined for ${tenant?.name ?? "a tenant"} (Unit ${tenant?.unit ?? "?"}) — $${(tenant?.rent_amount ?? 0).toLocaleString()} charge failed. ${declineCount > 1 ? `${declineCount} declines in last 30 days. ` : ""}Log in to follow up.`

      if (profile.pm_phone) {
        const { normalizePhone } = await import("@/lib/phone")
        const pmPhone = normalizePhone(profile.pm_phone)
        if (pmPhone) {
          try {
            const twilio = (await import("twilio")).default
            const tw = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            await tw.messages.create({ from: process.env.TWILIO_PHONE_NUMBER!, to: pmPhone, body: alertMsg })
          } catch { /* don't fail the webhook */ }
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
