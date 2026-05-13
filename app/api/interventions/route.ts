import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { revalidateTag } from "next/cache"
import { normalizePhone } from "@/lib/phone"
import { sendTenantEmail } from "@/lib/email"
import { sendTenantSms } from "@/lib/sms"

// SMS messages — concise, single segment (<160 chars each)
const SMS_MESSAGES: Record<string, (name: string) => string> = {
  payment_reminder: (name) =>
    `Hi ${name}, your upcoming rent payment is due soon. Please make sure your payment is ready. Contact your property manager with any questions. Reply STOP to opt out.`,

  proactive_reminder: (name) =>
    `Hi ${name}, just a heads-up — rent is coming due. We're reaching out early based on your payment history. Contact your property manager with any questions. Reply STOP to opt out.`,

  card_expiry_alert: (name) =>
    `Hi ${name}, the payment method on your account is expiring soon. Please update it before your next rent payment to avoid a failed charge. Reply STOP to opt out.`,

  split_pay_offer: (name) =>
    `Hi ${name}, your property manager is offering to split your next payment into installments. They'll follow up with a payment link shortly. Reply STOP to opt out.`,

  cash_for_keys: (name) =>
    `Hi ${name}, your property manager has an important message about your housing situation. Please contact them directly today — this is time-sensitive. Reply STOP to opt out.`,

  legal_packet: (name) =>
    `Hi ${name}, your property manager needs to speak with you urgently about your account. Please contact them directly today. Reply STOP to opt out.`,
}

const ACTION_LABELS: Record<string, string> = {
  payment_reminder:     "Payment reminder sent",
  proactive_reminder:   "Proactive reminder sent",
  payment_method_alert: "Payment method alert sent",
  card_expiry_alert:    "Payment reminder sent",
  split_pay_offer:      "Split-pay offer sent",
  cash_for_keys:        "Cash for Keys offer sent",
  legal_packet:         "Legal notice sent",
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId, type, phone, name, snapshot, message, notes } = await req.json()

  if (!tenantId || !type) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

  // Log the intervention with risk snapshot
  await supabase.from("interventions").insert({
    tenant_id: tenantId,
    user_id: user.id,
    type,
    status: "sent",
    sent_at: new Date().toISOString(),
    notes: notes ?? null,
    snapshot: snapshot ?? null,
  })

  // Send SMS if phone available, otherwise fall back to email
  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone) {
    const body = message?.trim() || (SMS_MESSAGES[type] ? SMS_MESSAGES[type](name || "Resident") : null)
    if (body) {
      await sendTenantSms(supabase, tenantId, normalizedPhone, body)
    }
  } else {
    // No phone — try email fallback
    const { data: tenantRecord } = await supabase
      .from("tenants")
      .select("email")
      .eq("id", tenantId)
      .single()
    if (tenantRecord?.email) {
      await sendTenantEmail(tenantRecord.email, type, name || "Resident")
    }
  }

  revalidateTag(`tenant-data-${user.id}`, 'max')

  return NextResponse.json({ ok: true, message: ACTION_LABELS[type] || "Action logged." })
}
