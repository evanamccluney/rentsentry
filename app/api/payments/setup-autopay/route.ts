import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { sendTenantSms } from "@/lib/sms"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId } = await req.json()

  const { data: profile } = await supabase
    .from("profiles")
    .select("pm_display_name, stripe_account_id")
    .eq("id", user.id)
    .single()

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, email, phone, unit, stripe_customer_id")
    .eq("id", tenantId)
    .eq("user_id", user.id)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Create Stripe customer if tenant doesn't have one
  let customerId = tenant.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: tenant.name,
      email: tenant.email || undefined,
      metadata: { tenant_id: tenant.id, landlord_id: user.id },
    })
    customerId = customer.id
    await svc.from("tenants").update({
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }).eq("id", tenant.id)
  }

  // Create setup session so tenant can save their bank account or card
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    payment_method_types: ["us_bank_account", "card"],
    payment_method_options: {
      us_bank_account: {
        financial_connections: { permissions: ["payment_method"] },
      },
    },
    metadata: {
      tenant_id: tenant.id,
      landlord_id: user.id,
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/autopay-confirmed`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pay/cancelled`,
  })

  // SMS tenant with setup link
  if (tenant.phone && session.url) {
    await sendTenantSms(
      supabase,
      tenant.id,
      tenant.phone,
      `Hi ${tenant.name}, your ${profile?.pm_display_name || "property manager"} has set up a payment plan for Unit ${tenant.unit}. Link your bank account for automatic payments (no card fees): ${session.url} Reply STOP to opt out.`
    )
  }

  return NextResponse.json({ url: session.url, success: true })
}
