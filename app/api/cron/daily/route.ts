// Daily cron job — runs every morning at 8am
// Sends card expiry alerts to tenants 7 days before the 1st of the month.
// Escalation (pay-or-quit, CFK, legal) is handled by cron/phase2 which respects
// each landlord's escalation settings. Do NOT add day-threshold escalation here.
// Secure with CRON_SECRET env var

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)


export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization")
  const querySecret = req.nextUrl.searchParams.get("secret")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && querySecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Use service role to bypass RLS — this is a server-only cron
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results = { cardExpiry: 0, errors: 0 }

  // ── Card Expiry Alerts (7 days before 1st of month) ──────────────────────────
  const today = new Date()
  const firstOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const daysUntilFirst = Math.ceil((firstOfNextMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilFirst === 7) {
    const { data: expiringTenants } = await supabase
      .from("tenants")
      .select("id, name, email, user_id, card_expiry")
      .eq("status", "active")
      .not("card_expiry", "is", null)

    for (const tenant of expiringTenants || []) {
      if (!tenant.card_expiry || !tenant.email) continue

      // Check if already sent this month
      const { data: existing } = await supabase
        .from("interventions")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("type", "card_expiry_alert")
        .gte("created_at", new Date(today.getFullYear(), today.getMonth(), 1).toISOString())

      if (existing && existing.length > 0) continue

      try {
        await resend.emails.send({
          from: "RentSentry <noreply@rentsentry.com>",
          to: tenant.email,
          subject: "Action Required: Update Your Payment Method",
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0e1a;color:#f0f1f3;border-radius:12px;">
            <h2 style="margin:0 0 8px;">Hi ${tenant.name},</h2>
            <p style="color:#9ca3af;">Your payment method is expiring soon. Please update it before the 1st to avoid any disruption.</p>
          </div>`,
        })

        await supabase.from("interventions").insert({
          tenant_id: tenant.id,
          user_id: tenant.user_id,
          type: "card_expiry_alert",
          status: "sent",
          sent_at: new Date().toISOString(),
        })

        results.cardExpiry++
      } catch { results.errors++ }
    }
  }

  return NextResponse.json({
    ok: true,
    date: new Date().toISOString(),
    results,
  })
}
