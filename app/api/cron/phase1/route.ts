/**
 * Phase 1 Cron — Predictive, runs BEFORE the 1st
 * Catches problems before a single dollar is missed.
 *
 * Schedule: runs daily at 8am
 * Triggers based on how many days until the 1st of next month:
 *
 *   14 days out → card expiring within 30 days (early warning)
 *    7 days out → card expiring within 7 days (urgent)
 *    7 days out → no payment method on file (urgent)
 *    3 days out → tenants with late history (proactive heads up)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntilNextFirst(): number {
  const now = new Date()
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return Math.ceil((nextFirst.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function cardExpiresWithinDays(expiry: string, days: number): boolean {
  try {
    const [month, year] = expiry.split("/").map(Number)
    if (!month || !year) return false
    const expiryDate = new Date(2000 + year, month - 1, 1)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + days)
    return expiryDate <= cutoff
  } catch { return false }
}

async function alreadySentThisMonth(
  supabase: any,
  tenantId: string,
  type: string
): Promise<boolean> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data } = await supabase
    .from("interventions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .gte("sent_at", monthStart)
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function sendAndLog(
  supabase: any,
  tenant: { id: string; user_id: string; name: string; email: string },
  type: string,
  subject: string,
  body: string,
  note: string
): Promise<boolean> {
  try {
    if (tenant.email) {
      await resend.emails.send({
        from: "RentSentry <onboarding@resend.dev>",
        to: tenant.email,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:36px 28px;background:#0a0e1a;color:#f0f1f3;border-radius:14px;">
            <p style="font-size:13px;color:#4b5563;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">RentSentry</p>
            <h2 style="margin:0 0 12px;font-size:20px;">${subject}</h2>
            <p style="color:#9ca3af;line-height:1.6;margin:0 0 20px;">${body}</p>
            <p style="color:#4b5563;font-size:12px;margin:0;">If you have any questions, please contact your property manager directly.</p>
          </div>`,
      })
    }

    await supabase.from("interventions").insert({
      tenant_id: tenant.id,
      user_id: tenant.user_id,
      type,
      status: "sent",
      sent_at: new Date().toISOString(),
      notes: note,
    })

    return true
  } catch {
    return false
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const days = daysUntilNextFirst()
  const results = {
    days_until_first: days,
    card_expiry_30: 0,
    card_expiry_7: 0,
    no_payment_method: 0,
    proactive_reminder: 0,
    skipped_already_sent: 0,
    errors: 0,
  }

  // Fetch all active tenants with the fields we need
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name, email, user_id, card_expiry, payment_method, days_late_avg, late_payment_count, rent_amount")
    .eq("status", "active")

  if (error || !tenants) {
    return NextResponse.json({ error: "Failed to fetch tenants", detail: error?.message }, { status: 500 })
  }

  // ── 14 days out: card expiring within 30 days (early warning) ─────────────
  if (days === 14) {
    for (const t of tenants) {
      if (!t.card_expiry) continue
      if (!cardExpiresWithinDays(t.card_expiry, 30)) continue
      if (cardExpiresWithinDays(t.card_expiry, 7)) continue  // save for 7-day alert

      if (await alreadySentThisMonth(supabase, t.id, "card_expiry_30")) {
        results.skipped_already_sent++
        continue
      }

      const sent = await sendAndLog(
        supabase, t,
        "card_expiry_30",
        "Heads up — your payment card expires soon",
        `Hi ${t.name},<br><br>Your card on file (expiring ${t.card_expiry}) will expire before your next rent payment is due. Please update your payment method to avoid any interruption on the 1st.`,
        "Phase 1 — 14 days out, card expiring within 30 days"
      )
      sent ? results.card_expiry_30++ : results.errors++
    }
  }

  // ── 7 days out: card expiring within 7 days + no payment method ───────────
  if (days === 7) {
    for (const t of tenants) {
      // Card expiring within 7 days
      if (t.card_expiry && cardExpiresWithinDays(t.card_expiry, 7)) {
        if (await alreadySentThisMonth(supabase, t.id, "card_expiry_7")) {
          results.skipped_already_sent++
        } else {
          const sent = await sendAndLog(
            supabase, t,
            "card_expiry_7",
            "Urgent — your payment card expires in 7 days",
            `Hi ${t.name},<br><br>Your card on file (expiring ${t.card_expiry}) expires in less than 7 days. Rent is due on the 1st. Please update your payment method <strong>today</strong> to avoid a failed payment.`,
            "Phase 1 — 7 days out, card expiring within 7 days"
          )
          sent ? results.card_expiry_7++ : results.errors++
        }
      }

      // No payment method on file
      const noMethod = !t.payment_method || t.payment_method === "unknown"
      if (noMethod) {
        if (await alreadySentThisMonth(supabase, t.id, "no_payment_method")) {
          results.skipped_already_sent++
        } else {
          const sent = await sendAndLog(
            supabase, t,
            "no_payment_method",
            "No payment method on file — rent due in 7 days",
            `Hi ${t.name},<br><br>We don't have a payment method on file for your account and rent is due in 7 days. Please contact your property manager to add your card or bank account information as soon as possible.`,
            "Phase 1 — 7 days out, no payment method on file"
          )
          sent ? results.no_payment_method++ : results.errors++
        }
      }
    }
  }

  // ── 3 days out: proactive reminder for tenants with late history ──────────
  if (days === 3) {
    for (const t of tenants) {
      const hasHistory = (t.late_payment_count ?? 0) >= 2 || (t.days_late_avg ?? 0) >= 3
      if (!hasHistory) continue

      if (await alreadySentThisMonth(supabase, t.id, "proactive_reminder")) {
        results.skipped_already_sent++
        continue
      }

      const sent = await sendAndLog(
        supabase, t,
        "proactive_reminder",
        "Friendly reminder — rent is due in 3 days",
        `Hi ${t.name},<br><br>Just a friendly heads up that rent is due on the 1st — 3 days from now. If you're expecting any difficulty this month, reach out to your property manager now. Flexible options are available and it's always better to communicate early.`,
        "Phase 1 — 3 days out, tenant has late payment history"
      )
      sent ? results.proactive_reminder++ : results.errors++
    }
  }

  // ── Summary email to each property manager ─────────────────────────────────
  const totalSent = results.card_expiry_30 + results.card_expiry_7 + results.no_payment_method + results.proactive_reminder

  if (totalSent > 0) {
    // Group by user_id to send one summary per PM
    const userIds = [...new Set(tenants.map(t => t.user_id))]

    for (const userId of userIds) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(userId)
        const pmEmail = userData?.user?.email
        if (!pmEmail) continue

        await resend.emails.send({
          from: "RentSentry <onboarding@resend.dev>",
          to: pmEmail,
          subject: `RentSentry — Phase 1 ran today (${totalSent} alert${totalSent !== 1 ? "s" : ""} sent)`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:36px 28px;background:#0a0e1a;color:#f0f1f3;border-radius:14px;">
              <p style="font-size:13px;color:#4b5563;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">RentSentry · Phase 1 Summary</p>
              <h2 style="margin:0 0 16px;font-size:20px;">Proactive alerts sent this morning</h2>
              <table style="width:100%;border-collapse:collapse;">
                ${results.card_expiry_30 > 0 ? `<tr><td style="padding:8px 0;color:#9ca3af;border-bottom:1px solid #1f2937;">30-day card expiry warnings</td><td style="padding:8px 0;text-align:right;color:#f0f1f3;font-weight:700;border-bottom:1px solid #1f2937;">${results.card_expiry_30}</td></tr>` : ""}
                ${results.card_expiry_7 > 0 ? `<tr><td style="padding:8px 0;color:#9ca3af;border-bottom:1px solid #1f2937;">Urgent 7-day card expiry alerts</td><td style="padding:8px 0;text-align:right;color:#fbbf24;font-weight:700;border-bottom:1px solid #1f2937;">${results.card_expiry_7}</td></tr>` : ""}
                ${results.no_payment_method > 0 ? `<tr><td style="padding:8px 0;color:#9ca3af;border-bottom:1px solid #1f2937;">No payment method alerts</td><td style="padding:8px 0;text-align:right;color:#f87171;font-weight:700;border-bottom:1px solid #1f2937;">${results.no_payment_method}</td></tr>` : ""}
                ${results.proactive_reminder > 0 ? `<tr><td style="padding:8px 0;color:#9ca3af;">Proactive reminders (late history)</td><td style="padding:8px 0;text-align:right;color:#60a5fa;font-weight:700;">${results.proactive_reminder}</td></tr>` : ""}
              </table>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;margin-top:24px;background:#60a5fa;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">View Dashboard →</a>
            </div>`,
        })
      } catch { /* don't fail the whole job if summary email fails */ }
    }
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    days_until_first: days,
    results,
  })
}
