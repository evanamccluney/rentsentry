import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { revalidateTag } from "next/cache"
import { normalizePhone } from "@/lib/phone"
import { sendTenantEmail } from "@/lib/email"
import { sendTenantSms } from "@/lib/sms"
import { generateShortCode } from "@/lib/short-link"

// SMS messages — concise, single segment (<160 chars each)
const SMS_MESSAGES: Record<string, (name: string, balance?: number, daysPastDue?: number) => string> = {
  payment_reminder: (name, balance, daysPastDue) =>
    balance && balance > 0
      ? `Hi ${name}, you have an outstanding balance of $${balance.toLocaleString()}${daysPastDue && daysPastDue > 0 ? ` — ${daysPastDue} days overdue` : " — overdue"}. Please contact your property manager to arrange payment. Reply STOP to opt out.`
      : `Hi ${name}, your upcoming rent payment is due soon. Please make sure your payment is ready. Contact your property manager with any questions. Reply STOP to opt out.`,
  proactive_reminder: (name) =>
    `Hi ${name}, just a heads-up — rent is coming due. We're reaching out early based on your payment history. Contact your property manager with any questions. Reply STOP to opt out.`,
  card_expiry_alert: (name) =>
    `Hi ${name}, the payment method on your account is expiring soon. Please update it before your next rent payment to avoid a failed charge. Reply STOP to opt out.`,
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

// Compute how many days until the next rent due date
function daysUntilRentDue(rentDueDay: number): number {
  const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
  const nextDue = thisMonth > now ? thisMonth : new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
  return Math.ceil((nextDue.getTime() - now.getTime()) / 86400000)
}

// Determine total offer amount and max installment count
function computeOfferParams(balanceDue: number, rentAmount: number, rentDueDay: number): {
  totalAmount: number
  maxInstallments: number
  includesNextMonth: boolean
} {
  const dayOfMonth = new Date().getDate()
  const daysUntilDue = daysUntilRentDue(rentDueDay)

  // Mid-month: tenant owes last month AND next rent is close — bundle both
  if (
    dayOfMonth >= 15 &&
    daysUntilDue <= 20 &&
    rentAmount > 0 &&
    balanceDue >= rentAmount * 0.8
  ) {
    return {
      totalAmount: Math.round((balanceDue + rentAmount) * 100) / 100,
      maxInstallments: 6,
      includesNextMonth: true,
    }
  }

  // Standard: just the current balance, up to 3 installments
  const monthsOwed = rentAmount > 0 ? balanceDue / rentAmount : 1
  const maxInstallments = monthsOwed >= 1.5 ? 4 : monthsOwed >= 1 ? 3 : 2
  return {
    totalAmount: balanceDue,
    maxInstallments,
    includesNextMonth: false,
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json()
  const { tenantId, type, phone, name, snapshot, message, notes } = body

  if (!tenantId || !type) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

  // ── split_pay_offer: generate token + build tenant-facing link ───────────────
  if (type === "split_pay_offer") {
    const balanceDue: number = body.balanceDue ?? snapshot?.balance_due ?? 0
    const rentAmount: number = body.rentAmount ?? snapshot?.rent_amount ?? 0
    const rentDueDay: number = body.rentDueDay ?? snapshot?.rent_due_day ?? 1

    const { data: profile } = await supabase
      .from("profiles")
      .select("pm_display_name, pm_phone, pm_alerts_enabled, pm_alert_triggers")
      .eq("id", user.id)
      .single()
    const pmName = profile?.pm_display_name?.trim() || null

    const token = generateShortCode()
    const offer = computeOfferParams(balanceDue, rentAmount, rentDueDay)
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()

    await supabase.from("interventions").insert({
      tenant_id: tenantId,
      user_id: user.id,
      type: "split_pay_offer",
      status: "sent",
      sent_at: new Date().toISOString(),
      notes: notes ?? null,
      snapshot: {
        ...(snapshot ?? {}),
        offer_token: token,
        total_amount: offer.totalAmount,
        max_installments: offer.maxInstallments,
        min_installments: 2,
        includes_next_month: offer.includesNextMonth,
        rent_due_day: rentDueDay,
        expires_at: expiresAt,
      },
    })

    const offerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pay/offer/${token}`
    const pmFirst = pmName ? pmName.split(" ")[0] : null
    const from = pmFirst ? `your property manager ${pmFirst}` : "your property manager"
    const firstName = (name || "Resident").split(" ")[0]
    const smsBody = offer.includesNextMonth
      ? `Hi ${firstName}, ${from} is offering to split your $${offer.totalAmount.toLocaleString()} balance (past due + upcoming rent) into up to ${offer.maxInstallments} payments. Choose your plan: ${offerUrl} Reply STOP to opt out.`
      : `Hi ${firstName}, ${from} is offering to split your $${offer.totalAmount.toLocaleString()} balance into installments. Choose your plan: ${offerUrl} Reply STOP to opt out.`

    const normalizedPhone = normalizePhone(phone)
    if (normalizedPhone) {
      await sendTenantSms(supabase, tenantId, normalizedPhone, smsBody)
    } else {
      const { data: tenantRecord } = await supabase
        .from("tenants").select("email").eq("id", tenantId).single()
      if (tenantRecord?.email) {
        await sendTenantEmail(tenantRecord.email, type, name || "Resident")
      }
    }

    // PM SMS alert for plan_sent trigger
    const pmTriggers: string[] = Array.isArray(profile?.pm_alert_triggers)
      ? profile.pm_alert_triggers
      : ["pay_or_quit", "legal", "installment_missed", "autopay_declined", "tenant_response", "plan_sent"]
    if (profile?.pm_alerts_enabled && pmTriggers.includes("plan_sent") && profile?.pm_phone) {
      const pmPhoneNorm = normalizePhone(profile.pm_phone)
      if (pmPhoneNorm) {
        try {
          const { default: twilio } = await import("twilio")
          const tw = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
          const firstName = (name || "Resident").split(" ")[0]
          await tw.messages.create({
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: pmPhoneNorm,
            body: `RentSentry: Payment plan offer sent to ${firstName} — $${offer.totalAmount.toLocaleString()} in up to ${offer.maxInstallments} installments${offer.includesNextMonth ? " (incl. next month)" : ""}. View: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tenants/${tenantId}`,
          })
        } catch (e) { console.error("interventions: plan_sent PM alert failed:", e) }
      }
    }

    revalidateTag(`tenant-data-${user.id}`, 'max')
    return NextResponse.json({ ok: true, message: "Split-pay offer sent with payment link." })
  }

  // ── All other intervention types ─────────────────────────────────────────────
  await supabase.from("interventions").insert({
    tenant_id: tenantId,
    user_id: user.id,
    type,
    status: "sent",
    sent_at: new Date().toISOString(),
    notes: notes ?? null,
    snapshot: snapshot ?? null,
  })

  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone) {
    const balanceDue: number = body.balanceDue ?? snapshot?.balance_due ?? 0
    const daysPastDue: number = body.daysPastDue ?? snapshot?.days_past_due ?? 0
    const body2 = message?.trim() || (SMS_MESSAGES[type] ? SMS_MESSAGES[type](name || "Resident", balanceDue, daysPastDue) : null)
    if (body2) {
      await sendTenantSms(supabase, tenantId, normalizedPhone, body2)
    }
  } else {
    const { data: tenantRecord } = await supabase
      .from("tenants").select("email").eq("id", tenantId).single()
    if (tenantRecord?.email) {
      await sendTenantEmail(tenantRecord.email, type, name || "Resident")
    }
  }

  revalidateTag(`tenant-data-${user.id}`, 'max')
  return NextResponse.json({ ok: true, message: ACTION_LABELS[type] || "Action logged." })
}
