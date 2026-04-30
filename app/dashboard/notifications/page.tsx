import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import {
  Bell, AlertTriangle, CalendarClock, PhoneMissed,
  FileWarning, Clock, CreditCard, CheckCircle2, ChevronRight, Inbox,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = "urgent" | "action" | "monitor"

interface ActionNotification {
  id: string
  severity: Severity
  notifType: string
  tenantId: string
  tenantName: string
  tenantUnit: string
  propertyName?: string | null
  title: string
  description: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 86400000
}
function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}
function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function timeAgo(iso: string) {
  const h = Math.floor(daysSince(iso) * 24)
  if (h < 1) return "just now"
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

const INTERVENTION_LABELS: Record<string, string> = {
  payment_reminder:           "Payment reminder sent",
  proactive_reminder:         "Proactive reminder sent",
  payment_method_alert:       "Payment method alert sent",
  pre_due_delinquent_warning: "Pre-due balance warning sent",
  pre_due_urgent:             "Urgent pre-due reminder sent",
  split_pay_offer:            "Payment plan offered",
  cash_for_keys:              "Cash for Keys offered",
  legal_packet:               "Legal notice sent",
  hardship_checkin:           "Hardship check-in logged",
  call_logged:                "Call logged",
  payment_plan_agreed:        "Payment plan agreed",
  custom_sms:                 "Custom SMS sent",
  manual_note:                "Note added",
  card_expiry_alert:          "Card expiry reminder sent",
  no_payment_method:          "Payment method alert sent",
}

const SEVERITY_CONFIG: Record<Severity, { label: string; dot: string; bg: string; border: string; text: string }> = {
  urgent:  { label: "Urgent",        dot: "bg-red-500",    bg: "bg-red-500/5",    border: "border-red-500/20",    text: "text-red-400" },
  action:  { label: "Action Needed", dot: "bg-orange-500", bg: "bg-orange-500/5", border: "border-orange-500/20", text: "text-orange-400" },
  monitor: { label: "Monitor",       dot: "bg-blue-400",   bg: "bg-blue-500/5",   border: "border-blue-500/15",   text: "text-blue-400" },
}

const NOTIF_ICON: Record<string, typeof Bell> = {
  lease_expired:        CalendarClock,
  no_recent_action:     AlertTriangle,
  payment_plan_missed:  FileWarning,
  unanswered_call:      PhoneMissed,
  grace_expiring:       Clock,
  card_expiring:        CreditCard,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = new Date().toISOString().split("T")[0]

  const [{ data: tenants }, { data: allInterventions }, { data: recentActivity }] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, unit, balance_due, rent_amount, card_expiry, payment_method, lease_end, properties(name)")
      .eq("user_id", user!.id)
      .eq("status", "active"),

    supabase
      .from("interventions")
      .select("id, type, sent_at, tenant_id, notes, snapshot, status")
      .eq("user_id", user!.id)
      .order("sent_at", { ascending: false }),

    supabase
      .from("interventions")
      .select("id, type, sent_at, tenant_id, status, tenants(id, name, unit)")
      .eq("user_id", user!.id)
      .order("sent_at", { ascending: false })
      .limit(25),
  ])

  // Build per-tenant intervention index
  const byTenant = new Map<string, typeof allInterventions>()
  for (const i of allInterventions ?? []) {
    if (!byTenant.has(i.tenant_id)) byTenant.set(i.tenant_id, [])
    byTenant.get(i.tenant_id)!.push(i)
  }

  const notifications: ActionNotification[] = []

  for (const t of tenants ?? []) {
    const interventions = byTenant.get(t.id) ?? []
    const latest = interventions[0]
    const sinceLastAction = latest ? daysSince(latest.sent_at) : Infinity
    const hasBalance = (t.balance_due ?? 0) > 0
    const ratio = (t.rent_amount ?? 0) > 0 ? (t.balance_due ?? 0) / (t.rent_amount ?? 1) : 0
    const propName = (t.properties as unknown as { name: string } | null)?.name

    // 1. Lease expired — tenant is active but lease_end is in the past
    if (t.lease_end && t.lease_end < today) {
      const d = Math.floor(daysSince(t.lease_end + "T00:00:00"))
      notifications.push({
        id: `lease-${t.id}`,
        severity: "urgent",
        notifType: "lease_expired",
        tenantId: t.id, tenantName: t.name, tenantUnit: t.unit, propertyName: propName,
        title: "Lease expired — no renewal logged",
        description: `Expired ${d} day${d !== 1 ? "s" : ""} ago on ${fmt(t.lease_end)}. Tenant is still marked active.`,
      })
    }

    // 2. High balance (≥1 month), no action in 7+ days
    if (hasBalance && ratio >= 1 && sinceLastAction >= 7) {
      const d = sinceLastAction === Infinity ? null : Math.floor(sinceLastAction)
      notifications.push({
        id: `no-action-${t.id}`,
        severity: ratio >= 2 ? "urgent" : "action",
        notifType: "no_recent_action",
        tenantId: t.id, tenantName: t.name, tenantUnit: t.unit, propertyName: propName,
        title: `$${(t.balance_due ?? 0).toLocaleString()} outstanding — ${d === null ? "no contact on record" : `no contact in ${d} days`}`,
        description: d === null
          ? "No action has ever been logged for this tenant."
          : `Last action was ${d} days ago. High-balance tenants need contact every 3–5 days.`,
      })
    }

    // 3. Payment plan date passed, balance still showing
    const missedPlan = interventions.find(i => {
      if (i.type !== "payment_plan_agreed") return false
      const snap = i.snapshot as { agreed_date?: string } | null
      return snap?.agreed_date && snap.agreed_date < today
    })
    if (missedPlan && hasBalance) {
      const snap = missedPlan.snapshot as { agreed_date?: string } | null
      const d = Math.floor(daysSince((snap?.agreed_date ?? today) + "T00:00:00"))
      notifications.push({
        id: `missed-plan-${missedPlan.id}`,
        severity: "action",
        notifType: "payment_plan_missed",
        tenantId: t.id, tenantName: t.name, tenantUnit: t.unit, propertyName: propName,
        title: "Payment plan agreement was missed",
        description: `Agreed to pay by ${fmt(snap?.agreed_date ?? today)}, ${d} day${d !== 1 ? "s" : ""} ago. Balance of $${(t.balance_due ?? 0).toLocaleString()} still remains.`,
      })
    }

    // 4. Call attempted with no answer, no follow-up within 48h
    const unansweredCall = interventions.find(i =>
      i.type === "call_logged" &&
      (i.notes ?? "").toLowerCase().includes("attempted") &&
      daysSince(i.sent_at) >= 1 &&
      daysSince(i.sent_at) <= 5
    )
    if (unansweredCall) {
      const hasFollowUp = interventions.some(i =>
        i.id !== unansweredCall.id &&
        new Date(i.sent_at) > new Date(unansweredCall.sent_at)
      )
      if (!hasFollowUp) {
        const h = Math.floor(daysSince(unansweredCall.sent_at) * 24)
        notifications.push({
          id: `no-answer-${unansweredCall.id}`,
          severity: "action",
          notifType: "unanswered_call",
          tenantId: t.id, tenantName: t.name, tenantUnit: t.unit, propertyName: propName,
          title: "Call attempt had no answer — no follow-up logged",
          description: `Attempted ${h}h ago with no response. Try again or send an SMS.`,
        })
      }
    }

    // 5. Hardship grace period expiring within 5 days
    const hardshipEntry = interventions.find(i => {
      if (i.type !== "hardship_checkin") return false
      const snap = i.snapshot as { grace_until?: string; grace_agreed?: boolean } | null
      return snap?.grace_agreed && snap?.grace_until
    })
    if (hardshipEntry) {
      const snap = hardshipEntry.snapshot as { grace_until?: string } | null
      if (snap?.grace_until) {
        const d = daysUntil(snap.grace_until + "T00:00:00")
        if (d >= 0 && d <= 5) {
          notifications.push({
            id: `grace-${hardshipEntry.id}`,
            severity: d <= 1 ? "urgent" : "action",
            notifType: "grace_expiring",
            tenantId: t.id, tenantName: t.name, tenantUnit: t.unit, propertyName: propName,
            title: `Hardship grace period ends ${d === 0 ? "today" : `in ${d} day${d !== 1 ? "s" : ""}`}`,
            description: `Grace was agreed until ${fmt(snap.grace_until)}. Follow up on their payment situation before it expires.`,
          })
        }
      }
    }

    // 6. Card expiring within 30 days (CC payment method only)
    if (t.card_expiry && ["cc", "card", "credit_card", "credit"].includes((t.payment_method ?? "").toLowerCase())) {
      const parts = t.card_expiry.split("/")
      if (parts.length === 2) {
        const month = parseInt(parts[0])
        const year = parseInt(parts[1].length === 2 ? "20" + parts[1] : parts[1])
        if (!isNaN(month) && !isNaN(year)) {
          const expiryDate = new Date(year, month, 1) // first day AFTER the expiry month
          const d = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)
          if (d >= 0 && d <= 30) {
            notifications.push({
              id: `card-${t.id}`,
              severity: "monitor",
              notifType: "card_expiring",
              tenantId: t.id, tenantName: t.name, tenantUnit: t.unit, propertyName: propName,
              title: `Card on file expires ${d <= 7 ? "very soon" : `in ${d} days`}`,
              description: `Card expiry: ${t.card_expiry}. Alert tenant to update their payment method before rent is due.`,
            })
          }
        }
      }
    }
  }

  // Sort: urgent first, then action, then monitor; within each group by tenant name
  const ORDER: Severity[] = ["urgent", "action", "monitor"]
  notifications.sort((a, b) => {
    const si = ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity)
    return si !== 0 ? si : a.tenantName.localeCompare(b.tenantName)
  })

  const grouped = ORDER.map(s => ({
    severity: s,
    items: notifications.filter(n => n.severity === s),
  })).filter(g => g.items.length > 0)

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-white text-xl font-bold flex items-center gap-2">
          <Bell size={18} className="text-[#60a5fa]" />
          Notifications
          {notifications.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full ml-1">
              {notifications.length}
            </span>
          )}
        </h1>
        <p className="text-[#4b5563] text-sm mt-1">
          Items that need a response from you — missed agreements, no-answer calls, expiring conditions.
        </p>
      </div>

      {/* Empty state */}
      {notifications.length === 0 && (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-12 text-center mb-8">
          <CheckCircle2 size={28} className="text-emerald-500 mx-auto mb-3" />
          <div className="text-white font-semibold mb-1">All clear</div>
          <div className="text-[#4b5563] text-sm">
            No items need your attention right now.
          </div>
        </div>
      )}

      {/* Grouped notifications */}
      {grouped.map(({ severity, items }) => {
        const cfg = SEVERITY_CONFIG[severity]
        return (
          <div key={severity} className="mb-7">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className="text-[#4b5563] text-xs uppercase tracking-wide font-medium">{cfg.label}</span>
              <span className="text-[#2e3a50] text-xs">· {items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map(n => {
                const Icon = NOTIF_ICON[n.notifType] ?? Bell
                return (
                  <Link
                    key={n.id}
                    href={`/dashboard/tenants/${n.tenantId}`}
                    className={`flex items-start gap-3.5 p-4 rounded-xl border transition-colors hover:brightness-110 ${cfg.bg} ${cfg.border}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-white/[0.04] border border-white/[0.07]`}>
                      <Icon size={14} className={cfg.text} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-white text-sm font-medium">
                            {n.tenantName}
                            {n.propertyName && (
                              <span className="text-[#4b5563] font-normal"> · {n.propertyName}</span>
                            )}
                            <span className="text-[#4b5563] font-normal"> · Unit {n.tenantUnit}</span>
                          </div>
                          <div className={`text-sm font-medium mt-0.5 ${cfg.text}`}>{n.title}</div>
                          <div className="text-[#6b7280] text-xs mt-1 leading-relaxed">{n.description}</div>
                        </div>
                        <ChevronRight size={14} className="text-[#374151] shrink-0 mt-1" />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Activity feed — secondary, compact */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <Inbox size={13} className="text-[#374151]" />
          <span className="text-[#4b5563] text-xs uppercase tracking-wide font-medium">Activity Feed</span>
        </div>

        {!recentActivity?.length ? (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 text-center">
            <div className="text-[#4b5563] text-sm">No actions logged yet.</div>
          </div>
        ) : (
          <div className="bg-[#111827] border border-white/10 rounded-2xl divide-y divide-white/[0.04]">
            {recentActivity.map(a => {
              const at = a as typeof a & { tenants?: { id: string; name: string; unit: string } | null }
              const tenant = at.tenants
              const isDryRun = a.status === "dry_run"
              const label = INTERVENTION_LABELS[a.type] ?? a.type
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1e2d45] shrink-0" />
                  <div className="flex-1 min-w-0">
                    {tenant ? (
                      <span className="text-white text-sm font-medium hover:text-[#60a5fa]">
                        {tenant.name}
                      </span>
                    ) : (
                      <span className="text-[#4b5563] text-sm">Tenant</span>
                    )}
                    <span className={`text-xs ml-2 ${isDryRun ? "text-[#374151]" : "text-[#6b7280]"}`}>
                      {isDryRun ? `would have sent: ${label.toLowerCase()}` : label}
                    </span>
                  </div>
                  <span className="text-[#374151] text-xs shrink-0">{timeAgo(a.sent_at)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
