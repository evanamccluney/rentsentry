/**
 * Phase 2 Cron — Recovery, runs AFTER the 1st
 * Does NOT auto-email tenants. Alerts the property manager with context
 * and decision support so they choose what action to take.
 *
 * Philosophy:
 *   - Never auto-send legal notices (one defective notice = entire case dismissed)
 *   - Every PM has a different tolerance — respect their escalation style
 *   - Surface the right info at the right time, let the PM decide
 *
 * Schedule: runs daily at 9am (1 hour after Phase 1)
 *
 * Escalation styles:
 *   aggressive → alert on days 1, 3, 7, 15, 30
 *   moderate   → alert on days 1, 5, 10, 20, 35   (default)
 *   lenient    → alert on days 1, 10, 20, 45
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import twilio from "twilio"
import { profileToEscalationRules } from "@/lib/escalation-rules"
import { evictionWeeks } from "@/lib/state-rules"
import { sendAttorneyHandoff } from "@/lib/email"
import { normalizePhone } from "@/lib/phone"
import { sendTenantSms } from "@/lib/sms"
import { generateSmsDraft, autoActionType, fallbackSms } from "@/lib/generate-sms-draft"
import { inferDaysPastDueFromRentCycle } from "@/lib/delinquency"

import { RESEND_FROM } from "@/lib/resend-from"

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!

// ── Config ─────────────────────────────────────────────────────────────────────

const ALERT_DAYS: Record<string, number[]> = {
  aggressive: [1, 3, 7, 15, 30],
  moderate:   [1, 5, 10, 20, 35],
  lenient:    [1, 10, 20, 45],
}

// What to tell the PM at each day threshold
const DAY_CONTEXT: Record<number, { label: string; suggestion: string; color: string; urgency: string }> = {
  1:  { label: "Day 1 — Rent not received",             suggestion: "Send a friendly reminder email",                   color: "#9ca3af", urgency: "low" },
  3:  { label: "Day 3 — Still unpaid",                  suggestion: "Follow up directly — call or text the tenant",     color: "#fbbf24", urgency: "medium" },
  5:  { label: "Day 5 — Past grace period",             suggestion: "Send a reminder — late fee may apply",             color: "#fbbf24", urgency: "medium" },
  7:  { label: "Day 7 — One week late",                 suggestion: "Offer a payment plan to get partial payment now",  color: "#f97316", urgency: "medium" },
  10: { label: "Day 10 — Decision point",               suggestion: "Payment plan or cash for keys — see cost comparison below", color: "#f97316", urgency: "high" },
  15: { label: "Day 15 — Escalation warranted",         suggestion: "Draft a formal notice for your review (no auto-send)", color: "#f87171", urgency: "high" },
  20: { label: "Day 20 — Formal notice window",         suggestion: "Review Pay or Quit notice — consult your attorney before sending", color: "#ef4444", urgency: "critical" },
  30: { label: "Day 30 — Attorney recommended",         suggestion: "Consult your attorney about filing Unlawful Detainer", color: "#dc2626", urgency: "critical" },
  35: { label: "Day 35 — UD filing window",             suggestion: "File Unlawful Detainer with your attorney (Day 35+ in most states)", color: "#dc2626", urgency: "critical" },
  45: { label: "Day 45 — Extended delinquency",         suggestion: "Last chance: cash for keys offer or UD filing", color: "#dc2626", urgency: "critical" },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysPastDue(lastPaymentDate?: string | null, rentDueDay = 1, delinquencyStartDate?: string | null): number {
  if (delinquencyStartDate) {
    const start = new Date(delinquencyStartDate)
    if (!isNaN(start.getTime())) {
      return Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)))
    }
  }
  if (!lastPaymentDate) return inferDaysPastDueFromRentCycle(rentDueDay)
  const last = new Date(lastPaymentDate)
  const now = new Date()
  const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
  let rentDueThisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (rentDueThisMonth > now) {
    rentDueThisMonth = new Date(now.getFullYear(), now.getMonth() - 1, dueDay)
  }
  if (last < rentDueThisMonth) {
    return Math.floor((now.getTime() - rentDueThisMonth.getTime()) / (1000 * 60 * 60 * 24))
  }
  return 0
}

function getAlertTier(days: number, style: string): number | null {
  const triggers = ALERT_DAYS[style] ?? ALERT_DAYS.moderate
  const reached = triggers.filter(d => days >= d)
  return reached.length > 0 ? Math.max(...reached) : null
}

function getAlertTierFromRules(days: number, profile: Record<string, unknown> | null): number | null {
  const rules = profileToEscalationRules(profile)
  const triggers = [
    rules.reminderDay,
    rules.paymentPlanDay,
    rules.payOrQuitDay,
    rules.cfkReviewDay,
    rules.attorneyReviewDay,
  ].filter((day, index, arr) => day > 0 && arr.indexOf(day) === index)
  const reached = triggers.filter(day => days >= day)
  return reached.length > 0 ? Math.max(...reached) : null
}

function contextForTier(tier: number): typeof DAY_CONTEXT[number] {
  return DAY_CONTEXT[tier] ?? (
    tier >= 30 ? DAY_CONTEXT[30] :
    tier >= 20 ? DAY_CONTEXT[20] :
    tier >= 10 ? DAY_CONTEXT[10] :
    tier >= 5 ? DAY_CONTEXT[5] :
    DAY_CONTEXT[1]
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function alreadySentThisMonth(supabase: any, tenantId: string, type: string): Promise<boolean> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data } = await supabase.from("interventions").select("id")
    .eq("tenant_id", tenantId).eq("type", type).gte("sent_at", monthStart).limit(1)
  return (data?.length ?? 0) > 0
}

function isWithinTenantBaseline(
  days: number,
  daysLateAvg: number,
  latePaymentCount: number,
  tier: number,
  payOrQuitDay: number
): boolean {
  if (tier >= payOrQuitDay) return false  // never suppress critical tiers
  if (latePaymentCount < 3 || daysLateAvg < 3) return false  // not enough history to establish a baseline
  return days <= daysLateAvg + 3  // within their typical late range + 3-day tolerance
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function alreadyAlertedForTier(supabase: any, tenantId: string, tier: number): Promise<boolean> {
  const type = `pm_alert_day${tier}`
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data } = await supabase.from("interventions").select("id")
    .eq("tenant_id", tenantId).eq("type", type).gte("sent_at", monthStart).limit(1)
  return (data?.length ?? 0) > 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function alreadySentOverdueWarning(supabase: any, tenantId: string): Promise<boolean> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data } = await supabase.from("interventions").select("id")
    .eq("tenant_id", tenantId).eq("type", "overdue_warning").gte("sent_at", monthStart).limit(1)
  return (data?.length ?? 0) > 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function alreadySentAttorneyHandoff(supabase: any, tenantId: string): Promise<boolean> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 60)
  const { data } = await supabase.from("interventions").select("id")
    .eq("tenant_id", tenantId).eq("type", "attorney_handoff").gte("sent_at", cutoff.toISOString()).limit(1)
  return (data?.length ?? 0) > 0
}

// ── Main ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name, unit, email, phone, user_id, balance_due, rent_amount, rent_due_day, last_payment_date, delinquency_start_date, intake_status, intake_action, auto_contact_approved, days_late_avg, late_payment_count, previous_delinquency, sms_opted_out, properties(name, address, state)")
    .eq("status", "active")
    .gt("balance_due", 0)
    .or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`)

  if (error || !tenants) {
    return NextResponse.json({ error: "Failed to fetch tenants", detail: error?.message }, { status: 500 })
  }

  const delinquent = tenants.filter(t => daysPastDue(t.last_payment_date, t.rent_due_day ?? 1, t.delinquency_start_date) > 0)

  // ── Day 0 reminders — fires on the actual due date if balance still owed ──────
  const profileCache: Record<string, { auto_mode: boolean; late_fee_day: number } | null> = {}
  const dueToday = tenants.filter(t => {
    const manualIntakeHold = t.intake_action === "manual_review" || t.intake_action === "no_contact"
    return (!manualIntakeHold || (t.auto_contact_approved ?? true)) && daysPastDue(t.last_payment_date, t.rent_due_day ?? 1, t.delinquency_start_date) === 0
  })

  for (const t of dueToday) {
    if (!t.phone || t.sms_opted_out) continue
    if (!(t.user_id in profileCache)) {
      const { data: p } = await supabase.from("profiles").select("auto_mode, late_fee_day").eq("id", t.user_id).single()
      profileCache[t.user_id] = p ? { auto_mode: p.auto_mode ?? false, late_fee_day: p.late_fee_day ?? 5 } : null
    }
    const pCache = profileCache[t.user_id]
    if (!pCache?.auto_mode) continue
    const alreadySent = await alreadySentThisMonth(supabase, t.id, "day0_reminder")
    if (alreadySent) continue
    const phone = normalizePhone(t.phone)
    if (!phone) continue
    const firstName = t.name.split(" ")[0]
    const lateFeeDay = pCache.late_fee_day
    const feeWarning = lateFeeDay > 0 ? ` Late fees apply after Day ${lateFeeDay}.` : ""
    const body = `Hi ${firstName}, your rent of $${(t.rent_amount ?? 0).toLocaleString()} is due today.${feeWarning} Reply to pay or with any questions. Reply STOP to opt out.`
    const sent = await sendTenantSms(supabase, t.id, phone, body)
    if (sent) {
      await supabase.from("interventions").insert({
        tenant_id: t.id,
        user_id: t.user_id,
        type: "day0_reminder",
        status: "sent",
        sent_at: new Date().toISOString(),
        notes: `Rent due today — $${t.rent_amount ?? 0} monthly, $${t.balance_due ?? 0} balance`,
      })
    }
  }

  if (delinquent.length === 0) {
    return NextResponse.json({ ok: true, message: "No delinquent tenants today", alerts_sent: 0 })
  }

  const byUser: Record<string, typeof delinquent> = {}
  for (const t of delinquent) {
    if (!byUser[t.user_id]) byUser[t.user_id] = []
    byUser[t.user_id].push(t)
  }

  let totalAlerts = 0
  let totalEmails = 0
  let totalTenantSms = 0
  let totalAttorneyEmails = 0

  for (const [userId, userTenants] of Object.entries(byUser)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select(`
        escalation_style, escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day,
        cfk_review_day, attorney_review_day, repeat_offender_accelerator_days,
        pre_due_risk_outreach_enabled, pre_due_risk_review_days_before_due,
        require_attorney_before_notice, payment_plan_before_notice, custom_escalation_notes,
        auto_mode, pm_display_name, attorney_name, attorney_email, pm_alert_triggers,
        late_fee_day, late_fee_percent, pm_phone
      `)
      .eq("id", userId)
      .single()

    const style = profile?.escalation_style ?? "moderate"
    const autoMode = profile?.auto_mode ?? false
    const escalationRules = profileToEscalationRules(profile)
    // Default to all triggers enabled if the field is null/missing (backward compat)
    const pmTriggers: string[] = Array.isArray(profile?.pm_alert_triggers)
      ? profile.pm_alert_triggers
      : ["pay_or_quit", "legal", "installment_missed", "autopay_declined"]

    function alertPassesTriggerFilter(tierDay: number): boolean {
      if (tierDay >= escalationRules.attorneyReviewDay) return pmTriggers.includes("legal")
      if (tierDay >= escalationRules.payOrQuitDay)     return pmTriggers.includes("pay_or_quit")
      return true // early-stage monitoring alerts always go through
    }

    const { data: userData } = await supabase.auth.admin.getUserById(userId)
    const pmEmail = userData?.user?.email
    if (!pmEmail) continue

    const pmPhone = profile?.pm_phone ? normalizePhone(profile.pm_phone) : null

    const alertItems: Array<{
      tenant: typeof delinquent[0]
      days: number
      tier: number
      context: typeof DAY_CONTEXT[number]
      autoSmsSent: boolean
    }> = []

    for (const t of userTenants) {
      const days = daysPastDue(t.last_payment_date, t.rent_due_day ?? 1, t.delinquency_start_date)
      const manualIntakeHold = t.intake_action === "manual_review" || t.intake_action === "no_contact"
      if (manualIntakeHold && t.auto_contact_approved === false) {
        const { data: existingReview } = await supabase
          .from("interventions")
          .select("id")
          .eq("tenant_id", t.id)
          .eq("type", "intake_review_required")
          .gte("sent_at", new Date(Date.now() - 30 * 86400000).toISOString())
          .limit(1)
        if ((existingReview?.length ?? 0) === 0) {
          await supabase.from("interventions").insert({
            tenant_id: t.id,
            user_id: userId,
            type: "intake_review_required",
            status: "pending",
            sent_at: new Date().toISOString(),
            notes: `Existing balance requires PM review before tenant contact - ${days} days past due`,
            snapshot: {
              tenant_id: t.id,
              tenant_name: t.name,
              balance_due: t.balance_due ?? 0,
              days_past_due: days,
              intake_status: t.intake_status ?? "needs_review",
            },
          })
        }
        continue
      }
      const tier = profile?.escalation_preset ? getAlertTierFromRules(days, profile) : getAlertTier(days, style)
      if (!tier) continue

      const alreadySent = await alreadyAlertedForTier(supabase, t.id, tier)
      const withinBaseline = isWithinTenantBaseline(days, t.days_late_avg ?? 0, t.late_payment_count ?? 0, tier, escalationRules.payOrQuitDay)
      if (!alreadySent && alertPassesTriggerFilter(tier) && !withinBaseline) {
        const context = contextForTier(tier)

        // Auto-send SMS to tenant for early reminder tiers (before pay-or-quit threshold)
        // Escalation actions (pay or quit, legal) always require PM approval
        let autoSmsSent = false
        const isEarlyTier = tier < escalationRules.payOrQuitDay
        if (autoMode && isEarlyTier && t.phone && !t.sms_opted_out) {
          const phone = normalizePhone(t.phone)
          if (phone) {
            // Pick action type based on tenant's actual risk profile
            const actionType = autoActionType(
              days,
              t.late_payment_count ?? 0,
              t.days_late_avg ?? 0,
              t.previous_delinquency ?? false,
              escalationRules.paymentPlanDay
            )

            // Fetch latest situation context logged by landlord
            const { data: intakeRows } = await supabase
              .from("interventions")
              .select("notes")
              .eq("tenant_id", t.id)
              .eq("type", "situation_intake")
              .order("sent_at", { ascending: false })
              .limit(1)
            const situationNotes = intakeRows?.[0]?.notes ?? null

            // Generate AI-personalized message, fall back to static if AI fails
            const aiBody = await generateSmsDraft(actionType, {
              name: t.name,
              balance_due: t.balance_due ?? 0,
              rent_amount: t.rent_amount ?? 0,
              days_past_due: days,
              days_late_avg: t.days_late_avg ?? 0,
              late_payment_count: t.late_payment_count ?? 0,
              previous_delinquency: t.previous_delinquency ?? false,
            }, situationNotes)
            const lateFeeDay = profile?.late_fee_day ?? 5
            const body = aiBody ?? fallbackSms(actionType, t.name, days, t.balance_due ?? 0, lateFeeDay)

            const sent = await sendTenantSms(supabase, t.id, phone, body)
            if (sent) {
              await supabase.from("interventions").insert({
                tenant_id: t.id,
                user_id: userId,
                type: `auto_reminder_day${tier}`,
                status: "sent",
                sent_at: new Date().toISOString(),
                notes: `Auto ${actionType} SMS — Day ${tier} tier, ${days} days past due`,
              })
              autoSmsSent = true
              totalTenantSms++
            }
          }
        }

        alertItems.push({ tenant: t, days, tier, context, autoSmsSent })

        await supabase.from("interventions").insert({
          tenant_id: t.id,
          user_id: userId,
          type: `pm_alert_day${tier}`,
          status: "sent",
          sent_at: new Date().toISOString(),
          notes: `Phase 2 PM alert — Day ${tier} tier, ${days} actual days past due`,
        })
        totalAlerts++
      }

      // Tenant overdue warning SMS — fires at paymentPlanDay threshold, once per month
      if (autoMode && days >= escalationRules.paymentPlanDay && t.phone && !t.sms_opted_out) {
        const warned = await alreadySentOverdueWarning(supabase, t.id)
        if (!warned) {
          const phone = normalizePhone(t.phone)
          if (phone) {
            try {
              const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
              const body = `Hi ${t.name.split(" ")[0]}, your rent is ${days} days past due — $${(t.balance_due ?? 0).toLocaleString()} owed. Reply to this message to arrange payment or set up a plan. Reply STOP to opt out.`
              await twilioClient.messages.create({ from: FROM_NUMBER, to: phone, body })
              await supabase.from("interventions").insert({
                tenant_id: t.id,
                user_id: userId,
                type: "overdue_warning",
                status: "sent",
                sent_at: new Date().toISOString(),
                notes: `Overdue warning SMS — ${days} days past due, $${t.balance_due} balance`,
              })
              totalTenantSms++
            } catch (e) { console.error(`phase2 overdue-warning SMS failed — tenant ${t.id}:`, e) }
          }
        }
      }

      // ── Contact check SMS to PM — CFK/eviction territory, 7+ days no logged action
      if (autoMode && days >= escalationRules.cfkReviewDay) {
        const ratio = (t.rent_amount ?? 0) > 0 ? (t.balance_due ?? 0) / (t.rent_amount ?? 1) : 0
        if (ratio >= 1) {
          const pmPhone = profile?.pm_phone ? normalizePhone(profile.pm_phone) : null
          if (pmPhone) {
            const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
            const { data: lastAction } = await supabase
              .from("interventions").select("sent_at")
              .eq("tenant_id", t.id).order("sent_at", { ascending: false }).limit(1).single()
            const daysSinceAction = lastAction
              ? (Date.now() - new Date(lastAction.sent_at).getTime()) / 86400000
              : Infinity
            if (daysSinceAction >= 7) {
              const { data: recentCheck } = await supabase
                .from("interventions").select("id")
                .eq("tenant_id", t.id).eq("type", "pm_contact_check_sent")
                .gte("sent_at", sevenDaysAgo).limit(1)
              if ((recentCheck?.length ?? 0) === 0) {
                try {
                  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
                  const daysSinceInt = Math.floor(daysSinceAction)
                  const nextStep = days >= 30 ? "consult your attorney"
                    : days >= 20 ? "serve a Pay or Quit notice"
                    : days >= 10 ? "review Cash for Keys vs eviction"
                    : days >= 5  ? "offer a payment plan"
                    : "send a follow-up reminder"
                  await twilioClient.messages.create({
                    from: FROM_NUMBER,
                    to: pmPhone,
                    body: `RentSentry: ${t.name} (Unit ${t.unit}) — $${(t.balance_due ?? 0).toLocaleString()} outstanding, ${days} days past due, no logged contact in ${daysSinceInt} days. Suggested next step: ${nextStep}. Have you been in touch? Reply YES, NO, or SNOOZE.`,
                  })
                  await supabase.from("interventions").insert({
                    tenant_id: t.id,
                    user_id: userId,
                    type: "pm_contact_check_sent",
                    status: "pending",
                    sent_at: new Date().toISOString(),
                    notes: `Contact check sent — $${t.balance_due} outstanding, ${Math.floor(daysSinceAction)}d since last action`,
                    snapshot: { tenant_id: t.id, tenant_name: t.name, balance_due: t.balance_due },
                  })
                } catch (e) { console.error(`phase2 contact-check SMS failed — tenant ${t.id}:`, e) }
              }
            }
          }
        }
      }

      // Attorney handoff email — fires at attorney_review_day, once per 60 days
      if (tier >= escalationRules.attorneyReviewDay && profile?.attorney_email) {
        const alreadyHandedOff = await alreadySentAttorneyHandoff(supabase, t.id)
        if (!alreadyHandedOff) {
          const tenantProperty = t.properties as { name?: string | null; address?: string | null; state?: string | null } | null
          const { data: interventions } = await supabase
            .from("interventions")
            .select("type, sent_at, notes")
            .eq("tenant_id", t.id)
            .order("sent_at", { ascending: true })
            .limit(20)

          const interventionSummary = (interventions ?? [])
            .map(i => `${new Date(i.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — ${i.type.replace(/_/g, " ")}${i.notes ? `: ${i.notes}` : ""}`)
            .join("\n")

          try {
            const result = await sendAttorneyHandoff({
              attorneyEmail: profile.attorney_email,
              attorneyName: profile.attorney_name ?? null,
              pmName: profile.pm_display_name ?? null,
              pmEmail,
              tenantName: t.name,
              unit: t.unit,
              propertyName: tenantProperty?.name ?? null,
              propertyAddress: tenantProperty?.address ?? null,
              propertyState: tenantProperty?.state ?? null,
              balanceDue: t.balance_due ?? 0,
              rentAmount: t.rent_amount ?? 0,
              daysPastDue: days,
              latePaymentCount: t.late_payment_count ?? 0,
              daysLateAvg: t.days_late_avg ?? 0,
              previousDelinquency: t.previous_delinquency ?? false,
              interventionSummary,
            })
            if (result.ok) {
              await supabase.from("interventions").insert({
                tenant_id: t.id,
                user_id: userId,
                type: "attorney_handoff",
                status: "sent",
                sent_at: new Date().toISOString(),
                notes: `Attorney handoff email sent to ${profile.attorney_email}`,
              })
              totalAttorneyEmails++
            }
          } catch (e) { console.error(`phase2 attorney-handoff failed — tenant ${t.id}:`, e) }
        }
      }
    }

    // ── Installment missed — PM notification ──────────────────────────────────
    // Fires when a payment plan installment due date has passed without payment.
    // Only sends if "installment_missed" is in pm_alert_triggers.
    if (pmTriggers.includes("installment_missed")) {
      const today = new Date().toISOString().split("T")[0]
      const userTenantIds = userTenants.map(t => t.id)

      const { data: overduePlans } = await supabase
        .from("interventions")
        .select("tenant_id, snapshot")
        .in("tenant_id", userTenantIds)
        .eq("type", "payment_plan_agreed")
        .order("sent_at", { ascending: false })

      const latestPlanByTenant = new Map<string, { installments: { amount: number; due_date: string }[] }>()
      for (const plan of overduePlans ?? []) {
        if (!latestPlanByTenant.has(plan.tenant_id) && (plan.snapshot as { installments?: unknown })?.installments) {
          latestPlanByTenant.set(plan.tenant_id, { installments: (plan.snapshot as { installments: { amount: number; due_date: string }[] }).installments })
        }
      }

      for (const [tenantId, plan] of latestPlanByTenant.entries()) {
        const { data: paidNotes } = await supabase
          .from("payments")
          .select("note")
          .eq("tenant_id", tenantId)
          .like("note", "installment:%")

        const paidIndices = new Set((paidNotes ?? []).map(p => parseInt((p.note as string).split(":")[1])).filter(n => !isNaN(n)))

        for (let i = 0; i < plan.installments.length; i++) {
          if (!paidIndices.has(i) && plan.installments[i].due_date < today) {
            const { data: alreadyNotified } = await supabase
              .from("interventions")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("type", "pm_alert_installment_missed")
              .gte("sent_at", new Date(Date.now() - 7 * 86400000).toISOString())
              .limit(1)
            if ((alreadyNotified?.length ?? 0) > 0) break

            const missedTenant = userTenants.find(t => t.id === tenantId)
            if (missedTenant && pmEmail) {
              const missed = plan.installments[i]
              try {
                await resend.emails.send({
                  from: RESEND_FROM,
                  to: pmEmail,
                  subject: `${missedTenant.name} missed installment ${i + 1} — $${missed.amount.toLocaleString()} overdue`,
                  html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0e1a;color:#f0f1f3;border-radius:12px;">
                    <h2 style="margin:0 0 8px;">Missed Payment Plan Installment</h2>
                    <p style="color:#9ca3af;"><strong style="color:#f0f1f3;">${missedTenant.name}</strong> (Unit ${missedTenant.unit}) missed installment ${i + 1} of $${missed.amount.toLocaleString()}, due on ${missed.due_date}.</p>
                    <p style="color:#9ca3af;margin-top:12px;">Consider following up directly or converting this to a Pay or Quit notice if the missed installment isn't resolved within a few days.</p>
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tenants/${tenantId}" style="display:inline-block;margin-top:20px;background:#60a5fa;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">View Tenant →</a>
                  </div>`,
                })
              } catch (e) { console.error(`phase2 installment-missed email failed — tenant ${tenantId}:`, e) }
              if (pmPhone) {
                try {
                  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
                  await twilioClient.messages.create({
                    from: FROM_NUMBER,
                    to: pmPhone,
                    body: `RentSentry: ${missedTenant.name} (Unit ${missedTenant.unit}) missed installment ${i + 1} of $${missed.amount.toLocaleString()} — due ${missed.due_date}. Follow up directly or convert to Pay or Quit notice. ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tenants/${tenantId}`,
                  })
                } catch (e) { console.error(`phase2 installment-missed PM SMS failed — tenant ${tenantId}:`, e) }
              }
            }

            await supabase.from("interventions").insert({
              tenant_id: tenantId,
              user_id: userId,
              type: "pm_alert_installment_missed",
              status: "sent",
              sent_at: new Date().toISOString(),
              notes: `Installment ${i + 1} of $${plan.installments[i].amount} was due ${plan.installments[i].due_date} — unpaid`,
            })
            totalAlerts++
            break // one notification per tenant per week
          }
        }
      }
    }

    // ── Payment link / plan offer follow-up — fires 48h after chatbot sent link ──
    if (autoMode) {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600000).toISOString()
      const sevenDaysAgo       = new Date(Date.now() - 7 * 86400000).toISOString()
      const userTenantIds = userTenants.map(t => t.id)

      // Unused payment links (Stripe link expired — nudge tenant to reply for a new one)
      const { data: unusedLinks } = await supabase
        .from("interventions")
        .select("tenant_id, sent_at")
        .in("tenant_id", userTenantIds)
        .eq("type", "payment_link_sent")
        .filter("snapshot->>initiated_by", "eq", "tenant_chatbot")
        .lte("sent_at", fortyEightHoursAgo)
        .gte("sent_at", sevenDaysAgo)

      for (const link of unusedLinks ?? []) {
        const { data: paid } = await supabase.from("payments").select("id")
          .eq("tenant_id", link.tenant_id).gte("date", link.sent_at.split("T")[0]).limit(1)
        if ((paid?.length ?? 0) > 0) continue
        const { data: alreadyFollowed } = await supabase.from("interventions").select("id")
          .eq("tenant_id", link.tenant_id).eq("type", "payment_link_followup").gte("sent_at", sevenDaysAgo).limit(1)
        if ((alreadyFollowed?.length ?? 0) > 0) continue
        const t = userTenants.find(u => u.id === link.tenant_id)
        if (!t?.phone || t.sms_opted_out) continue
        const phone = normalizePhone(t.phone)
        if (!phone) continue
        const firstName = t.name.split(" ")[0]
        const sent = await sendTenantSms(supabase, t.id, phone,
          `Hi ${firstName}, your payment link has expired. Reply to this message to get a new one. Reply STOP to opt out.`)
        if (sent) {
          await supabase.from("interventions").insert({
            tenant_id: t.id, user_id: userId, type: "payment_link_followup", status: "sent",
            sent_at: new Date().toISOString(),
            notes: `Follow-up — payment link sent ${new Date(link.sent_at).toLocaleDateString()} not used`,
          })
          totalTenantSms++

          if (pmPhone) {
            const { data: alreadyAskedPm } = await supabase.from("interventions").select("id")
              .eq("tenant_id", t.id).eq("type", "pm_payment_link_confirm_sent")
              .gte("sent_at", sevenDaysAgo).limit(1)
            if ((alreadyAskedPm?.length ?? 0) === 0) {
              try {
                const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
                await twilioClient.messages.create({
                  from: FROM_NUMBER,
                  to: pmPhone,
                  body: `RentSentry: Did ${t.name} (Unit ${t.unit}) pay the $${(t.balance_due ?? 0).toLocaleString()} link sent 48h ago? Reply YES or NO.`,
                })
                await supabase.from("interventions").insert({
                  tenant_id: t.id, user_id: userId, type: "pm_payment_link_confirm_sent",
                  status: "pending", sent_at: new Date().toISOString(),
                  notes: `PM asked to confirm payment link outcome — $${t.balance_due} outstanding`,
                  snapshot: { tenant_id: t.id, tenant_name: t.name, balance_due: t.balance_due, amount: t.balance_due },
                })
              } catch (e) { console.error(`phase2 payment-link-confirm PM SMS failed — tenant ${t.id}:`, e) }
            }
          }
        }
      }

      // Unaccepted installment plan offers (link still valid within 7-day window)
      const { data: unusedOffers } = await supabase
        .from("interventions")
        .select("tenant_id, sent_at, snapshot")
        .in("tenant_id", userTenantIds)
        .eq("type", "pre_due_installment_offer")
        .eq("status", "pending")
        .filter("snapshot->>initiated_by", "eq", "tenant_chatbot")
        .lte("sent_at", fortyEightHoursAgo)
        .gte("sent_at", sevenDaysAgo)

      for (const offer of unusedOffers ?? []) {
        const snap = offer.snapshot as { offer_token?: string; expires_at?: string } | null
        if (!snap?.offer_token || !snap.expires_at) continue
        if (new Date(snap.expires_at) < new Date()) continue
        const { data: alreadyFollowed } = await supabase.from("interventions").select("id")
          .eq("tenant_id", offer.tenant_id).eq("type", "plan_offer_followup").gte("sent_at", sevenDaysAgo).limit(1)
        if ((alreadyFollowed?.length ?? 0) > 0) continue
        const t = userTenants.find(u => u.id === offer.tenant_id)
        if (!t?.phone || t.sms_opted_out) continue
        const phone = normalizePhone(t.phone)
        if (!phone) continue
        const firstName = t.name.split(" ")[0]
        const offerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pay/offer/${snap.offer_token}`
        const sent = await sendTenantSms(supabase, t.id, phone,
          `Hi ${firstName}, your payment plan offer is still open. Accept here: ${offerUrl} Reply STOP to opt out.`)
        if (sent) {
          await supabase.from("interventions").insert({
            tenant_id: t.id, user_id: userId, type: "plan_offer_followup", status: "sent",
            sent_at: new Date().toISOString(),
            notes: `Follow-up — installment offer from ${new Date(offer.sent_at).toLocaleDateString()} not accepted`,
          })
          totalTenantSms++
        }
      }
    }

    if (alertItems.length === 0) continue

    // Build PM email
    const evictionCostBase = 1500 + 500
    const weeks = 10

    const rows = alertItems
      .sort((a, b) => b.days - a.days)
      .map(({ tenant, days, context, autoSmsSent }) => {
        const rentAmount = tenant.rent_amount || 0
        const balance = tenant.balance_due || 0
        const tenantProperty = tenant.properties as { name?: string | null; state?: string | null } | null
        const propertyState = tenantProperty?.state ?? null
        const tenantWeeks = propertyState ? evictionWeeks(propertyState) : weeks
        const vacancyCost = Math.round((rentAmount / 4) * tenantWeeks)
        const evictionTotal = evictionCostBase + vacancyCost
        const cfkSuggested = Math.round(rentAmount * 0.75)
        const propertyName = tenantProperty?.name ?? ""

        const costBlock = days >= 10 ? `
          <div style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:12px 16px;margin-top:10px;">
            <p style="color:#4b5563;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 10px;">Cost Comparison</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr>
                <td style="padding:6px 0;color:#9ca3af;border-bottom:1px solid #1f2937;">Eviction (est. ${tenantWeeks} weeks)</td>
                <td style="padding:6px 0;text-align:right;color:#f87171;font-weight:700;border-bottom:1px solid #1f2937;">~$${evictionTotal.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#9ca3af;">Cash for Keys (suggested offer)</td>
                <td style="padding:6px 0;text-align:right;color:#34d399;font-weight:700;">~$${cfkSuggested.toLocaleString()}</td>
              </tr>
            </table>
          </div>` : ""

        return `
          <div style="background:#0d1117;border:1px solid #1f2937;border-radius:10px;padding:16px 18px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
              <div>
                <span style="color:#f0f1f3;font-weight:700;font-size:15px;">${tenant.name}</span>
                <span style="color:#4b5563;font-size:13px;margin-left:8px;">Unit ${tenant.unit}${propertyName ? ` · ${propertyName}` : ""}</span>
              </div>
              <span style="color:${context.color};font-weight:700;font-size:13px;">Day ${days}</span>
            </div>
            <p style="color:#6b7280;font-size:12px;margin:0 0 6px;">${context.label}</p>
            <p style="color:#9ca3af;font-size:13px;margin:0 0 4px;">Balance: <strong style="color:#f87171;">$${balance.toLocaleString()}</strong></p>
            <p style="color:${autoSmsSent ? "#34d399" : "#60a5fa"};font-size:13px;margin:0;">→ ${autoSmsSent ? "SMS reminder automatically sent to tenant" : context.suggestion}</p>
            ${costBlock}
          </div>`
      }).join("")

    const subject = alertItems.length === 1
      ? `RentSentry — ${alertItems[0].tenant.name} is ${alertItems[0].days} days past due`
      : `RentSentry — ${alertItems.length} tenants need your attention`

    try {
      await resend.emails.send({
        from: RESEND_FROM,
        to: pmEmail,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:36px 28px;background:#0a0e1a;color:#f0f1f3;border-radius:14px;">
            <p style="font-size:12px;color:#4b5563;margin:0 0 20px;letter-spacing:0.05em;text-transform:uppercase;">RentSentry · Phase 2 Alert</p>
            <h2 style="margin:0 0 6px;font-size:20px;">${alertItems.length} tenant${alertItems.length !== 1 ? "s" : ""} need${alertItems.length === 1 ? "s" : ""} your attention</h2>
            <p style="color:#6b7280;font-size:13px;margin:0 0 24px;">Review each situation below and decide on the appropriate action. RentSentry never sends notices to tenants without your approval.</p>
            ${rows}
            <div style="margin-top:24px;padding-top:20px;border-top:1px solid #1f2937;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tenants" style="display:inline-block;background:#60a5fa;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
                Review in Dashboard →
              </a>
            </div>
            <p style="color:#374151;font-size:11px;margin-top:20px;">Your escalation style is set to <strong style="color:#6b7280;">${style}</strong>. Change this in Settings.</p>
          </div>`,
      })
      totalEmails++

      // SMS the PM for high-priority tenants (pay-or-quit threshold and above)
      if (pmPhone) {
        const urgentItems = alertItems.filter(item => item.tier >= escalationRules.payOrQuitDay)
        if (urgentItems.length > 0) {
          const sorted = urgentItems.sort((a, b) => b.days - a.days)
          let smsBody: string
          let singleTenant: typeof sorted[0] | null = null
          if (sorted.length === 1) {
            const { tenant, days, context } = sorted[0]
            singleTenant = sorted[0]
            smsBody = `RentSentry: ${tenant.name} (Unit ${tenant.unit}) — Day ${days}, $${(tenant.balance_due ?? 0).toLocaleString()} owed. ${context.suggestion}\nReply: LINK · PLAN · SNOOZE`
          } else {
            const lines = sorted.map(({ tenant, days }) => `${tenant.name.split(" ")[0]} Day ${days} $${(tenant.balance_due ?? 0).toLocaleString()}`).join(" · ")
            smsBody = `RentSentry: ${sorted.length} tenants need action — ${lines}. Full details in your email or dashboard.`
          }
          try {
            const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
            await twilioClient.messages.create({ from: FROM_NUMBER, to: pmPhone, body: smsBody })
            // Create a pending intervention so the PM can reply LINK, PLAN, or SNOOZE
            if (singleTenant) {
              const { tenant, days } = singleTenant
              await supabase.from("interventions").insert({
                tenant_id: tenant.id,
                user_id: userId,
                type: "pm_action_prompt_sent",
                status: "pending",
                sent_at: new Date().toISOString(),
                notes: `PM action prompt — Day ${days}, $${tenant.balance_due ?? 0} owed`,
                snapshot: { tenant_id: tenant.id, tenant_name: tenant.name, balance_due: tenant.balance_due ?? 0, unit: tenant.unit },
              })
            }
          } catch (e) { console.error(`phase2 urgent-PM SMS failed — user ${userId}:`, e) }
        }
      }
    } catch (e) { console.error(`phase2 PM alert email failed — user ${userId}:`, e) }
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    delinquent_tenants: delinquent.length,
    alerts_logged: totalAlerts,
    pm_emails_sent: totalEmails,
    tenant_sms_sent: totalTenantSms,
    attorney_emails_sent: totalAttorneyEmails,
  })
}
