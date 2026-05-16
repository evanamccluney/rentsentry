import Stripe from "stripe"

const FEE_RATE = 0.005

export interface AutopayTenant {
  id: string
  name: string
  user_id: string
  rent_amount: number | null
  stripe_customer_id: string
  stripe_payment_method_id: string
  balance_due: number | null
}

export type ChargeResult = "charged" | "failed"

export async function chargeAutopayTenant(
  tenant: AutopayTenant,
  stripeAccountId: string,
  today: string,
  monthStart: string,
  now: Date,
  stripe: Stripe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<ChargeResult> {
  const amountCents = Math.round((tenant.rent_amount ?? 0) * 100)
  const feeCents = Math.round(amountCents * FEE_RATE)
  const totalCents = amountCents + feeCents

  // Deterministic idempotency key: safe to retry the cron without double-charging
  const idempotencyKey = `autopay-${tenant.id}-${monthStart}`

  try {
    await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: "usd",
        customer: tenant.stripe_customer_id,
        payment_method: tenant.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        application_fee_amount: feeCents,
        transfer_data: { destination: stripeAccountId },
        metadata: {
          tenant_id: tenant.id,
          landlord_id: tenant.user_id,
          rent_amount_cents: amountCents.toString(),
          is_autopay: "true",
          autopay_type: "monthly",
        },
      },
      { idempotencyKey }
    )
  } catch (e) {
    // payment_intent.payment_failed webhook handles decline logging + PM alert
    console.error(`autopay charge failed for tenant ${tenant.id}:`, e)
    return "failed"
  }

  // Stripe charge succeeded — write DB records
  // If any of these fail, the payment still went through; log loudly so it can be reconciled
  const newBalance = Math.max(0, (tenant.balance_due ?? 0) - (tenant.rent_amount ?? 0))
  try {
    await supabase.from("payments").insert({
      tenant_id: tenant.id,
      user_id: tenant.user_id,
      amount: tenant.rent_amount,
      date: today,
      source: "monthly_autopay",
      note: "Monthly autopay charge",
    })
    await supabase.from("tenants").update({
      balance_due: newBalance,
      last_payment_date: today,
      updated_at: now.toISOString(),
    }).eq("id", tenant.id)
    await supabase.from("interventions").insert({
      tenant_id: tenant.id,
      user_id: tenant.user_id,
      type: "autopay_charged",
      status: "sent",
      sent_at: now.toISOString(),
      snapshot: { amount: tenant.rent_amount, source: "monthly_autopay" },
    })
  } catch (e) {
    console.error(`autopay DB write failed after successful charge for tenant ${tenant.id} — manual reconciliation needed:`, e)
  }

  return "charged"
}
