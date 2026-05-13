import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizePhone } from "@/lib/phone"
import { createSessionToken, TENANT_COOKIE, PENDING_PHONE_COOKIE, SESSION_DAYS } from "@/lib/tenant-auth"

export async function POST(req: NextRequest) {
  const { code } = await req.json()
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 })

  const pendingPhone = req.cookies.get(PENDING_PHONE_COOKIE)?.value
  if (!pendingPhone) return NextResponse.json({ error: "Session expired. Please request a new code." }, { status: 400 })

  const normalized = normalizePhone(pendingPhone)
  if (!normalized) return NextResponse.json({ error: "Invalid session." }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const lastTen = normalized.replace(/\D/g, "").slice(-10)
  const { data: candidates } = await supabase
    .from("tenants")
    .select("id, phone")
    .like("phone", `%${lastTen}`)

  const tenant = (candidates ?? []).find(t => normalizePhone(t.phone) === normalized)
  if (!tenant) return NextResponse.json({ error: "Invalid code." }, { status: 401 })

  const { data: otps } = await supabase
    .from("interventions")
    .select("id, snapshot")
    .eq("tenant_id", tenant.id)
    .eq("type", "tenant_otp")
    .eq("status", "pending")
    .order("sent_at", { ascending: false })
    .limit(1)

  const otp = otps?.[0]
  if (!otp) return NextResponse.json({ error: "Invalid code." }, { status: 401 })

  const snap = otp.snapshot as { code?: string; expires_at?: string } | null
  if (!snap?.code || !snap.expires_at) return NextResponse.json({ error: "Invalid code." }, { status: 401 })
  if (new Date(snap.expires_at) < new Date()) return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 401 })
  if (snap.code !== code.trim()) return NextResponse.json({ error: "Incorrect code." }, { status: 401 })

  // Mark OTP as used
  await supabase.from("interventions").update({ status: "resolved" }).eq("id", otp.id)

  const token = await createSessionToken(tenant.id)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(TENANT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 86400,
    path: "/",
  })
  res.cookies.delete(PENDING_PHONE_COOKIE)
  return res
}
