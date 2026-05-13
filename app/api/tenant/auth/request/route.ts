import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizePhone } from "@/lib/phone"
import twilio from "twilio"
import { PENDING_PHONE_COOKIE } from "@/lib/tenant-auth"

export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone) return NextResponse.json({ error: "Phone required" }, { status: 400 })

  const normalized = normalizePhone(phone)
  if (!normalized) return NextResponse.json({ error: "Invalid phone number" }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const lastTen = normalized.replace(/\D/g, "").slice(-10)
  const { data: candidates } = await supabase
    .from("tenants")
    .select("id, name, user_id, phone, status")
    .like("phone", `%${lastTen}`)

  const tenant = (candidates ?? []).find(t => normalizePhone(t.phone) === normalized)

  // Always respond ok — don't leak whether phone exists
  if (!tenant || tenant.status === "vacated") {
    return NextResponse.json({ ok: true })
  }

  // Expire any existing OTPs for this tenant
  await supabase
    .from("interventions")
    .update({ status: "resolved" })
    .eq("tenant_id", tenant.id)
    .eq("type", "tenant_otp")
    .eq("status", "pending")

  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 10 * 60000).toISOString()

  await supabase.from("interventions").insert({
    tenant_id: tenant.id,
    user_id: tenant.user_id,
    type: "tenant_otp",
    status: "pending",
    sent_at: new Date().toISOString(),
    snapshot: { code, phone: normalized, expires_at: expiresAt },
  })

  try {
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: normalized,
      body: `Your RentSentry verification code is ${code}. It expires in 10 minutes.`,
    })
  } catch { /* don't reveal SMS errors to client */ }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(PENDING_PHONE_COOKIE, normalized, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  })
  return res
}
