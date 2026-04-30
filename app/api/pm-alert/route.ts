import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import twilio from "twilio"
import { normalizePhone } from "@/lib/phone"

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!

interface DelinquentTenant {
  name: string
  balance_due: number
  days_past_due: number
  rent_amount: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { delinquent }: { delinquent: DelinquentTenant[] } = await req.json()

  // Get PM alert settings
  const { data: profile } = await supabase
    .from("profiles")
    .select("pm_phone, pm_alerts_enabled")
    .eq("id", user.id)
    .single()

  if (!profile?.pm_alerts_enabled || !profile?.pm_phone) {
    return NextResponse.json({ ok: true, skipped: "alerts disabled or no phone" })
  }

  const pmPhone = normalizePhone(profile.pm_phone)
  if (!pmPhone) {
    return NextResponse.json({ ok: true, skipped: "invalid PM phone number" })
  }

  if (!delinquent || delinquent.length === 0) {
    return NextResponse.json({ ok: true, skipped: "no delinquent tenants" })
  }
  const totalOwed = delinquent.reduce((sum, t) => sum + (t.balance_due ?? 0), 0)

  // Split into buckets
  const critical = delinquent.filter(t => t.days_past_due >= 10)
  const late = delinquent.filter(t => t.days_past_due >= 3 && t.days_past_due < 10)
  const newBalance = delinquent.filter(t => t.days_past_due < 3 && t.balance_due > 0)

  const lines: string[] = []

  if (critical.length > 0) {
    const names = critical.slice(0, 2).map(t => `${t.name} ($${t.balance_due.toLocaleString()})`).join(", ")
    const extra = critical.length > 2 ? ` +${critical.length - 2} more` : ""
    lines.push(`⚠️ ${critical.length} critical: ${names}${extra}`)
  }

  if (late.length > 0) {
    const names = late.slice(0, 2).map(t => t.name).join(", ")
    const extra = late.length > 2 ? ` +${late.length - 2} more` : ""
    lines.push(`${late.length} late (3-9d): ${names}${extra}`)
  }

  if (newBalance.length > 0) {
    lines.push(`${newBalance.length} newly overdue`)
  }

  const body = `RentSentry: ${delinquent.length} tenant${delinquent.length > 1 ? "s" : ""} delinquent at upload — $${totalOwed.toLocaleString()} at risk.\n${lines.join("\n")}\nLog in to review.`

  try {
    await twilioClient.messages.create({ from: FROM_NUMBER, to: pmPhone, body })
    return NextResponse.json({ ok: true, sent: true })
  } catch (err: unknown) {
    console.error("PM alert error:", (err as Error)?.message)
    return NextResponse.json({ ok: true, sent: false, error: (err as Error)?.message })
  }
}
