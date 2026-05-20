import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizePhone } from "@/lib/phone"
import { Resend } from "resend"
import { RESEND_FROM } from "@/lib/resend-from"

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

export async function POST(req: NextRequest) {
  const twilioSig = req.headers.get("x-twilio-signature") ?? ""
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return new NextResponse("Misconfigured", { status: 500 })

  const formData = await req.formData()
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    params[key] = value.toString()
  }

  const webhookUrl = `${APP_URL}/api/webhooks/sms/status`
  const { validateRequest } = await import("twilio")
  if (!validateRequest(authToken, twilioSig, webhookUrl, params)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const status = params["MessageStatus"]
  const toRaw = params["To"]
  const messageSid = params["MessageSid"]

  if (status !== "failed" && status !== "undelivered") {
    return new NextResponse("", { status: 204 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const toPhone = normalizePhone(toRaw)
  if (!toPhone) return new NextResponse("", { status: 204 })

  const lastTen = toPhone.replace(/\D/g, "").slice(-10)
  const { data: candidates } = await supabase
    .from("tenants")
    .select("id, name, unit, user_id, phone")
    .like("phone", `%${lastTen}`)
    .eq("status", "active")

  const tenant = (candidates ?? []).find(
    (t: { phone: string | null }) => normalizePhone(t.phone) === toPhone
  ) ?? candidates?.[0]

  if (!tenant) return new NextResponse("", { status: 204 })

  await supabase.from("interventions").insert({
    tenant_id: tenant.id,
    user_id: tenant.user_id,
    type: "sms_delivery_failed",
    status: "failed",
    sent_at: new Date().toISOString(),
    notes: `SMS delivery ${status} — SID: ${messageSid}`,
    snapshot: { message_sid: messageSid, delivery_status: status, to_phone: toRaw },
  })

  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_email")
    .eq("id", tenant.user_id)
    .single()

  if (profile?.notification_email) {
    try {
      await resend.emails.send({
        from: RESEND_FROM,
        to: profile.notification_email,
        subject: `SMS not delivered — ${tenant.name} (Unit ${tenant.unit})`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:36px 28px;background:#0a0e1a;color:#f0f1f3;border-radius:14px;">
          <p style="font-size:12px;color:#4b5563;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">RentSentry · Delivery Alert</p>
          <h2 style="margin:0 0 10px;font-size:18px;">SMS not delivered to ${tenant.name}</h2>
          <p style="color:#9ca3af;font-size:14px;line-height:1.6;margin:0 0 20px;">
            A message to <strong>${tenant.name}</strong> (Unit ${tenant.unit}) failed to deliver (status: <strong>${status}</strong>).
            Their phone number may be incorrect, their carrier may be blocking messages, or their phone may be unreachable.
          </p>
          <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;">Verify their number or reach out another way.</p>
          <a href="${APP_URL}/dashboard/tenants/${tenant.id}" style="display:inline-block;background:#60a5fa;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
            View ${tenant.name.split(" ")[0]}'s Record →
          </a>
        </div>`,
      })
    } catch (e) {
      console.error("sms-status: PM email alert failed:", e)
    }
  }

  return new NextResponse("", { status: 204 })
}
