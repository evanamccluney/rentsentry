import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizePhone } from "@/lib/phone"
import { STOP_KEYWORDS, START_KEYWORDS, twiml, emptyTwiml } from "@/lib/sms/utils"
import { handleTenantReply, TenantRow } from "@/lib/sms/tenant-chat"
import { handlePmReply } from "@/lib/sms/pm-handlers"

export async function POST(req: NextRequest) {
  // ── Twilio signature validation ───────────────────────────────────────────
  const twilioSig = req.headers.get("x-twilio-signature") ?? ""
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error("sms-webhook: TWILIO_AUTH_TOKEN not set")
    return new NextResponse("Service misconfigured", { status: 500 })
  }

  // Read body once — must convert to plain object before validating
  const formData = await req.formData()
  const params: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    params[key] = value.toString()
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/sms`
  const { validateRequest } = await import("twilio")
  if (!validateRequest(authToken, twilioSig, webhookUrl, params)) {
    console.error("sms-webhook: invalid Twilio signature from", params["From"])
    return new NextResponse("Forbidden", { status: 403 })
  }

  const fromRaw = params["From"] ?? null
  const body = params["Body"] ?? null

  if (!fromRaw || !body) return twiml("Sorry, something went wrong.")

  const fromPhone = normalizePhone(fromRaw)
  if (!fromPhone) return twiml("Sorry, something went wrong.")

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── STOP / START handling ─────────────────────────────────────────────────
  const keyword = body.trim().toUpperCase()
  if (STOP_KEYWORDS.has(keyword) || START_KEYWORDS.has(keyword)) {
    const optedOut = STOP_KEYWORDS.has(keyword)
    const lastTen = fromPhone.replace(/\D/g, "").slice(-10)
    const { data: candidates } = await supabase
      .from("tenants")
      .select("id, phone")
      .like("phone", `%${lastTen}`)
    const matchIds = (candidates ?? [])
      .filter((t: { phone: string }) => normalizePhone(t.phone) === fromPhone)
      .map((t: { id: string }) => t.id)
    if (matchIds.length > 0) {
      await supabase.from("tenants").update({ sms_opted_out: optedOut }).in("id", matchIds)
    }
    return emptyTwiml()
  }

  // ── Tenant reply ──────────────────────────────────────────────────────────
  const lastTenDigits = fromPhone.replace(/\D/g, "").slice(-10)
  const { data: tenantCandidates } = await supabase
    .from("tenants")
    .select("id, name, unit, user_id, balance_due, rent_amount, last_payment_date, rent_due_day, days_late_avg, late_payment_count, previous_delinquency, phone, stripe_customer_id, autopay_monthly, rent_reporting_opted_in")
    .like("phone", `%${lastTenDigits}`)
    .eq("status", "active")

  const tenantRow = (tenantCandidates ?? []).find((t: { phone: string }) => normalizePhone(t.phone) === fromPhone)
    ?? tenantCandidates?.[0]
  if (tenantRow) {
    return handleTenantReply(supabase, tenantRow as TenantRow, body)
  }

  // ── PM reply ──────────────────────────────────────────────────────────────
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, pm_phone")
    .not("pm_phone", "is", null)

  const profile = (profiles ?? []).find(
    (p: { pm_phone: string }) => normalizePhone(p.pm_phone) === fromPhone
  )

  if (!profile) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    )
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: pendingPrompts } = await supabase
    .from("interventions")
    .select("id, type, snapshot")
    .eq("user_id", profile.id)
    .in("type", ["pm_confirmation_sent", "pm_contact_check_sent", "pm_payment_link_confirm_sent", "pm_action_prompt_sent"])
    .eq("status", "pending")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)

  if (!pendingPrompts || pendingPrompts.length === 0) {
    return twiml("No pending confirmation found. Log into RentSentry to update tenant records.")
  }

  return handlePmReply(supabase, profile.id, pendingPrompts[0], body)
}
