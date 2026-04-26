"use client"
import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CreditCard, ShieldAlert, Upload, Search, X, FileText, Bell,
  Scale, HandCoins, CalendarClock, Send, Plus, Pencil,
  ArrowRight, Zap, Pause, Play, CheckCircle2, Activity, TrendingUp,
  DollarSign, Download, Lightbulb, CornerDownRight,
} from "lucide-react"
import Link from "next/link"
import type { RiskTier } from "@/lib/risk-engine"
import TenantFormModal from "./TenantFormModal"
import { STATE_RULES, generatePayOrQuitPDF } from "@/lib/pay-or-quit"

// ── Email previews ────────────────────────────────────────────────────────────

// SMS previews — shown in the review modal before sending
const SMS_PREVIEWS: Record<string, (name: string, balance?: number, daysPastDue?: number) => string> = {
  payment_reminder: (name, balance, daysPastDue) =>
    balance && balance > 0
      ? `Hi ${name}, you have an outstanding balance of $${balance.toLocaleString()}${daysPastDue && daysPastDue > 0 ? ` that is ${daysPastDue} days overdue` : " that is overdue"}. Please arrange payment immediately or contact your property manager.`
      : `Hi ${name}, this is a reminder that rent is due on the 1st. Please ensure payment is ready. Contact your property manager with any questions.`,
  proactive_reminder: (name) =>
    `Hi ${name}, rent is due on the 1st. Based on your payment history we wanted to reach out early. Contact your property manager with any questions.`,
  // card_expiry_alert kept for backward compat with historical interventions
  card_expiry_alert: (name) =>
    `Hi ${name}, your payment method on file may need attention. Please confirm or update it before the 1st to avoid any issues with your tenancy.`,
  split_pay_offer: (name, balance) =>
    `Hi ${name}, your property manager is offering a flexible split-payment option for your outstanding balance${balance && balance > 0 ? ` of $${balance.toLocaleString()}` : ""}. Reply or call to arrange installments.`,
  cash_for_keys: (name) =>
    `Hi ${name}, your property manager has a time-sensitive offer regarding your unit. Please contact them within 5 days to discuss your options.`,
  legal_packet: (name, balance) =>
    `Hi ${name}, your account${balance && balance > 0 ? ` has an outstanding balance of $${balance.toLocaleString()} and` : " is significantly overdue and"} legal proceedings are being prepared. Contact your property manager immediately to resolve this.`,
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentActivity {
  tenant_id: string
  type: string
  sent_at: string
  status: string   // "sent" | "dry_run" | "queued" | "pending"
}

interface PaymentRecord {
  tenant_id: string
  amount: number
  date: string
}

// needs_review → queued → sent (clear linear progression)
// "queued" = auto mode on, scheduled date computed, not yet sent
// "sent"   = intervention with status "sent" exists this month
type AutoStatus = "needs_review" | "queued" | "sent" | "paused" | "healthy"

interface Tenant {
  id: string
  unit: string
  name: string
  email: string
  phone: string
  rent_amount: number
  balance_due: number
  risk_score: string
  tier: RiskTier
  recommended_action: string
  action_type: string
  reasons: string[]
  days_past_due: number
  late_fee: number
  requires_attorney: boolean
  days_late_avg: number
  late_payment_count: number
  previous_delinquency: boolean
  card_expiry: string
  payment_method: string
  last_payment_date: string
  resolution_status?: string | null
  properties?: { name?: string; id?: string; address?: string; state?: string }
}

interface Props {
  tenants: Tenant[]
  properties: { id: string; name: string; address?: string; state?: string }[]
  recentActivity: RecentActivity[]
  paymentsThisMonth: PaymentRecord[]
  autoMode: boolean
  landlordEmail?: string
}

// ── Tier config ───────────────────────────────────────────────────────────────

// Neutral badge style used for all tier badges — status badge drives urgency, not category
const NEUTRAL_BADGE = "bg-white/5 text-[#6b7280] border-white/10"
// One consistent primary button — same across all tiers
const PRIMARY_BUTTON = "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20"

const TIER_CONFIG: Record<RiskTier, {
  label: string
  sectionHeader: string
  badge: string
  nextAction: string
  description: string
  dot: string
  textColor: string
  badgeStyle: string
  buttonStyle: string
  icon: React.ReactNode
  actionType: string
  requiresLegalWarning: boolean
}> = {
  legal: {
    label: "Eviction Recommended",
    sectionHeader: "Eviction Packets — Awaiting Review",
    badge: "Ready to Send",
    nextAction: "Eviction packet compiled — attorney review required before filing",
    description: "2+ months overdue. System has assembled the evidence packet.",
    dot: "bg-red-500",
    textColor: "text-red-400",
    badgeStyle: NEUTRAL_BADGE,
    buttonStyle: PRIMARY_BUTTON,
    icon: <Scale size={13} className="shrink-0 text-[#6b7280]" />,
    actionType: "legal_packet",
    requiresLegalWarning: true,
  },
  pay_or_quit: {
    label: "Pay or Quit Notice",
    sectionHeader: "Pay or Quit Notices — Awaiting Review",
    badge: "Ready to Send",
    nextAction: "Pay or Quit notice ready — most tenants resolve within 7 days of receiving this",
    description: "Chronic late payer with outstanding balance. Sending this notice is your fastest path to getting paid.",
    dot: "bg-red-400",
    textColor: "text-red-300",
    badgeStyle: NEUTRAL_BADGE,
    buttonStyle: PRIMARY_BUTTON,
    icon: <FileText size={13} className="shrink-0 text-[#6b7280]" />,
    actionType: "legal_packet",
    requiresLegalWarning: true,
  },
  cash_for_keys: {
    label: "Cash for Keys",
    sectionHeader: "Cash for Keys Offers — Awaiting Review",
    badge: "Ready to Send",
    nextAction: "CFK offer prepared — cost comparison available in tenant detail",
    description: "1+ month overdue. System has calculated CFK vs eviction cost comparison.",
    dot: "bg-orange-500",
    textColor: "text-orange-400",
    badgeStyle: NEUTRAL_BADGE,
    buttonStyle: PRIMARY_BUTTON,
    icon: <HandCoins size={13} className="shrink-0 text-[#6b7280]" />,
    actionType: "cash_for_keys",
    requiresLegalWarning: false,
  },
  payment_plan: {
    label: "Payment Plan",
    sectionHeader: "Payment Plans — Awaiting Review",
    badge: "Ready to Send",
    nextAction: "Payment plan offer queued — system will deliver on your approval",
    description: "Balance present with late history. Split-payment offer prepared by system.",
    dot: "bg-amber-500",
    textColor: "text-amber-400",
    badgeStyle: NEUTRAL_BADGE,
    buttonStyle: PRIMARY_BUTTON,
    icon: <CalendarClock size={13} className="shrink-0 text-[#6b7280]" />,
    actionType: "split_pay_offer",
    requiresLegalWarning: false,
  },
  reminder: {
    label: "Reminder Scheduled",
    sectionHeader: "Reminders",
    badge: "Queued",
    nextAction: "Friendly reminder queued — automation delivers at next scheduled run",
    description: "First or second offense. System has queued a reminder — no action needed.",
    dot: "bg-yellow-400",
    textColor: "text-yellow-400",
    badgeStyle: NEUTRAL_BADGE,
    buttonStyle: PRIMARY_BUTTON,
    icon: <Bell size={13} className="shrink-0 text-[#6b7280]" />,
    actionType: "payment_reminder",
    requiresLegalWarning: false,
  },
  watch: {
    label: "Monitoring Active",
    sectionHeader: "Monitoring",
    badge: "Scheduled",
    nextAction: "System monitoring payment behavior — alert queued before the 1st",
    description: "Risk signals detected, no current balance. Pre-1st automation watching.",
    dot: "bg-blue-400",
    textColor: "text-blue-400",
    badgeStyle: NEUTRAL_BADGE,
    buttonStyle: PRIMARY_BUTTON,
    icon: <CreditCard size={13} className="shrink-0 text-[#6b7280]" />,
    actionType: "proactive_reminder",
    requiresLegalWarning: false,
  },
  healthy: {
    label: "Healthy",
    sectionHeader: "Healthy",
    badge: "On Track",
    nextAction: "",
    description: "",
    dot: "bg-emerald-500",
    textColor: "text-emerald-400",
    badgeStyle: "bg-emerald-500/10 text-emerald-400/70 border-emerald-500/15",
    buttonStyle: PRIMARY_BUTTON,
    icon: null,
    actionType: "",
    requiresLegalWarning: false,
  },
}

const SECTION_ORDER: RiskTier[] = ["legal", "pay_or_quit", "cash_for_keys", "payment_plan", "reminder", "watch"]

// ── Auto status ───────────────────────────────────────────────────────────────

const AUTO_STATUS_CONFIG: Record<AutoStatus, {
  label: string
  dot: string
  textColor: string
  badgeStyle: string
  opacity: string
}> = {
  needs_review: {
    label: "Needs Review",
    dot: "bg-red-500 animate-pulse",
    textColor: "text-red-400",
    badgeStyle: "bg-red-500/10 text-red-400 border-red-500/20",
    opacity: "",
  },
  queued: {
    label: "Scheduled",
    dot: "bg-blue-400",
    textColor: "text-blue-400",
    badgeStyle: "bg-blue-400/10 text-blue-400 border-blue-400/20",
    opacity: "opacity-80",
  },
  sent: {
    label: "Sent",
    dot: "bg-emerald-500",
    textColor: "text-emerald-400",
    badgeStyle: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    opacity: "opacity-60",
  },
  paused: {
    label: "Paused",
    dot: "bg-[#4b5563]",
    textColor: "text-[#4b5563]",
    badgeStyle: "bg-white/5 text-[#4b5563] border-white/10",
    opacity: "opacity-50",
  },
  healthy: {
    label: "Healthy",
    dot: "bg-emerald-500",
    textColor: "text-emerald-400",
    badgeStyle: "bg-emerald-500/10 text-emerald-400/70 border-emerald-500/15",
    opacity: "opacity-60",
  },
}

// Human-readable labels for intervention types (covers current + historical records)
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  payment_reminder:     "payment reminder",
  proactive_reminder:   "proactive rent reminder",
  payment_method_alert:       "payment method alert",
  pre_due_delinquent_warning: "pre-due balance warning",
  // legacy types from earlier versions — kept for activity log display
  card_expiry_alert:    "payment reminder",
  card_expiry_30:       "payment reminder",
  card_expiry_7:        "payment reminder",
  no_payment_method:    "payment method alert",
  split_pay_offer:      "payment plan offer",
  cash_for_keys:        "Cash for Keys offer",
  legal_packet:         "legal notice",
}

// "Next: ..." instruction shown in the next-action box for needs_review tenants
const APPROVAL_MESSAGE: Partial<Record<RiskTier, string>> = {
  legal:        "Next: Review eviction packet",
  pay_or_quit:  "Next: Send Pay or Quit — fastest way to collect",
  cash_for_keys:"Next: Review Cash for Keys offer",
  payment_plan: "Next: Review payment plan",
  reminder:     "Next: Send payment reminder",
  watch:        "Next: Review scheduled alert",
}

// ── Scheduling helpers ────────────────────────────────────────────────────────

function formatActionDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function relativeDays(date: Date): string {
  const diff = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff <= 0) return "today"
  if (diff === 1) return "tomorrow"
  return `in ${diff} days`
}

interface ScheduledAction {
  what: string
  date: Date
  reason: string
}

function computeScheduledDate(t: Tenant): ScheduledAction | null {
  const now = new Date()
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const hasHistory = (t.late_payment_count ?? 0) >= 2 || (t.days_late_avg ?? 0) >= 3
  const noPaymentMethod = !t.payment_method || t.payment_method === "unknown"

  // Rule A: Proactive reminder — late history, 3 days before the 1st
  // Primary rule: works from standard CSV data, no payment metadata needed
  if ((t.tier === "watch" || t.tier === "reminder") && hasHistory) {
    const reminderDate = new Date(nextFirst)
    reminderDate.setDate(reminderDate.getDate() - 3)
    return {
      what: "Proactive rent reminder",
      date: reminderDate,
      reason: "Late payment history detected",
    }
  }

  // Rule B: No payment method — 7 days before the 1st
  if (t.tier === "watch" && noPaymentMethod) {
    const alertDate = new Date(nextFirst)
    alertDate.setDate(alertDate.getDate() - 7)
    return {
      what: "Payment method confirmation",
      date: alertDate,
      reason: "No payment method on file",
    }
  }

  // Rule C (optional): Card expiry data present from payment processor integration
  if (t.card_expiry && t.tier === "watch") {
    try {
      const [month, year] = t.card_expiry.split("/").map(Number)
      if (!month || !year) return null
      const expiryDate = new Date(2000 + year, month - 1, 1)
      const reminderDate = new Date(expiryDate)
      reminderDate.setDate(reminderDate.getDate() - 7)
      if (reminderDate > now) {
        return {
          what: "Card expiry reminder",
          date: reminderDate,
          reason: `Card expires ${formatActionDate(expiryDate)}`,
        }
      }
    } catch { return null }
  }

  return null
}

function getAutoStatus(
  t: Tenant,
  recentActivity: RecentActivity[],
  pausedTenants: Set<string>,
  autoMode: boolean
): AutoStatus {
  if (pausedTenants.has(t.id)) return "paused"
  if (t.tier === "healthy") return "healthy"

  // "sent" = an actual intervention was delivered this month (not dry_run)
  const wasSentThisMonth = recentActivity.some(
    a => a.tenant_id === t.id && a.status === "sent"
  )
  if (wasSentThisMonth) return "sent"

  // "queued" = auto mode on + system has a concrete scheduled date
  if (autoMode && computeScheduledDate(t)) return "queued"

  return "needs_review"
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3600000)
  const d = Math.floor(ms / 86400000)
  if (h < 1) return "just now"
  if (h < 24) return `${h}h ago`
  if (d === 1) return "yesterday"
  return `${d}d ago`
}

function formatSentTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
}

function getSystemMessage(
  t: Tenant,
  status: AutoStatus,
  recentActivity: RecentActivity[],
  autoMode: boolean
): { primary: string; secondary?: string; reason?: string } {

  if (status === "paused") {
    return { primary: "Automation paused" }
  }

  if (status === "sent") {
    const last = recentActivity.find(a => a.tenant_id === t.id && a.status === "sent")
    const typeLabel = last ? (ACTIVITY_TYPE_LABELS[last.type] ?? last.type) : "action"
    const when = last ? formatSentTime(last.sent_at) : "this month"
    return {
      primary: `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} sent ${when}`,
      secondary: "Awaiting tenant response",
    }
  }

  if (status === "queued") {
    const scheduled = computeScheduledDate(t)
    if (scheduled) {
      const dateStr = formatActionDate(scheduled.date)
      const rel = relativeDays(scheduled.date)
      return {
        primary: `Sending ${dateStr} (${rel})`,
        reason: scheduled.reason,
      }
    }
    return { primary: "Sending today" }
  }

  // needs_review: PM must act, or auto mode is off for automated tiers
  if (status === "needs_review") {
    if (!autoMode && (t.tier === "watch" || t.tier === "reminder")) {
      return { primary: "No action scheduled — auto mode is off" }
    }
    const approvalMsg = APPROVAL_MESSAGE[t.tier]
    if (approvalMsg) {
      return { primary: approvalMsg }
    }
    // watch/reminder with auto mode on but no schedule yet
    return { primary: "System monitoring · alert queued if payment fails" }
  }

  return { primary: "" }
}

// ── Problem summary line ──────────────────────────────────────────────────────
// Only the money amount is red — everything else is muted gray.

function ProblemLine({ t }: { t: Tenant }) {
  const parts: React.ReactNode[] = []

  if (t.balance_due > 0) {
    parts.push(
      <span key="bal" className="text-red-400 font-medium tabular-nums">
        ${t.balance_due.toLocaleString()} overdue
      </span>
    )
  }
  if (t.days_past_due > 0)      parts.push(`${t.days_past_due}d past due`)
  if (t.late_payment_count > 1) parts.push(`${t.late_payment_count} late payments`)
  if (t.previous_delinquency)   parts.push("prior eviction on record")
  if (t.tier === "watch") {
    if (!t.payment_method || t.payment_method === "unknown") parts.push("payment method not confirmed")
    else if (t.card_expiry) parts.push(`card expires ${t.card_expiry}`) // only shown when data available
  }

  if (parts.length === 0) return null

  return (
    <p className="text-xs mb-3 text-[#6b7280] leading-snug">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="text-[#2e3a50]"> · </span>}
          {part}
        </span>
      ))}
    </p>
  )
}

// Toast label shown immediately after PM triggers an action
const ACTION_QUEUED_TOAST: Record<string, string> = {
  legal_packet:         "Eviction packet sent",
  cash_for_keys:        "Cash for Keys offer sent",
  split_pay_offer:      "Payment plan offer sent",
  payment_reminder:     "Reminder scheduled",
  proactive_reminder:   "Reminder scheduled",
  card_expiry_alert:    "Reminder scheduled",
}

// Tier-specific primary button label for "Review & Send"
const REVIEW_BUTTON_LABEL: Partial<Record<RiskTier, string>> = {
  legal:        "Review & Send Packet",
  pay_or_quit:  "Send Pay or Quit — Get Paid",
  cash_for_keys:"Review & Send Offer",
  payment_plan: "Review & Send Plan",
  reminder:     "Review & Send Reminder",
  watch:        "Review & Send Alert",
}

// Helper line shown under primary button explaining what happens after click
const AFTER_SEND_LABEL: Partial<Record<RiskTier, string>> = {
  legal:        "Sent to tenant immediately after your approval",
  pay_or_quit:  "Most tenants pay within 7 days of receiving this — sent immediately on approval",
  cash_for_keys:"Sent to tenant immediately after your approval",
  payment_plan: "Sent to tenant immediately after your approval",
  reminder:     "Scheduled for delivery · you will be notified when sent",
  watch:        "Scheduled for delivery · you will be notified when sent",
}

// Compact "prepared based on" line showing the key signals that triggered this tier
function buildPreparedLine(t: Tenant): string {
  const parts: string[] = []
  if (t.balance_due > 0) parts.push(`$${t.balance_due.toLocaleString()} overdue`)
  if (t.days_past_due > 0) parts.push(`${t.days_past_due}d past due`)
  if (t.late_payment_count > 1) parts.push(`${t.late_payment_count} late payments`)
  if (t.previous_delinquency) parts.push("prior eviction on record")
  if (!t.payment_method || t.payment_method === "unknown") parts.push("no payment method")
  else if (t.days_late_avg >= 3) parts.push(`avg ${t.days_late_avg}d late`)
  return parts.slice(0, 3).join(" · ")
}

// ── Snapshot builder ──────────────────────────────────────────────────────────

function buildSnapshot(t: Tenant) {
  const config = TIER_CONFIG[t.tier]
  return {
    tier: t.tier,
    badge: config.badge,
    balance_due: t.balance_due ?? 0,
    rent_amount: t.rent_amount ?? 0,
    days_past_due: t.days_past_due ?? 0,
    days_late_avg: t.days_late_avg ?? 0,
    late_payment_count: t.late_payment_count ?? 0,
    previous_delinquency: t.previous_delinquency ?? false,
    card_expiry: t.card_expiry || null,
    payment_method: t.payment_method || null,
    reasons: t.reasons ?? [],
    recommended_action: t.recommended_action ?? "",
    action_type: t.action_type ?? "",
    late_fee: t.late_fee ?? 0,
    requires_attorney: t.requires_attorney ?? false,
    property_name: t.properties?.name ?? null,
    scored_at: new Date().toISOString(),
  }
}

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-amber-500", "bg-cyan-500", "bg-rose-500",
]
function avatarColor(name: string) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
}

// ── Portfolio summary strip ───────────────────────────────────────────────────

interface PortfolioStats {
  needsReview: number
  queued: number
  sent: number
  paused: number
  revenueProtected: number
  recoveredThisMonth: number
  lastActivityAt: string | null
}

function PortfolioSummaryStrip({ stats }: { stats: PortfolioStats }) {
  const freshness = stats.lastActivityAt
    ? `Last action: ${timeAgo(stats.lastActivityAt)}`
    : "No actions sent this month"

  const items = [
    stats.needsReview > 0 && { dot: "bg-red-500",     text: `${stats.needsReview} need${stats.needsReview === 1 ? "s" : ""} review` },
    stats.queued      > 0 && { dot: "bg-blue-400",    text: `${stats.queued} scheduled` },
    stats.sent        > 0 && { dot: "bg-emerald-500", text: `${stats.sent} sent this month` },
    stats.revenueProtected > 0 && { dot: "bg-[#374151]", text: `$${stats.revenueProtected.toLocaleString()} at-risk rent under automation` },
    stats.recoveredThisMonth > 0 && { dot: "bg-emerald-400", text: `$${stats.recoveredThisMonth.toLocaleString()} recovered this month` },
    stats.paused > 0 && { dot: "bg-[#4b5563]", text: `${stats.paused} paused` },
  ].filter(Boolean) as { dot: string; text: string }[]

  if (items.length === 0) return null

  return (
    <div className="flex items-center justify-between bg-[#0a0e1a] border border-white/5 rounded-xl px-4 py-2.5 mb-5 gap-3 flex-wrap">
      <div className="flex items-center gap-5 flex-wrap">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`} />
            <span className="text-[#9ca3af] text-sm tabular-nums">{item.text}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[#2e3a50] text-xs shrink-0">
        <Activity size={11} />
        {freshness}
      </div>
    </div>
  )
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

type FilterKey = "all" | "needs_review" | "queued" | "sent" | "paused"

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all",          label: "All" },
  { key: "needs_review", label: "Needs Review" },
  { key: "queued",       label: "Scheduled" },
  { key: "sent",         label: "Sent" },
  { key: "paused",       label: "Paused" },
]

function FilterBar({ active, counts, onChange }: {
  active: FilterKey
  counts: Record<FilterKey, number>
  onChange: (f: FilterKey) => void
}) {
  return (
    <div className="flex items-center gap-1 bg-[#0d1117] border border-white/5 rounded-xl p-1 flex-wrap">
      {FILTER_TABS.map(tab => {
        const count = counts[tab.key]
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-[#111827] text-white border border-white/10 shadow-sm"
                : "text-[#4b5563] hover:text-[#9ca3af]"
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold tabular-nums ${
                isActive ? "bg-white/10 text-white" : "bg-white/5 text-[#4b5563]"
              }`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── PreviewModal ──────────────────────────────────────────────────────────────

function PreviewModal({
  tenant,
  actionType,
  onConfirm,
  onCancel,
  loading,
}: {
  tenant: Tenant
  actionType: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  const msgFn = SMS_PREVIEWS[actionType]
  if (!msgFn) return null
  const msgBody = msgFn(tenant.name, tenant.balance_due, tenant.days_past_due)
  const hasPhone = !!tenant.phone
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-white font-semibold text-base">Review SMS Before Sending</h3>
              <p className="text-[#4b5563] text-xs mt-0.5">Prepared by system · approve to send via SMS</p>
            </div>
            <button onClick={onCancel} className="text-[#4b5563] hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="flex gap-3 text-sm items-baseline mb-4">
            <span className="text-[#4b5563] w-14 shrink-0 text-xs uppercase tracking-wide">To</span>
            {hasPhone
              ? <span className="text-white font-mono">{tenant.phone}</span>
              : <span className="text-orange-400 text-xs">No phone number on file — SMS will not be sent</span>
            }
          </div>

          {/* SMS bubble */}
          <div className="bg-[#0d1117] border border-white/5 rounded-2xl rounded-tl-sm p-4 mb-1">
            <p className="text-[#d1d5db] text-sm leading-relaxed">{msgBody}</p>
          </div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-[#2e3a50] text-[10px]">SMS · {msgBody.length} chars · 1 segment</span>
            <span className="text-[#2e3a50] text-[10px]">Sent from RentSentry</span>
          </div>

          <p className="text-[#374151] text-xs mb-5">Logged to tenant record regardless of delivery</p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Send size={13} />
              {loading ? "Sending…" : "Approve & Send SMS"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MarkPaidModal ─────────────────────────────────────────────────────────────

function buildPaymentOptions(balance: number, rent: number): { label: string; amount: number }[] {
  if (!rent || rent <= 0) return [{ label: `Full balance — $${balance.toLocaleString()}`, amount: balance }]

  const ratio = balance / rent
  const months = Math.round(ratio)
  const isCleanMultiple = months >= 1 && Math.abs(ratio - months) < 0.15

  if (isCleanMultiple) {
    const opts: { label: string; amount: number }[] = []
    for (let m = 1; m <= months; m++) {
      const amt = rent * m
      opts.push({
        label: m === months
          ? `${m} month${m > 1 ? "s" : ""} (full balance) — $${amt.toLocaleString()}`
          : `${m} month${m > 1 ? "s" : ""} — $${amt.toLocaleString()}`,
        amount: amt,
      })
    }
    return opts
  }

  return [{ label: `Full balance — $${balance.toLocaleString()}`, amount: balance }]
}

function MarkPaidModal({
  tenant,
  onClose,
  onSuccess,
}: {
  tenant: Tenant
  onClose: () => void
  onSuccess: () => void
}) {
  const options = buildPaymentOptions(tenant.balance_due ?? 0, tenant.rent_amount ?? 0)
  const [selected, setSelected] = useState<number | null>(
    options.length === 1 ? options[0].amount : null
  )
  const [customAmount, setCustomAmount] = useState("")
  const [showCustom, setShowCustom] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)

  const finalAmount = showCustom
    ? parseFloat(customAmount) || 0
    : selected ?? 0

  async function submit() {
    if (!finalAmount || finalAmount <= 0) { toast.error("Select or enter a payment amount."); return }
    setLoading(true)
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, amount: finalAmount, date, note }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message)
        onSuccess()
      } else {
        toast.error(data.error || "Something went wrong.")
      }
    } catch {
      toast.error("Could not record payment.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-white font-semibold text-base">Record Payment</h3>
              <p className="text-[#4b5563] text-xs mt-0.5">
                {tenant.name} · ${(tenant.rent_amount ?? 0).toLocaleString()}/mo · balance ${(tenant.balance_due ?? 0).toLocaleString()}
              </p>
            </div>
            <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Smart payment options */}
          <div className="mb-4">
            <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">How much did they pay?</label>
            <div className="space-y-2">
              {options.map(opt => (
                <button
                  key={opt.amount}
                  onClick={() => { setSelected(opt.amount); setShowCustom(false) }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-all ${
                    selected === opt.amount && !showCustom
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-medium"
                      : "bg-white/[0.03] border-white/[0.08] text-[#9ca3af] hover:border-white/20 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => { setShowCustom(true); setSelected(null) }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-all ${
                  showCustom
                    ? "bg-blue-500/15 border-blue-500/30 text-blue-400 font-medium"
                    : "bg-white/[0.03] border-white/[0.08] text-[#9ca3af] hover:border-white/20 hover:text-white"
                }`}
              >
                Other amount
              </button>
            </div>
          </div>

          {/* Custom amount input — only shown when Other is selected */}
          {showCustom && (
            <div className="mb-4">
              <input
                type="number"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                autoFocus
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
                placeholder="Enter amount"
              />
            </div>
          )}

          <div className="space-y-3 mb-5">
            <div>
              <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
              />
            </div>
            <div>
              <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1">Note <span className="normal-case text-[#374151]">(optional)</span></label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Venmo, partial payment…"
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={loading || finalAmount <= 0}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <DollarSign size={13} />
              {loading ? "Saving…" : finalAmount > 0 ? `Record $${finalAmount.toLocaleString()}` : "Record Payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TenantAIModal ─────────────────────────────────────────────────────────────

interface ChatMessage { role: "user" | "assistant"; content: string }

function parseSMSDraft(raw: string): { display: string; draft: string | null } {
  const start = raw.indexOf("---SMS_DRAFT---")
  const end = raw.indexOf("---END_DRAFT---")
  if (start === -1 || end === -1 || end <= start) return { display: raw, draft: null }
  const draft = raw.slice(start + "---SMS_DRAFT---".length, end).trim()
  const display = raw.slice(0, start).trim()
  return { display, draft }
}

function TenantAIModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [input, setInput] = useState("")
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [smsDrafts, setSmsDrafts] = useState<Record<number, string>>({})
  const [sendingIdx, setSendingIdx] = useState<number | null>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [history, loading])

  async function send() {
    const msg = input.trim()
    if (!msg || loading) return
    setInput("")
    const next: ChatMessage[] = [...history, { role: "user", content: msg }]
    setHistory(next)
    setLoading(true)
    try {
      const res = await fetch("/api/tenant-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, message: msg, history }),
      })
      const data = await res.json()
      const raw: string = data.message || "Something went wrong."
      const { display, draft } = parseSMSDraft(raw)
      const newHistory: ChatMessage[] = [...next, { role: "assistant", content: display }]
      setHistory(newHistory)
      if (draft) {
        setSmsDrafts(prev => ({ ...prev, [newHistory.length - 1]: draft }))
      }
    } catch {
      setHistory(prev => [...prev, { role: "assistant", content: "Could not reach AI. Check your connection." }])
    } finally {
      setLoading(false)
    }
  }

  async function sendSms(idx: number) {
    const text = smsDrafts[idx]
    if (!text?.trim() || !tenant.phone) return
    setSendingIdx(idx)
    try {
      const res = await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          type: "ai_suggested",
          phone: tenant.phone,
          message: text.trim(),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success("SMS sent!")
      setSmsDrafts(prev => { const n = { ...prev }; delete n[idx]; return n })
    } catch {
      toast.error("Failed to send SMS.")
    } finally {
      setSendingIdx(null)
    }
  }

  const balanceMonths = tenant.rent_amount > 0
    ? Math.round((tenant.balance_due / tenant.rent_amount) * 10) / 10
    : 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#111827] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Lightbulb size={14} className="text-amber-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">AI Advisor — {tenant.name}</p>
              <p className="text-[#4b5563] text-xs mt-0.5">
                {tenant.balance_due > 0
                  ? `$${tenant.balance_due.toLocaleString()} overdue · ${balanceMonths > 0 ? `${balanceMonths}mo · ` : ""}${tenant.days_past_due}d past due`
                  : `$${tenant.rent_amount?.toLocaleString()}/mo · no balance`
                }
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {history.length === 0 && (
            <div className="space-y-2">
              <p className="text-[#4b5563] text-xs text-center mb-4">Ask anything about this tenant — the AI knows their full history.</p>
              {[
                "Tenant said he'll pay next week",
                "Should I offer a payment plan?",
                "Tenant went quiet after my last message",
                "Is it time to send Pay or Quit?",
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[#6b7280] hover:text-white hover:border-white/10 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {history.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} w-full`}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                    <Lightbulb size={11} className="text-amber-400" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-500/20 text-white rounded-br-sm"
                    : "bg-white/[0.05] text-[#d1d5db] rounded-bl-sm border border-white/[0.06]"
                }`}>
                  {msg.content}
                </div>
              </div>

              {msg.role === "assistant" && smsDrafts[i] !== undefined && (
                <div className="ml-8 mt-2 w-full max-w-[85%] bg-[#0d1117] border border-amber-500/20 rounded-xl p-3 space-y-2">
                  <p className="text-amber-400 text-xs font-medium flex items-center gap-1.5">
                    <span>📱</span> Suggested SMS — edit before sending
                  </p>
                  <textarea
                    value={smsDrafts[i]}
                    onChange={e => setSmsDrafts(prev => ({ ...prev, [i]: e.target.value }))}
                    maxLength={160}
                    rows={3}
                    className="w-full bg-[#111827] border border-white/10 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500/40 resize-none placeholder:text-[#374151]"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[#4b5563] text-xs">{smsDrafts[i].length}/160</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSmsDrafts(prev => { const n = { ...prev }; delete n[i]; return n })}
                        className="text-xs text-[#4b5563] hover:text-white transition-colors px-2 py-1"
                      >
                        Dismiss
                      </button>
                      {tenant.phone ? (
                        <button
                          onClick={() => sendSms(i)}
                          disabled={sendingIdx === i || !smsDrafts[i].trim()}
                          className="text-xs bg-amber-500/15 border border-amber-500/25 text-amber-400 hover:bg-amber-500/25 transition-colors rounded-lg px-3 py-1 disabled:opacity-40"
                        >
                          {sendingIdx === i ? "Sending…" : "Send SMS"}
                        </button>
                      ) : (
                        <span className="text-xs text-[#4b5563] px-2 py-1">No phone on file</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                <Lightbulb size={11} className="text-amber-400" />
              </div>
              <div className="bg-white/[0.05] border border-white/[0.06] rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4b5563] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/[0.06] shrink-0">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="What did the tenant say? What's your situation?"
              className="flex-1 bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-40 flex items-center justify-center shrink-0"
            >
              <CornerDownRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PayOrQuitModal ────────────────────────────────────────────────────────────

function PayOrQuitModal({
  tenant,
  properties,
  onClose,
  onSmsSuccess,
}: {
  tenant: Tenant
  properties: { id: string; name: string; address?: string; state?: string }[]
  onClose: () => void
  onSmsSuccess: () => void
}) {
  const [landlordName, setLandlordName] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [sendingSms, setSendingSms] = useState(false)
  const [cfkMode, setCfkMode] = useState(false)
  const [activeTab, setActiveTab] = useState<"plan" | "poq" | "cfk">("plan")

  const monthsOwed = tenant.rent_amount > 0 ? tenant.balance_due / tenant.rent_amount : 0
  const showCfkTab = monthsOwed >= 2

  const prop = properties.find(p => p.id === tenant.properties?.id)
  const stateCode = (prop?.state ?? "").toUpperCase()
  const rule = stateCode ? STATE_RULES[stateCode] : null
  const address = prop?.address ?? ""
  const today = new Date().toISOString().split("T")[0]

  async function handleDownloadPDF() {
    if (!landlordName.trim()) {
      toast.error("Enter your name before downloading the notice.")
      return
    }
    setDownloading(true)
    try {
      await generatePayOrQuitPDF({
        tenantName: tenant.name,
        tenantUnit: tenant.unit,
        propertyAddress: address || prop?.name || "Property Address",
        propertyState: stateCode || "??",
        amountOwed: tenant.balance_due,
        landlordName: landlordName.trim(),
        servedDate: today,
      })
    } finally {
      setDownloading(false)
    }
  }

  async function handleSendSms(type: "legal_packet" | "cash_for_keys" = "legal_packet") {
    if (!tenant.phone) return
    setSendingSms(true)
    try {
      const res = await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          type,
          phone: tenant.phone,
          name: tenant.name,
          snapshot: buildSnapshot(tenant),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(type === "cash_for_keys" ? "Cash for Keys offer sent — intervention logged" : "SMS notice sent — intervention logged")
        onSmsSuccess()
        onClose()
      } else {
        toast.error(data.error || "Could not send SMS.")
      }
    } catch {
      toast.error("Could not send SMS.")
    } finally {
      setSendingSms(false)
    }
  }

  const smsBody = SMS_PREVIEWS[activeTab === "cfk" ? "cash_for_keys" : "legal_packet"]?.(tenant.name, tenant.balance_due) ?? ""
  const hasPhone = !!tenant.phone

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold text-base">
                {activeTab === "cfk" ? "Cash for Keys Offer" : activeTab === "plan" ? "Payment Plan Offer" : "Pay or Quit Notice"}
              </h3>
              <p className="text-[#4b5563] text-xs mt-0.5">
                {tenant.name} · <span className="text-red-400">${tenant.balance_due.toLocaleString()} owed</span>
                {showCfkTab && <span className="text-[#4b5563]"> · {Math.round(monthsOwed * 10) / 10} months</span>}
              </p>
            </div>
            <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* 3-tab system for 2+ months: Plan → PoQ → CFK */}
          {showCfkTab && (
            <div className="flex gap-1 mb-4 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
              <button
                onClick={() => setActiveTab("plan")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "plan" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-[#6b7280] hover:text-white"
                }`}
              >
                Payment Plan
              </button>
              <button
                onClick={() => setActiveTab("poq")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "poq" ? "bg-red-500/20 text-red-300 border border-red-500/30" : "text-[#6b7280] hover:text-white"
                }`}
              >
                Pay or Quit
              </button>
              <button
                onClick={() => setActiveTab("cfk")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === "cfk" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-[#6b7280] hover:text-white"
                }`}
              >
                Cash for Keys
              </button>
            </div>
          )}

          {/* Payment Plan tab */}
          {(showCfkTab && activeTab === "plan") && (() => {
            const installment = Math.ceil(tenant.balance_due / 2)
            const planSms = `Hi ${tenant.name}, your property manager would like to work with you on your outstanding balance of $${tenant.balance_due.toLocaleString()}. We can split this into 2 payments of $${installment.toLocaleString()}. Please contact us within 5 days to confirm this arrangement.`
            return (
              <div>
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3 mb-4">
                  <p className="text-amber-400 text-sm font-medium mb-1">Offer a Payment Plan First</p>
                  <p className="text-[#6b7280] text-xs leading-relaxed">
                    Before serving a legal notice, offer {tenant.name} a structured plan to pay the ${tenant.balance_due.toLocaleString()} balance in installments. Most tenants respond when given a realistic path.
                  </p>
                  <div className="mt-2 flex gap-4 text-xs">
                    <span className="text-amber-400/80">2 payments · ${installment.toLocaleString()} each</span>
                    <span className="text-[#4b5563]">or negotiate terms directly</span>
                  </div>
                </div>
                <div className="bg-[#0d1117] border border-white/5 rounded-xl p-3 mb-1">
                  <p className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1.5">SMS Preview</p>
                  <p className="text-[#d1d5db] text-xs leading-relaxed">{planSms}</p>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[#2e3a50] text-[10px]">{hasPhone ? tenant.phone : "No phone on file"}</span>
                  <span className="text-[#2e3a50] text-[10px]">{planSms.length} chars</span>
                </div>
                <div className="flex gap-3">
                  <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!tenant.phone) return
                      setSendingSms(true)
                      try {
                        const res = await fetch("/api/interventions", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ tenantId: tenant.id, type: "split_pay_offer", phone: tenant.phone, name: tenant.name, snapshot: buildSnapshot(tenant) }),
                        })
                        const data = await res.json()
                        if (data.ok) { toast.success("Payment plan offer sent"); onSmsSuccess(); onClose() }
                        else toast.error(data.error || "Could not send.")
                      } catch { toast.error("Could not send.") }
                      finally { setSendingSms(false) }
                    }}
                    disabled={sendingSms || !hasPhone}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send size={13} />
                    {sendingSms ? "Sending…" : "Send Payment Plan SMS"}
                  </button>
                </div>
                {!hasPhone && <p className="text-orange-400/70 text-[10px] mt-2 text-center">No phone on file — action will be logged only</p>}
                <p className="text-[#2e3a50] text-[10px] mt-3 text-center">If no response in 5 days, escalate to Pay or Quit or Cash for Keys</p>
              </div>
            )
          })()}

          {/* CFK tab */}
          {(!showCfkTab || activeTab === "cfk") && activeTab === "cfk" && (
            <div>
              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3 mb-4">
                <p className="text-emerald-400 text-sm font-medium mb-1">Offer Cash for Keys</p>
                <p className="text-[#6b7280] text-xs leading-relaxed">
                  Offer {tenant.name} ${Math.round((tenant.rent_amount ?? 0) * 0.5).toLocaleString()}–${Math.round((tenant.rent_amount ?? 0) * 1.0).toLocaleString()} to vacate voluntarily within 14 days.
                  Typically faster and cheaper than the {Math.round(monthsOwed * 10) / 10}-month eviction process.
                </p>
              </div>
              <div className="bg-[#0d1117] border border-white/5 rounded-xl p-3 mb-1">
                <p className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1.5">SMS Preview</p>
                <p className="text-[#d1d5db] text-xs leading-relaxed">{smsBody}</p>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[#2e3a50] text-[10px]">{hasPhone ? tenant.phone : "No phone on file"}</span>
                <span className="text-[#2e3a50] text-[10px]">{smsBody.length} chars</span>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => handleSendSms("cash_for_keys")}
                  disabled={sendingSms || !hasPhone}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Send size={13} />
                  {sendingSms ? "Sending…" : "Send CFK Offer SMS"}
                </button>
              </div>
              {!hasPhone && <p className="text-orange-400/70 text-[10px] mt-2 text-center">No phone on file — action will be logged only</p>}
            </div>
          )}

          {/* Pay or Quit tab (original content) — shown when: no tabs (single month) OR poq tab active */}
          {(!showCfkTab || activeTab === "poq") && (
            <>
          {/* State notice type */}
          {rule ? (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 mb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium leading-snug">{rule.title}</p>
                  <p className="text-[#6b7280] text-xs mt-0.5">{rule.legalText}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-[#9ca3af] border border-white/10 shrink-0">{stateCode}</span>
              </div>
              <p className="text-[#4b5563] text-xs mt-2 leading-relaxed">{rule.serviceNote}</p>
            </div>
          ) : (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 mb-4">
              <p className="text-orange-400 text-sm">No state configured for this property.</p>
              <p className="text-[#6b7280] text-xs mt-1">Add a state in Settings → Properties to get state-specific notice language.</p>
            </div>
          )}

          {/* Landlord name */}
          <div className="mb-4">
            <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Your name (landlord / property manager)</label>
            <input
              type="text"
              value={landlordName}
              onChange={e => setLandlordName(e.target.value)}
              placeholder="e.g. John Smith"
              autoFocus
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
            />
          </div>

          {/* PDF download */}
          <button
            onClick={handleDownloadPDF}
            disabled={downloading || !landlordName.trim()}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-40 flex items-center justify-center gap-2 mb-1"
          >
            <Download size={13} />
            {downloading ? "Generating PDF…" : "Download Pay or Quit PDF"}
          </button>
          <p className="text-[#2e3a50] text-[10px] mb-5 text-center">Print and serve to tenant per the instructions above</p>

          {/* SMS preview */}
          <div className="bg-[#0d1117] border border-white/5 rounded-xl p-3 mb-1">
            <p className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1.5">SMS Notification Preview</p>
            <p className="text-[#d1d5db] text-xs leading-relaxed">{smsBody}</p>
          </div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-[#2e3a50] text-[10px]">{hasPhone ? tenant.phone : "No phone on file"}</span>
            <span className="text-[#2e3a50] text-[10px]">{smsBody.length} chars</span>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => handleSendSms("legal_packet")}
              disabled={sendingSms || !hasPhone}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              title={!hasPhone ? "No phone number on file" : undefined}
            >
              <Send size={13} />
              {sendingSms ? "Sending…" : "Send SMS Notice"}
            </button>
          </div>
          {!hasPhone && (
            <p className="text-orange-400/70 text-[10px] mt-2 text-center">No phone number on file — PDF only</p>
          )}
          <p className="text-[#2e3a50] text-[10px] mt-3 text-center">
            Most tenants pay within 7 days of receiving this notice
          </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── CashForKeysOutcomeModal ───────────────────────────────────────────────────

const CFK_OUTCOMES = [
  {
    key: "cfk_accepted",
    label: "Accepted",
    desc: "Tenant agreed to move out",
    color: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    dot: "bg-emerald-500",
  },
  {
    key: "cfk_declined",
    label: "Declined",
    desc: "Tenant refused the offer",
    color: "bg-red-500/10 border-red-500/25 text-red-400",
    dot: "bg-red-500",
  },
  {
    key: "cfk_in_discussion",
    label: "In Discussion",
    desc: "Negotiation ongoing",
    color: "bg-blue-500/10 border-blue-500/25 text-blue-400",
    dot: "bg-blue-400",
  },
  {
    key: "cfk_switched",
    label: "Switched Strategy",
    desc: "Moving to Pay or Quit / legal",
    color: "bg-orange-500/10 border-orange-500/25 text-orange-400",
    dot: "bg-orange-500",
  },
  {
    key: "cfk_paused",
    label: "Pause",
    desc: "Waiting on tenant follow-up",
    color: "bg-white/5 border-white/10 text-[#6b7280]",
    dot: "bg-[#4b5563]",
  },
] as const

type CfkOutcomeKey = typeof CFK_OUTCOMES[number]["key"]

const CFK_OUTCOME_CONFIG: Record<CfkOutcomeKey, {
  badge: string
  badgeStyle: string
  dot: string
  nextStep: string
}> = {
  cfk_accepted:      { badge: "Move-out Scheduled",      badgeStyle: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500", nextStep: "Document the agreement and confirm move-out date in writing." },
  cfk_declined:      { badge: "Escalation Recommended",  badgeStyle: "bg-red-500/10 text-red-400 border-red-500/20",            dot: "bg-red-500",     nextStep: "Tenant declined — send Pay or Quit notice to escalate." },
  cfk_in_discussion: { badge: "In Discussion",           badgeStyle: "bg-blue-500/10 text-blue-400 border-blue-500/20",         dot: "bg-blue-400",    nextStep: "Negotiation ongoing — check back within 48 hours." },
  cfk_switched:      { badge: "Strategy Changed",        badgeStyle: "bg-orange-500/10 text-orange-400 border-orange-500/20",   dot: "bg-orange-500",  nextStep: "Switched to escalation — send Pay or Quit notice." },
  cfk_paused:        { badge: "Awaiting Response",       badgeStyle: "bg-white/5 text-[#6b7280] border-white/10",               dot: "bg-[#4b5563]",   nextStep: "Automation paused — waiting on tenant follow-up." },
}

function CashForKeysOutcomeModal({
  tenant,
  onClose,
  onOutcomeSet,
}: {
  tenant: Tenant
  onClose: () => void
  onOutcomeSet: (outcome: CfkOutcomeKey) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)

  async function selectOutcome(key: CfkOutcomeKey, label: string) {
    setSaving(key)
    try {
      // Update resolution_status
      const res = await fetch("/api/tenants/resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, resolution_status: key }),
      })
      if (!res.ok) throw new Error()

      // Log as intervention
      await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          type: `cfk_outcome_${key.replace("cfk_", "")}`,
          snapshot: buildSnapshot(tenant),
        }),
      })

      toast.success(`Outcome logged: ${label}`)
      onOutcomeSet(key)
      onClose()
    } catch {
      toast.error("Could not save outcome.")
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold text-sm">Cash for Keys — Update Outcome</h3>
              <p className="text-[#4b5563] text-xs mt-0.5">{tenant.name} · Unit {tenant.unit}</p>
            </div>
            <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>

          <div className="space-y-2">
            {CFK_OUTCOMES.map(outcome => (
              <button
                key={outcome.key}
                onClick={() => selectOutcome(outcome.key, outcome.label)}
                disabled={saving !== null}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left disabled:opacity-50 hover:opacity-90 ${outcome.color}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${outcome.dot}`} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight">
                    {saving === outcome.key ? "Saving…" : outcome.label}
                  </div>
                  <div className="text-xs opacity-70 mt-0.5">{outcome.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TenantCard ────────────────────────────────────────────────────────────────

function TenantCard({
  t,
  properties,
  autoStatus,
  systemMsg,
  onTogglePause,
  onPaymentRecorded,
  onActionExecuted,
}: {
  t: Tenant
  properties: { id: string; name: string; address?: string; state?: string }[]
  autoStatus: AutoStatus
  systemMsg: { primary: string; secondary?: string; reason?: string }
  onTogglePause: () => void
  onPaymentRecorded: () => void
  onActionExecuted: () => void
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [editing, setEditing] = useState(false)
  const [payOrQuitOpen, setPayOrQuitOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [cfkOutcomeOpen, setCfkOutcomeOpen] = useState(false)
  const [localCfkOutcome, setLocalCfkOutcome] = useState<CfkOutcomeKey | null>(null)

  // Derive CFK outcome state — local override takes priority over DB value
  const cfkOutcomeKey = (localCfkOutcome ?? t.resolution_status ?? null) as CfkOutcomeKey | null
  const isCfkWithOutcome = t.tier === "cash_for_keys" && cfkOutcomeKey?.startsWith("cfk_")
  const isCfkSent = t.tier === "cash_for_keys" && (autoStatus === "sent" || isCfkWithOutcome)
  const cfkOutcomeCfg = cfkOutcomeKey && isCfkWithOutcome ? CFK_OUTCOME_CONFIG[cfkOutcomeKey] : null

  // Optimistic state: immediately transition to "queued" after PM approves action,
  // then server refresh will confirm with "sent" from DB (clearing this override).
  const [localStatus, setLocalStatus] = useState<AutoStatus | null>(null)
  const [localSentAt, setLocalSentAt] = useState<string | null>(null)
  // Clear optimistic override whenever the server-derived status changes
  const prevAutoStatus = localStatus !== null ? localStatus : autoStatus
  if (localStatus !== null && autoStatus !== prevAutoStatus) setLocalStatus(null)

  const effectiveStatus = localStatus ?? autoStatus
  const effectiveSystemMsg: typeof systemMsg =
    localStatus === "queued"
      ? { primary: "Sending now · notification in progress" }
      : localStatus === "sent" && localSentAt
      ? { primary: `Sent ${formatSentTime(localSentAt)}`, secondary: "Awaiting tenant response" }
      : systemMsg

  const config = TIER_CONFIG[t.tier]
  const statusCfg = AUTO_STATUS_CONFIG[effectiveStatus]
  const isPaused = effectiveStatus === "paused"
  const isSent = effectiveStatus === "sent"
  const hasBalance = (t.balance_due ?? 0) > 0
  // "Review & Send" only applies to tiers requiring PM approval, not already sent/queued/paused
  const canReviewSend = t.action_type && effectiveStatus === "needs_review"

  async function trigger(type: string) {
    setLoading(type)
    setPendingAction(null)
    try {
      const res = await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: t.id, type, phone: t.phone, name: t.name, snapshot: buildSnapshot(t) }),
      })
      const data = await res.json()
      if (data.ok) {
        // Optimistic: show Queued immediately, server refresh will confirm Sent from DB
        const sentNow = new Date().toISOString()
        setLocalStatus("queued")
        setLocalSentAt(sentNow)
        toast.success(ACTION_QUEUED_TOAST[type] ?? "Action queued")
        onActionExecuted()   // triggers router.refresh() → card transitions to Sent once DB updates
      } else {
        toast.error(data.error || "Something went wrong.")
      }
    } catch {
      toast.error("Could not send action.")
    } finally {
      setLoading(null)
    }
  }

  function requestAction(type: string) {
    // Pay or Quit gets its own modal (PDF + SMS combined)
    if (t.tier === "pay_or_quit") { setPayOrQuitOpen(true); return }
    if (SMS_PREVIEWS[type]) setPendingAction(type)
    else trigger(type)
  }

  // Next action text comes from effectiveSystemMsg (optimistic-aware)
  const nextActionText = effectiveSystemMsg.primary

  return (
    <>
      {pendingAction && (
        <PreviewModal
          tenant={t}
          actionType={pendingAction}
          onConfirm={() => trigger(pendingAction)}
          onCancel={() => setPendingAction(null)}
          loading={loading !== null}
        />
      )}
      {editing && (
        <TenantFormModal
          mode="edit"
          properties={properties}
          initial={{
            id: t.id, name: t.name, email: t.email, phone: t.phone,
            unit: t.unit, property_id: t.properties?.id ?? "",
            rent_amount: String(t.rent_amount ?? ""), balance_due: String(t.balance_due ?? ""),
            payment_method: t.payment_method ?? "unknown", card_expiry: t.card_expiry ?? "",
            last_payment_date: t.last_payment_date ?? "",
            days_late_avg: String(t.days_late_avg ?? 0),
            late_payment_count: String(t.late_payment_count ?? 0),
            previous_delinquency: t.previous_delinquency ?? false,
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {markingPaid && (
        <MarkPaidModal
          tenant={t}
          onClose={() => setMarkingPaid(false)}
          onSuccess={() => { setMarkingPaid(false); onPaymentRecorded() }}
        />
      )}
      {payOrQuitOpen && (
        <PayOrQuitModal
          tenant={t}
          properties={properties}
          onClose={() => setPayOrQuitOpen(false)}
          onSmsSuccess={() => {
            const sentNow = new Date().toISOString()
            setLocalStatus("queued")
            setLocalSentAt(sentNow)
            onActionExecuted()
          }}
        />
      )}
      {aiOpen && (
        <TenantAIModal tenant={t} onClose={() => setAiOpen(false)} />
      )}
      {cfkOutcomeOpen && (
        <CashForKeysOutcomeModal
          tenant={t}
          onClose={() => setCfkOutcomeOpen(false)}
          onOutcomeSet={(key) => { setLocalCfkOutcome(key); onActionExecuted() }}
        />
      )}

      <div className={`bg-[#111827] border border-white/[0.08] hover:border-white/[0.13] rounded-2xl p-5 transition-all hover:shadow-lg hover:shadow-black/20 ${statusCfg.opacity}`}>

        {/* ── Row 1: Identity + Financials ───────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 mb-3.5">
          {/* Left: avatar + name + location */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-full ${avatarColor(t.name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
              {initials(t.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-[15px] leading-tight truncate">{t.name}</span>
                <button
                  onClick={() => setEditing(true)}
                  className="text-[#374151] hover:text-[#6b7280] transition-colors shrink-0"
                  title="Edit tenant"
                >
                  <Pencil size={11} />
                </button>
              </div>
              <div className="text-[#4b5563] text-xs mt-0.5 truncate">
                {t.properties?.name ? `${t.properties.name} · ` : ""}Unit {t.unit}
              </div>
            </div>
          </div>

          {/* Right: rent + balance (balance dominates when present) */}
          <div className="text-right shrink-0">
            {hasBalance ? (
              <>
                <div className="text-red-400 text-base font-bold tabular-nums leading-tight">
                  ${t.balance_due.toLocaleString()} owed
                </div>
                <div className="text-[#4b5563] text-xs tabular-nums">${t.rent_amount?.toLocaleString()}/mo</div>
              </>
            ) : (
              <div className="text-white font-semibold tabular-nums text-sm">
                ${t.rent_amount?.toLocaleString()}<span className="text-[#4b5563] font-normal">/mo</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: Status badges (max 2) ────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-3">
          {cfkOutcomeCfg ? (
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${cfkOutcomeCfg.badgeStyle}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfkOutcomeCfg.dot}`} />
              {cfkOutcomeCfg.badge}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${statusCfg.badgeStyle}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusCfg.dot}`} />
              {isCfkSent && !cfkOutcomeCfg ? "Cash for Keys — In Progress" : statusCfg.label}
            </span>
          )}
          {t.tier !== "healthy" && !cfkOutcomeCfg && (
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${config.badgeStyle}`}>
              {config.badge}
            </span>
          )}
          {t.tier === "cash_for_keys" && (
            <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-orange-500/10 text-orange-400 border-orange-500/20">
              Cash for Keys
            </span>
          )}
        </div>

        {/* ── Row 3: Problem summary — one line ───────────────────────────────── */}
        <ProblemLine t={t} />

        {/* ── Row 4: Next action box ───────────────────────────────────────────── */}
        {nextActionText && (
          <div className={`rounded-lg px-3 py-2.5 mb-3 border ${
            effectiveStatus === "needs_review" && canReviewSend
              ? "border-blue-500/20 bg-blue-500/[0.04]"
              : "border-white/[0.06] bg-white/[0.02]"
          }`}>
            <div className="text-[#d1d5db] text-xs font-medium">{nextActionText}</div>
            {/* "Prepared based on" — only shown for needs_review */}
            {effectiveStatus === "needs_review" && canReviewSend && (() => {
              const prepared = buildPreparedLine(t)
              return prepared ? (
                <div className="text-[#4b5563] text-[11px] mt-1">
                  Prepared based on: {prepared}
                </div>
              ) : null
            })()}
            {effectiveSystemMsg.secondary && (
              <div className="text-[#4b5563] text-[11px] mt-0.5">{effectiveSystemMsg.secondary}</div>
            )}
            {effectiveSystemMsg.reason && (
              <div className="text-[#374151] text-[10px] mt-1 uppercase tracking-wide">
                Why: {effectiveSystemMsg.reason}
              </div>
            )}
            {/* Passive reminder — shown for high-urgency tiers sitting unactioned */}
            {effectiveStatus === "needs_review" && canReviewSend &&
              (t.tier === "legal" || (t.tier === "pay_or_quit" && t.days_past_due >= 10)) && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-orange-400/70">
                <span className="w-1 h-1 rounded-full bg-orange-400/70 shrink-0" />
                No action taken — risk increasing
              </div>
            )}
          </div>
        )}

        {/* ── Row 4b: CFK outcome next step ───────────────────────────────────── */}
        {cfkOutcomeCfg && (
          <div className="rounded-lg px-3 py-2.5 mb-3 border border-white/[0.06] bg-white/[0.02]">
            <div className="text-[#d1d5db] text-xs font-medium">{cfkOutcomeCfg.nextStep}</div>
          </div>
        )}

        {/* ── Row 5: Actions ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          {/* CFK sent/outcome: show Update Outcome instead of Review & Send */}
          {isCfkSent && (
            <button
              onClick={() => setCfkOutcomeOpen(true)}
              className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20"
            >
              <HandCoins size={12} />
              Update Outcome
            </button>
          )}

          {/* Primary: Review & Send (tier-specific label) — only if NOT in CFK sent state */}
          {canReviewSend && !isCfkSent && (
            <button
              onClick={() => requestAction(t.action_type)}
              disabled={loading !== null}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${config.buttonStyle}`}
            >
              <Send size={12} />
              {loading ? "Sending…" : (REVIEW_BUTTON_LABEL[t.tier] ?? "Review & Send")}
            </button>
          )}

          {/* Secondary: Mark Paid */}
          {hasBalance && !isPaused && !isSent && (
            <button
              onClick={() => setMarkingPaid(true)}
              className={`py-2 rounded-xl text-sm font-semibold transition-all bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25 border border-emerald-500/20 flex items-center justify-center gap-1.5 ${canReviewSend ? "px-3" : "flex-1"}`}
            >
              <DollarSign size={12} /> Mark Paid
            </button>
          )}

          {/* Spacer when no primary or secondary */}
          {!canReviewSend && !hasBalance && <div className="flex-1" />}

          {/* AI Advisor */}
          <button
            onClick={() => setAiOpen(true)}
            className="w-8 h-8 rounded-xl text-amber-400/60 bg-amber-500/5 hover:bg-amber-500/15 border border-amber-500/10 hover:border-amber-500/20 transition-colors flex items-center justify-center shrink-0"
            title="AI advisor — ask about this tenant"
          >
            <Lightbulb size={12} />
          </button>

          {/* Tertiary: Pause / Resume */}
          <button
            onClick={onTogglePause}
            className="w-8 h-8 rounded-xl text-[#4b5563] bg-white/5 hover:bg-white/10 border border-white/5 transition-colors flex items-center justify-center shrink-0"
            title={isPaused ? "Resume automation" : "Pause automation"}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
          </button>

          {/* Details link */}
          <Link
            href={`/dashboard/tenants/${t.id}`}
            className="text-[#374151] hover:text-[#6b7280] text-xs transition-colors whitespace-nowrap flex items-center gap-0.5 px-1"
          >
            Details <ArrowRight size={10} />
          </Link>
        </div>

        {/* After-send helper — only shown for needs_review before any click */}
        {canReviewSend && effectiveStatus === "needs_review" && AFTER_SEND_LABEL[t.tier] && (
          <p className="text-[#374151] text-[10px] mt-2.5 text-center">
            {AFTER_SEND_LABEL[t.tier]}
          </p>
        )}

      </div>
    </>
  )
}

// ── HandleAllReviewModal ──────────────────────────────────────────────────────

function HandleAllReviewModal({
  tier,
  tenants,
  onDone,
  onCancel,
}: {
  tier: RiskTier
  tenants: Tenant[]
  onDone: () => void
  onCancel: () => void
}) {
  const config = TIER_CONFIG[tier]
  const [checked, setChecked] = useState<Set<string>>(new Set(tenants.map(t => t.id)))
  const [executing, setExecuting] = useState(false)

  const allChecked = checked.size === tenants.length
  const noneChecked = checked.size === 0

  function toggleAll() {
    if (allChecked) setChecked(new Set())
    else setChecked(new Set(tenants.map(t => t.id)))
  }

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function execute() {
    if (noneChecked) return
    setExecuting(true)
    const selected = tenants.filter(t => checked.has(t.id))
    await Promise.all(
      selected.map(t =>
        fetch("/api/interventions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: t.id,
            type: config.actionType,
            phone: t.phone,
            name: t.name,
            snapshot: buildSnapshot(t),
          }),
        })
      )
    )
    setExecuting(false)
    toast.success(`${selected.length} notice${selected.length !== 1 ? "s" : ""} queued — snapshots saved to history.`)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">Review Before Executing</h2>
            <p className="text-[#4b5563] text-xs mt-1 leading-relaxed">
              {tenants.length} {config.label.toLowerCase()} action{tenants.length !== 1 ? "s" : ""} prepared by system.
              Uncheck any tenant you want to skip.
            </p>
          </div>
          <button onClick={onCancel} className="text-[#4b5563] hover:text-white transition-colors ml-4 shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-white/5 shrink-0 flex items-center justify-between">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="w-4 h-4 rounded accent-blue-500"
            />
            <span className="text-[#9ca3af] text-sm">
              {allChecked ? "Deselect all" : `Select all (${tenants.length})`}
            </span>
          </label>
          <span className="text-[#374151] text-xs">{checked.size} of {tenants.length} selected</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {tenants.map(t => {
            const isChecked = checked.has(t.id)
            return (
              <label
                key={t.id}
                className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                  isChecked
                    ? "bg-[#0d1628] border-blue-500/20"
                    : "bg-[#0d1117] border-white/5 opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(t.id)}
                  className="w-4 h-4 rounded accent-blue-500 shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <span className="text-white font-semibold text-sm">{t.name}</span>
                      <span className="text-[#4b5563] text-xs ml-2">
                        Unit {t.unit}{t.properties?.name ? ` · ${t.properties.name}` : ""}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${config.badgeStyle}`}>
                      {config.badge}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs mb-2">
                    <span className="text-white font-medium tabular-nums">${t.rent_amount?.toLocaleString()}/mo</span>
                    {t.balance_due > 0 && (
                      <span className="text-red-400 font-semibold">+${t.balance_due.toLocaleString()} owed</span>
                    )}
                    {t.days_past_due > 0 && (
                      <span className="text-orange-400">{t.days_past_due}d past due</span>
                    )}
                  </div>
                  {t.reasons.length > 0 && (
                    <div className="space-y-0.5 mb-2">
                      {t.reasons.slice(0, 2).map((r, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[#6b7280] text-xs">
                          <span className="w-1 h-1 rounded-full bg-[#374151] shrink-0 mt-1.5" />
                          {r}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[#374151] text-xs flex items-center gap-1.5">
                    <ArrowRight size={10} />
                    System will execute: <span className="text-[#4b5563]">{config.badge}</span>
                    {t.email && <span>· to {t.email}</span>}
                  </div>
                  {config.requiresLegalWarning && (
                    <div className="flex items-center gap-1.5 text-orange-400/70 text-xs mt-1.5">
                      <Scale size={10} />
                      Attorney review recommended before sending
                    </div>
                  )}
                </div>
              </label>
            )
          })}
        </div>

        <div className="p-6 border-t border-white/5 shrink-0">
          <p className="text-[#2e3a50] text-xs mb-4">
            Risk snapshot will be saved to each tenant&apos;s history at the moment of execution — permanently viewable on their detail page.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={execute}
              disabled={executing || noneChecked}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Zap size={13} />
              {executing ? "Executing…" : `Approve & Execute ${checked.size} Action${checked.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-group header ──────────────────────────────────────────────────────────

function SubGroupHeader({ status, count }: { status: AutoStatus; count: number }) {
  const cfg = AUTO_STATUS_CONFIG[status]
  return (
    <div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot.replace(" animate-pulse", "")}`} />
      <span className={`text-xs font-medium ${cfg.textColor}`}>{cfg.label}</span>
      <span className="text-[#2e3a50] text-xs">({count})</span>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

const SUB_GROUP_ORDER: AutoStatus[] = ["needs_review", "queued", "sent", "paused"]

function buildSectionSummary(
  total: number,
  needsReview: number,
  queued: number,
  sent: number,
  avgDaysPastDue: number,
  requiresLegal: boolean,
): string {
  const parts: string[] = []
  if (needsReview > 0) parts.push(`${needsReview} need${needsReview === 1 ? "s" : ""} review`)
  if (queued > 0)      parts.push(`${queued} scheduled`)
  if (sent > 0)        parts.push(`${sent} sent this month`)
  if (parts.length === 0 && total > 0) parts.push(`${total} tenant${total === 1 ? "" : "s"}`)
  if (avgDaysPastDue > 0) parts.push(`avg ${avgDaysPastDue}d past due`)
  if (requiresLegal)   parts.push("attorney review required")
  return parts.join(" · ")
}

function Section({
  tier,
  tenants,
  properties,
  recentActivity,
  pausedTenants,
  onTogglePause,
  showSubGroups,
  onPaymentRecorded,
  onActionExecuted,
  autoMode,
}: {
  tier: RiskTier
  tenants: Tenant[]
  properties: { id: string; name: string; address?: string; state?: string }[]
  recentActivity: RecentActivity[]
  pausedTenants: Set<string>
  onTogglePause: (id: string) => void
  showSubGroups: boolean
  onPaymentRecorded: () => void
  onActionExecuted: () => void
  autoMode: boolean
}) {
  const config = TIER_CONFIG[tier]
  const [showReviewModal, setShowReviewModal] = useState(false)

  const avgDaysPastDue = tenants.filter(t => t.days_past_due > 0).length > 0
    ? Math.round(
        tenants.filter(t => t.days_past_due > 0).reduce((s, t) => s + t.days_past_due, 0) /
        tenants.filter(t => t.days_past_due > 0).length
      )
    : 0

  const withStatus = tenants.map(t => {
    const autoStatus = getAutoStatus(t, recentActivity, pausedTenants, autoMode)
    return {
      t,
      autoStatus,
      systemMsg: getSystemMessage(t, autoStatus, recentActivity, autoMode),
    }
  })

  const statusGroups = SUB_GROUP_ORDER.map(status => ({
    status,
    items: withStatus.filter(x => x.autoStatus === status),
  })).filter(g => g.items.length > 0)

  const hasMultipleStatuses = statusGroups.length > 1
  const needsReviewCount = withStatus.filter(x => x.autoStatus === "needs_review").length
  const queuedCount      = withStatus.filter(x => x.autoStatus === "queued").length
  const sentCount        = withStatus.filter(x => x.autoStatus === "sent").length

  const summaryText = buildSectionSummary(
    tenants.length,
    needsReviewCount,
    queuedCount,
    sentCount,
    avgDaysPastDue,
    config.requiresLegalWarning,
  )

  return (
    <div className="mb-10">
      {showReviewModal && (
        <HandleAllReviewModal
          tier={tier}
          tenants={tenants}
          onDone={() => { setShowReviewModal(false); onActionExecuted() }}
          onCancel={() => setShowReviewModal(false)}
        />
      )}

      {/* Section header */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${config.dot} shrink-0`} />
            <h2 className="text-white font-semibold text-base">{config.sectionHeader}</h2>
            <span className="text-[#4b5563] text-sm font-normal">({tenants.length})</span>
          </div>
          {summaryText && (
            <p className="text-[#374151] text-xs mt-1 ml-5 leading-relaxed">{summaryText}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!config.requiresLegalWarning && config.actionType && (
            <button
              onClick={() => setShowReviewModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
            >
              <Zap size={11} /> Handle All
            </button>
          )}
          <Link
            href={`/dashboard/tenants/${tenants[0]?.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6b7280] bg-white/5 hover:bg-white/10 border border-white/5 transition-colors"
          >
            Review First <ArrowRight size={11} />
          </Link>
        </div>
      </div>

      {/* Tenant grid — with optional sub-groups */}
      {showSubGroups && hasMultipleStatuses ? (
        <div>
          {statusGroups.map(group => (
            <div key={group.status}>
              <SubGroupHeader status={group.status} count={group.items.length} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-2">
                {group.items.map(({ t, autoStatus, systemMsg }) => (
                  <TenantCard
                    key={t.id}
                    t={t}
                    properties={properties}
                    autoStatus={autoStatus}
                    systemMsg={systemMsg}
                    onTogglePause={() => onTogglePause(t.id)}
                    onPaymentRecorded={onPaymentRecorded}
                    onActionExecuted={onActionExecuted}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {withStatus.map(({ t, autoStatus, systemMsg }) => (
            <TenantCard
              key={t.id}
              t={t}
              properties={properties}
              autoStatus={autoStatus}
              systemMsg={systemMsg}
              onTogglePause={() => onTogglePause(t.id)}
              onPaymentRecorded={onPaymentRecorded}
              onActionExecuted={onActionExecuted}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── TenantBoard ───────────────────────────────────────────────────────────────

export default function TenantBoard({ tenants, properties, recentActivity, paymentsThisMonth, autoMode, landlordEmail }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [propertyFilter, setPropertyFilter] = useState("")
  const [activeFilter, setActiveFilter] = useState<FilterKey>("needs_review")
  const [pausedTenants, setPausedTenants] = useState<Set<string>>(new Set())
  const [addingTenant, setAddingTenant] = useState(false)

  function handlePaymentRecorded() { router.refresh() }
  function handleActionExecuted() { router.refresh() }

  function togglePause(id: string) {
    setPausedTenants(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Apply search + property filter
  let filtered = tenants
  if (propertyFilter) filtered = filtered.filter(t => t.properties?.id === propertyFilter)
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.unit?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q)
    )
  }

  // Compute auto status for every tenant
  const autoStatusMap = new Map<string, AutoStatus>(
    filtered.map(t => [t.id, getAutoStatus(t, recentActivity, pausedTenants, autoMode)])
  )

  // Filter counts (always computed on full filtered set, not view-filtered)
  // Paused tenants are excluded from all other counts — they only appear under "Paused"
  const counts: Record<FilterKey, number> = {
    all:          filtered.filter(t => t.tier !== "healthy" && autoStatusMap.get(t.id) !== "paused").length,
    needs_review: filtered.filter(t => autoStatusMap.get(t.id) === "needs_review").length,
    queued:       filtered.filter(t => autoStatusMap.get(t.id) === "queued").length,
    sent:         filtered.filter(t => autoStatusMap.get(t.id) === "sent").length,
    paused:       filtered.filter(t => autoStatusMap.get(t.id) === "paused").length,
  }

  // Portfolio stats for summary strip
  const recoveredThisMonth = paymentsThisMonth.reduce((sum, p) => sum + (p.amount ?? 0), 0)

  const portfolioStats: PortfolioStats = {
    needsReview: counts.needs_review,
    queued: counts.queued,
    sent: counts.sent,
    paused: counts.paused,
    revenueProtected: filtered
      .filter(t => {
        const s = autoStatusMap.get(t.id)
        return s === "queued" || s === "sent"
      })
      .reduce((sum, t) => sum + (t.rent_amount ?? 0), 0),
    recoveredThisMonth,
    lastActivityAt: recentActivity.length > 0 ? recentActivity[0].sent_at : null,
  }

  // Apply automation status filter to tenant list
  // "All" excludes healthy and paused — paused only surfaces under the Paused tab
  const visibleTenants = activeFilter === "all"
    ? filtered.filter(t => t.tier !== "healthy" && autoStatusMap.get(t.id) !== "paused")
    : filtered.filter(t => autoStatusMap.get(t.id) === activeFilter)

  const byTier = (tier: RiskTier) => visibleTenants.filter(t => t.tier === tier)
  const activeSections = SECTION_ORDER.filter(tier => byTier(tier).length > 0)
  const healthy = filtered.filter(t => t.tier === "healthy")

  // Filter-specific empty state copy
  const FILTER_EMPTY: Record<FilterKey, string> = {
    all:          "No active automation issues in your portfolio.",
    needs_review: "Nothing currently requires manual review. The system is handling everything.",
    queued:       "No tenants are currently scheduled for automated actions.",
    sent:         "No automated messages sent yet this month.",
    paused:       "No tenant automations are paused.",
  }

  return (
    <div>
      {addingTenant && (
        <TenantFormModal
          mode="add"
          properties={properties}
          onClose={() => setAddingTenant(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenants</h1>
          <p className="text-[#6b7280] text-sm mt-0.5">
            {filtered.length} active ·{" "}
            {counts.needs_review > 0 && <span className="text-red-400">{counts.needs_review} need review · </span>}
            {counts.queued > 0 && <span className="text-blue-400">{counts.queued} scheduled · </span>}
            {counts.sent > 0 && <span className="text-emerald-400">{counts.sent} sent · </span>}
            <span className="text-emerald-400">{healthy.length} healthy</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b5563]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tenants…"
              className="bg-[#111827] border border-white/10 text-white text-sm rounded-xl pl-9 pr-8 py-2 w-52 placeholder:text-[#4b5563] focus:outline-none focus:border-white/20"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-white">
                <X size={13} />
              </button>
            )}
          </div>

          {properties.length > 1 && (
            <select
              value={propertyFilter}
              onChange={e => setPropertyFilter(e.target.value)}
              className="bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-white/20"
            >
              <option value="">All Properties</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <button
            onClick={() => setAddingTenant(true)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Plus size={14} /> Add Tenant
          </button>

          <Link
            href="/dashboard/upload"
            className="flex items-center gap-2 bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            <Upload size={14} /> Upload Rent Roll
          </Link>
        </div>
      </div>

      {/* Portfolio summary strip */}
      <PortfolioSummaryStrip stats={portfolioStats} />

      {/* Filter bar */}
      <div className="mb-8">
        <FilterBar active={activeFilter} counts={counts} onChange={setActiveFilter} />
      </div>

      {/* Empty state — no tenants at all */}
      {filtered.length === 0 && (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-16 text-center">
          {tenants.length === 0 ? (
            <>
              <p className="text-white font-semibold mb-1">No tenants yet</p>
              <p className="text-[#6b7280] text-sm mb-4">Upload a rent roll and let automation take over.</p>
              <Link href="/dashboard/upload" className="text-[#60a5fa] hover:underline text-sm">Upload Rent Roll →</Link>
            </>
          ) : (
            <p className="text-[#6b7280]">No tenants match your search.</p>
          )}
        </div>
      )}

      {/* Empty state — filter has no results */}
      {filtered.length > 0 && activeSections.length === 0 && activeFilter !== "all" && (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-10 text-center">
          {activeFilter === "needs_review" ? (
            <>
              <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={17} className="text-emerald-400" />
              </div>
              <p className="text-white font-semibold mb-1">Nothing needs review right now</p>
            </>
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
              <TrendingUp size={17} className="text-[#4b5563]" />
            </div>
          )}
          {activeFilter !== "needs_review" && (
            <p className="text-white font-semibold mb-1">No tenants in this category</p>
          )}
          <p className="text-[#6b7280] text-sm">{FILTER_EMPTY[activeFilter]}</p>
          <button
            onClick={() => setActiveFilter("all")}
            className="mt-4 text-[#60a5fa] hover:underline text-sm"
          >
            View all active tenants →
          </button>
        </div>
      )}

      {/* Active sections */}
      {activeSections.map(tier => (
        <Section
          key={tier}
          tier={tier}
          tenants={byTier(tier)}
          properties={properties}
          recentActivity={recentActivity}
          pausedTenants={pausedTenants}
          onTogglePause={togglePause}
          showSubGroups={activeFilter === "all"}
          onPaymentRecorded={handlePaymentRecorded}
          onActionExecuted={handleActionExecuted}
          autoMode={autoMode}
        />
      ))}

      {/* Healthy summary row */}
      {healthy.length > 0 && (activeFilter === "all" || activeFilter === "sent" || activeFilter === "paused") && (
        <div className="flex items-center gap-2 mt-2 px-1 py-4 border-t border-white/5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-[#4b5563] text-sm">
            {healthy.length} tenant{healthy.length !== 1 ? "s" : ""} on track — system monitoring, no action required
          </span>
        </div>
      )}

      {/* All healthy — full portfolio clean */}
      {activeSections.length === 0 && healthy.length > 0 && activeFilter === "all" && (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-10 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
            <ShieldAlert size={18} className="text-emerald-400" />
          </div>
          <p className="text-white font-semibold mb-1">System is running — all {healthy.length} tenants on track</p>
          <p className="text-[#6b7280] text-sm">No action required. Automation will alert you if anything changes.</p>
        </div>
      )}
    </div>
  )
}
