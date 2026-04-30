import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { revalidateTag } from "next/cache"
import twilio from "twilio"
import { normalizePhone } from "@/lib/phone"
import { sendTenantEmail } from "@/lib/email"

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
)
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!

// SMS messages — concise, single segment (<160 chars each)
const SMS_MESSAGES: Record<string, (name: string) => string> = {
  payment_reminder: (name) =>
    `Hi ${name}, this is a reminder that rent is due on the 1st. Please ensure payment is ready. Contact your property manager with any questions.`,

  proactive_reminder: (name) =>
    `Hi ${name}, rent is due on the 1st. Based on your payment history we wanted to reach out early. Contact your property manager with any questions.`,

  card_expiry_alert: (name) =>
    `Hi ${name}, your payment method on file may need attention. Please confirm or update it before the 1st to avoid any issues with your tenancy.`,

  split_pay_offer: (name) =>
    `Hi ${name}, your property manager is offering a flexible split-payment option this month. Reply or call to arrange installments before the 1st.`,

  cash_for_keys: (name) =>
    `Hi ${name}, your property manager has a time-sensitive offer regarding your unit. Please contact them within 5 days to discuss your options.`,

  legal_packet: (name) =>
    `Hi ${name}, your account is significantly overdue and legal proceedings are being prepared. Contact your property manager immediately to resolve this.`,
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

  const { tenantId, type, phone, name, snapshot, message } = await req.json()

  if (!tenantId || !type) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

  // Log the intervention with risk snapshot
  await supabase.from("interventions").insert({
    tenant_id: tenantId,
    user_id: user.id,
    type,
    status: "sent",
    sent_at: new Date().toISOString(),
    snapshot: snapshot ?? null,
  })

  // Send SMS if phone available, otherwise fall back to email
  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone) {
    const body = message?.trim() || (SMS_MESSAGES[type] ? SMS_MESSAGES[type](name || "Resident") : null)
    if (body) {
      try {
        await twilioClient.messages.create({
          from: FROM_NUMBER,
          to: normalizedPhone,
          body,
        })
      } catch (err: any) {
        console.error("Twilio send error:", err?.message)
      }
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
