// Daily cron job — runs every morning at 8am
// Triggers Day 5 (Cash for Keys) and Day 10 (Legal Packet) interventions automatically
// Call this via Vercel Cron or an external scheduler (e.g. cron-job.org)
// Secure with CRON_SECRET env var

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

function daysSince(dateStr: string): number {
  const date = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Use service role to bypass RLS — this is a server-only cron
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results = { day5: 0, day10: 0, cardExpiry: 0, errors: 0 }

  // ── Card Expiry Alerts (7 days before 1st of month) ──────────────────────────
  const today = new Date()
  const daysUntilFirst = new Date(today.getFullYear(), today.getMonth() + 1, 1).getDate() - today.getDate()

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

  // ── Delinquent tenants: Day 5 and Day 10 logic ───────────────────────────────
  const { data: delinquentTenants } = await supabase
    .from("tenants")
    .select("id, name, email, user_id, balance_due, last_payment_date, rent_amount")
    .eq("status", "active")
    .gt("balance_due", 0)
    .not("last_payment_date", "is", null)

  for (const tenant of delinquentTenants || []) {
    if (!tenant.last_payment_date) continue
    const days = daysSince(tenant.last_payment_date)

    // Day 5 — Cash for Keys offer
    if (days >= 5 && days < 10) {
      const { data: existing } = await supabase
        .from("interventions")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("type", "cash_for_keys")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())

      if (existing && existing.length > 0) continue

      try {
        if (tenant.email) {
          await resend.emails.send({
            from: "RentSentry <noreply@rentsentry.com>",
            to: tenant.email,
            subject: "A Fresh Start Offer — Time Sensitive",
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0e1a;color:#f0f1f3;border-radius:12px;">
              <h2 style="margin:0 0 8px;">Hi ${tenant.name},</h2>
              <p style="color:#9ca3af;">Your property manager has authorized a Fresh Start offer. You may be eligible for a cash assistance payment in exchange for vacating by an agreed date. This offer is available for the next 5 days. Please contact your property manager to discuss.</p>
            </div>`,
          })
        }

        await supabase.from("interventions").insert({
          tenant_id: tenant.id,
          user_id: tenant.user_id,
          type: "cash_for_keys",
          status: "sent",
          sent_at: new Date().toISOString(),
          notes: `Auto-triggered Day ${days}`,
        })

        results.day5++
      } catch { results.errors++ }
    }

    // Day 10 — Mark for legal, notify property manager
    if (days >= 10) {
      const { data: existing } = await supabase
        .from("interventions")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("type", "legal_packet")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())

      if (existing && existing.length > 0) continue

      try {
        // Get property manager email
        const { data: userData } = await supabase.auth.admin.getUserById(tenant.user_id)
        const managerEmail = userData?.user?.email

        if (managerEmail) {
          await resend.emails.send({
            from: "RentSentry <noreply@rentsentry.com>",
            to: managerEmail,
            subject: `Action Required: ${tenant.name} — Day 10 Delinquency`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0e1a;color:#f0f1f3;border-radius:12px;">
              <h2 style="margin:0 0 8px;">Day 10 Alert</h2>
              <p style="color:#9ca3af;"><strong style="color:#f0f1f3;">${tenant.name}</strong> has been delinquent for ${days} days with a balance of <strong style="color:#f87171;">$${tenant.balance_due.toLocaleString()}</strong>.</p>
              <p style="color:#9ca3af;margin-top:12px;">Log in to RentSentry to generate your court-ready legal packet and initiate proceedings.</p>
              <a href="https://rentsentry.com/dashboard/tenants" style="display:inline-block;margin-top:20px;background:#60a5fa;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;">View in RentSentry →</a>
            </div>`,
          })
        }

        await supabase.from("interventions").insert({
          tenant_id: tenant.id,
          user_id: tenant.user_id,
          type: "legal_packet",
          status: "pending",
          notes: `Auto-triggered Day ${days} — awaiting manager action`,
        })

        // Update tenant status to offboarding
        await supabase
          .from("tenants")
          .update({ status: "offboarding" })
          .eq("id", tenant.id)

        results.day10++
      } catch { results.errors++ }
    }
  }

  return NextResponse.json({
    ok: true,
    date: new Date().toISOString(),
    results,
  })
}
