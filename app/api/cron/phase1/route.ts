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
import { sendTenantSms } from "@/lib/sms"
import { normalizePhone } from "@/lib/phone"

import { RESEND_FROM } from "@/lib/resend-from"

const resend = new Resend(process.env.RESEND_API_KEY)

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntilNextDue(rentDueDay: number): number {
  const now = new Date()
  const dueDay = Math.min(28, Math.max(1, rentDueDay))
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
  const nextDue = thisMonth > now
    ? thisMonth
    : new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
  return Math.ceil((nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
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
  tenant: { id: string; user_id: string; name: string; email: string | null; phone?: string | null },
  type: string,
  subject: string,
  body: string,
  note: string,
  smsBody?: string | null
): Promise<boolean> {
  try {
    if (tenant.email) {
      await resend.emails.send({
        from: RESEND_FROM,
        to: tenant.email,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:36px 28px;background:#0a0e1a;color:#f0f1f3;border-radius:14px;">
            <p style="font-size:13px;color:#4b5563;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">RentSentry</p>
            <h2 style="margin:0 0 12px;font-size:20px;">${subject}</h2>
            <p style="color:#9ca3af;line-height:1.6;margin:0 0 20px;">${body}</p>
          </div>`,
      })
    }

    if (smsBody) {
      const phone = normalizePhone(tenant.phone ?? null)
      if (phone) await sendTenantSms(supabase, tenant.id, phone, smsBody)
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
  } catch (e) {
    console.error(`phase1 sendAndLog failed — tenant ${tenant.id} type ${type}:`, e)
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

  const results = {
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
    .select("id, name, email, phone, user_id, card_expiry, payment_method, days_late_avg, late_payment_count, rent_amount, rent_due_day")
    .eq("status", "active")

  if (error || !tenants) {
    return NextResponse.json({ error: "Failed to fetch tenants", detail: error?.message }, { status: 500 })
  }

  for (const t of tenants) {
    const days = daysUntilNextDue(t.rent_due_day ?? 1)
    const firstName = t.name.split(" ")[0]

    // ── 14 days out: card expiring within 30 days (early warning) ───────────
    if (days === 14 && t.card_expiry && cardExpiresWithinDays(t.card_expiry, 30) && !cardExpiresWithinDays(t.card_expiry, 7)) {
      if (await alreadySentThisMonth(supabase, t.id, "card_expiry_30")) {
        results.skipped_already_sent++
      } else {
        const sent = await sendAndLog(
          supabase, t,
          "card_expiry_30",
          "Heads up — your payment card expires soon",
          `Hi ${firstName},<br><br>Your card on file (expiring ${t.card_expiry}) will expire before your next rent payment is due. Please update your payment method to avoid any interruption.`,
          "Phase 1 — 14 days out, card expiring within 30 days",
          `Hi ${firstName}, your payment card on file expires soon. Update it before rent is due to avoid issues. Reply STOP to opt out.`
        )
        sent ? results.card_expiry_30++ : results.errors++
      }
    }

    // ── 7 days out: card expiring within 7 days + no payment method ─────────
    if (days === 7) {
      if (t.card_expiry && cardExpiresWithinDays(t.card_expiry, 7)) {
        if (await alreadySentThisMonth(supabase, t.id, "card_expiry_7")) {
          results.skipped_already_sent++
        } else {
          const sent = await sendAndLog(
            supabase, t,
            "card_expiry_7",
            "Urgent — your payment card expires in 7 days",
            `Hi ${firstName},<br><br>Your card on file (expiring ${t.card_expiry}) expires in less than 7 days. Rent is due soon. Please update your payment method <strong>today</strong> to avoid a failed payment.`,
            "Phase 1 — 7 days out, card expiring within 7 days",
            `Hi ${firstName}, urgent — your payment card expires in 7 days and rent is due soon. Update it today. Reply STOP to opt out.`
          )
          sent ? results.card_expiry_7++ : results.errors++
        }
      }

      const noMethod = !t.payment_method || t.payment_method === "unknown"
      if (noMethod) {
        if (await alreadySentThisMonth(supabase, t.id, "no_payment_method")) {
          results.skipped_already_sent++
        } else {
          const sent = await sendAndLog(
            supabase, t,
            "no_payment_method",
            "No payment method on file — rent due in 7 days",
            `Hi ${firstName},<br><br>No payment method is on file for your account and rent is due in 7 days. Please add one as soon as possible to avoid any issues.`,
            "Phase 1 — 7 days out, no payment method on file",
            `Hi ${firstName}, no payment method is on file and rent is due in 7 days. Reply to this message for help. Reply STOP to opt out.`
          )
          sent ? results.no_payment_method++ : results.errors++
        }
      }
    }

    // ── 3 days out: proactive reminder for tenants with late history ─────────
    if (days === 3) {
      const hasHistory = (t.late_payment_count ?? 0) >= 2 || (t.days_late_avg ?? 0) >= 3
      if (hasHistory) {
        if (await alreadySentThisMonth(supabase, t.id, "proactive_reminder")) {
          results.skipped_already_sent++
        } else {
          const sent = await sendAndLog(
            supabase, t,
            "proactive_reminder",
            "Friendly reminder — rent is due in 3 days",
            `Hi ${firstName},<br><br>Just a friendly heads up that rent is due in 3 days. If you're expecting any difficulty this month, please reach out as soon as possible — flexible options may be available.`,
            "Phase 1 — 3 days out, tenant has late payment history",
            `Hi ${firstName}, rent is due in 3 days. Reply to this message if you expect any issues this month — options are available. Reply STOP to opt out.`
          )
          sent ? results.proactive_reminder++ : results.errors++
        }
      }
    }
  }

  // ── Summary email to each property manager ─────────────────────────────────
  const totalSent = results.card_expiry_30 + results.card_expiry_7 + results.no_payment_method + results.proactive_reminder

  if (totalSent > 0) {
    const summaryUserIds = [...new Set(tenants.map(t => t.user_id))]

    for (const userId of summaryUserIds) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(userId)
        const pmEmail = userData?.user?.email
        if (!pmEmail) continue

        await resend.emails.send({
          from: RESEND_FROM,
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
      } catch (e) { console.error(`phase1 summary email failed for user ${userId}:`, e) }
    }
  }

  // ── Stale data nudge — email PM if no CSV uploaded in 7+ days ────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const allUserIds = [...new Set(tenants.map(t => t.user_id))]

  for (const userId of allUserIds) {
    try {
      // Find the most recently created tenant for this user
      const { data: latestTenant } = await supabase
        .from("tenants")
        .select("created_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      if (!latestTenant) continue
      if (latestTenant.created_at > sevenDaysAgo) continue  // fresh data, skip

      // Check we haven't already sent a stale nudge in the last 7 days
      const { data: recentNudge } = await supabase
        .from("interventions")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "stale_data_nudge")
        .gte("sent_at", sevenDaysAgo)
        .limit(1)

      if (recentNudge && recentNudge.length > 0) continue

      const { data: userData } = await supabase.auth.admin.getUserById(userId)
      const pmEmail = userData?.user?.email
      if (!pmEmail) continue

      const daysSince = Math.floor((Date.now() - new Date(latestTenant.created_at).getTime()) / (1000 * 60 * 60 * 24))

      await resend.emails.send({
        from: RESEND_FROM,
        to: pmEmail,
        subject: `Your RentSentry data is ${daysSince} days old`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:36px 28px;background:#0a0e1a;color:#f0f1f3;border-radius:14px;">
            <p style="font-size:13px;color:#4b5563;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">RentSentry · Data Freshness</p>
            <h2 style="margin:0 0 12px;font-size:20px;">Your rent roll is ${daysSince} days old</h2>
            <p style="color:#9ca3af;line-height:1.6;margin:0 0 20px;">RentSentry may be sending SMS reminders to tenants who have already paid. Upload a new CSV from your property management software to keep outreach accurate.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/upload" style="display:inline-block;background:#60a5fa;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Upload Now →</a>
          </div>`,
      })

      // Log so we don't send again this week
      await supabase.from("interventions").insert({
        user_id: userId,
        tenant_id: latestTenant ? null : null,
        type: "stale_data_nudge",
        status: "sent",
        sent_at: new Date().toISOString(),
        notes: `Data ${daysSince} days old — nudge sent to PM`,
      })
    } catch (e) { console.error(`phase1 stale-data nudge failed for user ${userId}:`, e) }
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    results,
  })
}
