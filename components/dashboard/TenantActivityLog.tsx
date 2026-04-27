"use client"
import { useState } from "react"
import { Clock, ChevronDown, ChevronRight, Scale, Zap, Heart } from "lucide-react"

interface InterventionSnapshot {
  tier: string
  badge?: string
  balance_due: number
  rent_amount: number
  days_past_due: number
  days_late_avg: number
  late_payment_count: number
  previous_delinquency: boolean
  card_expiry?: string | null
  payment_method?: string | null
  reasons: string[]
  recommended_action: string
  action_type: string
  late_fee: number
  requires_attorney: boolean
  property_name?: string | null
  scored_at: string
  triggered_by?: "system" | "user" | null
}

interface Intervention {
  id: string
  type: string
  sent_at: string
  status: "sent" | "dry_run" | "pending" | string
  snapshot?: InterventionSnapshot | null
}

const HARDSHIP_TYPE_LABELS: Record<string, string> = {
  job_loss:         "Job loss / income drop",
  medical:          "Medical emergency",
  family_emergency: "Family emergency",
  other:            "Other hardship",
}

const INTERVENTION_LABELS: Record<string, string> = {
  hardship_checkin: "Hardship check-in logged",
  payment_reminder:     "Payment reminder sent",
  proactive_reminder:   "Proactive reminder sent",
  payment_method_alert:        "Payment method alert sent",
  pre_due_delinquent_warning:  "Pre-due balance warning sent",
  split_pay_offer:             "Payment plan offered",
  cash_for_keys:        "Cash for Keys offered",
  legal_packet:         "Legal notice sent",
  // legacy types from earlier versions
  card_expiry_alert:    "Payment reminder sent",
  card_expiry_30:       "Payment reminder sent",
  card_expiry_7:        "Payment reminder sent",
  no_payment_method:    "Payment method alert sent",
}

const TIER_STYLE: Record<string, { label: string; color: string; dot: string }> = {
  legal:         { label: "Eviction Recommended",       color: "text-red-400",    dot: "bg-red-500" },
  pay_or_quit:   { label: "Pay or Quit Notice Ready",   color: "text-red-300",    dot: "bg-red-400" },
  cash_for_keys: { label: "Cash for Keys Recommended",  color: "text-orange-400", dot: "bg-orange-500" },
  payment_plan:  { label: "Payment Plan Ready",         color: "text-amber-400",  dot: "bg-amber-500" },
  reminder:      { label: "Reminder Scheduled",         color: "text-yellow-400", dot: "bg-yellow-400" },
  watch:         { label: "Monitoring Active",          color: "text-blue-400",   dot: "bg-blue-400" },
  healthy:       { label: "Healthy",                    color: "text-emerald-400",dot: "bg-emerald-500" },
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

function SnapshotCard({ s }: { s: InterventionSnapshot }) {
  const tier = TIER_STYLE[s.tier]
  return (
    <div className="mt-2.5 bg-[#0a0e1a] border border-white/5 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[#374151] text-[10px] uppercase tracking-wide font-medium">
          Risk snapshot at time of action
        </div>
        <div className="text-[#374151] text-[10px]">
          {formatDateTime(s.scored_at)}
        </div>
      </div>

      {/* Tier */}
      {tier && (
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${tier.dot} shrink-0`} />
          <span className={`text-sm font-semibold ${tier.color}`}>{tier.label}</span>
          {s.badge && <span className="text-[#4b5563] text-xs">· {s.badge}</span>}
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#111827] rounded-lg p-2.5">
          <div className="text-[#374151] text-[10px] uppercase tracking-wide mb-1">Balance</div>
          <div className={`text-sm font-semibold tabular-nums ${s.balance_due > 0 ? "text-red-400" : "text-emerald-400"}`}>
            ${s.balance_due.toLocaleString()}
          </div>
        </div>
        <div className="bg-[#111827] rounded-lg p-2.5">
          <div className="text-[#374151] text-[10px] uppercase tracking-wide mb-1">Rent</div>
          <div className="text-white text-sm font-semibold tabular-nums">${s.rent_amount.toLocaleString()}</div>
        </div>
        <div className="bg-[#111827] rounded-lg p-2.5">
          <div className="text-[#374151] text-[10px] uppercase tracking-wide mb-1">Days Late</div>
          <div className={`text-sm font-semibold tabular-nums ${s.days_past_due > 0 ? "text-orange-400" : "text-[#4b5563]"}`}>
            {s.days_past_due > 0 ? `${s.days_past_due}d` : "—"}
          </div>
        </div>
      </div>

      {/* Payment history */}
      <div className="flex flex-wrap gap-3 text-xs text-[#4b5563]">
        {s.days_late_avg > 0 && <span>Avg {s.days_late_avg}d late</span>}
        {s.late_payment_count > 0 && <span>{s.late_payment_count} late payment{s.late_payment_count !== 1 ? "s" : ""}</span>}
        {s.previous_delinquency && <span className="text-orange-400/70">Prior delinquency on record</span>}
        {s.payment_method && s.payment_method !== "unknown" && <span>{s.payment_method.toUpperCase()}</span>}
        {s.card_expiry && <span>Card exp. {s.card_expiry}</span>}
        {s.late_fee > 0 && <span className="text-orange-400/70">+${s.late_fee} late fee</span>}
      </div>

      {/* Reasons */}
      {s.reasons.length > 0 && (
        <div>
          <div className="text-[#374151] text-[10px] uppercase tracking-wide mb-1.5">Why flagged</div>
          <div className="space-y-1">
            {s.reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-[#6b7280]">
                <span className="w-1 h-1 rounded-full bg-[#374151] shrink-0 mt-1.5" />
                {r}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attorney warning */}
      {s.requires_attorney && (
        <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
          <Scale size={11} className="shrink-0" />
          Attorney review was recommended at time of action
        </div>
      )}

      {s.property_name && (
        <div className="text-[#2e3a50] text-[10px]">Property: {s.property_name}</div>
      )}
    </div>
  )
}

function HardshipEntry({ entry, isLast }: { entry: Intervention; isLast: boolean }) {
  const s = entry.snapshot as { hardship_type?: string; grace_agreed?: boolean; grace_until?: string; promised_amount?: number } | null
  const hardshipLabel = s?.hardship_type ? (HARDSHIP_TYPE_LABELS[s.hardship_type] ?? s.hardship_type) : "Hardship"

  return (
    <div className="flex gap-3 relative">
      {!isLast && (
        <div className="absolute left-3.5 top-7 bottom-0 w-px bg-white/5" />
      )}
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 mt-0.5 bg-blue-500/10 border border-blue-500/20">
        <Heart size={11} className="text-blue-400" />
      </div>
      <div className="pb-4 min-w-0 flex-1">
        <div className="text-sm text-[#d1d5db] leading-snug">
          Hardship check-in logged — <span className="text-blue-300">{hardshipLabel}</span>
        </div>
        <div className="text-[#4b5563] text-xs mt-0.5">{formatDateTime(entry.sent_at)}</div>
        {entry.notes && (
          <div className="mt-2 bg-[#0d1117] border border-white/5 rounded-xl px-3 py-2.5 text-[#9ca3af] text-xs leading-relaxed">
            {entry.notes}
          </div>
        )}
        {s?.grace_agreed && (
          <div className="mt-2 flex flex-wrap gap-2">
            {s.grace_until && (
              <span className="text-xs bg-blue-500/10 border border-blue-500/20 text-blue-300 px-2 py-0.5 rounded-md">
                Grace until {new Date(s.grace_until).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {s.promised_amount && (
              <span className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md">
                Promised ${s.promised_amount.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ActivityEntry({ entry, isLast }: { entry: Intervention; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const hasSnapshot = !!entry.snapshot

  const isSystemAction = entry.snapshot?.triggered_by === "system"
  const isDryRun = entry.status === "dry_run"

  const baseLabel = entry.type.startsWith("pm_alert_day")
    ? `PM alerted (Day ${entry.type.replace("pm_alert_day", "")} tier)`
    : (INTERVENTION_LABELS[entry.type] ?? entry.type)

  // Reframe label based on who/what triggered it
  const label = isDryRun
    ? `System evaluated — would have sent: ${baseLabel.toLowerCase()}`
    : isSystemAction
      ? `System sent: ${baseLabel.toLowerCase()}`
      : baseLabel

  return (
    <div className="flex gap-3 relative">
      {!isLast && (
        <div className="absolute left-3.5 top-7 bottom-0 w-px bg-white/5" />
      )}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 mt-0.5 ${
        isDryRun
          ? "bg-[#111827] border border-white/5"
          : isSystemAction
            ? "bg-emerald-500/10 border border-emerald-500/20"
            : "bg-white/5 border border-white/10"
      }`}>
        {isSystemAction || isDryRun
          ? <Zap size={11} className={isDryRun ? "text-[#374151]" : "text-emerald-500"} />
          : <Clock size={11} className="text-[#4b5563]" />
        }
      </div>
      <div className="pb-4 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className={`text-sm leading-snug ${isDryRun ? "text-[#4b5563]" : "text-[#d1d5db]"}`}>
            {label}
          </div>
          {hasSnapshot && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[#374151] hover:text-[#6b7280] transition-colors text-xs shrink-0 mt-0.5"
              title={expanded ? "Hide snapshot" : "View risk snapshot"}
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="text-[10px] uppercase tracking-wide">{expanded ? "Hide" : "Why"}</span>
            </button>
          )}
        </div>
        <div className="text-[#4b5563] text-xs mt-0.5 flex items-center gap-2">
          {formatDateTime(entry.sent_at)}
          {isSystemAction && !isDryRun && (
            <span className="text-emerald-700 text-[10px] uppercase tracking-wide font-medium">· auto</span>
          )}
          {isDryRun && (
            <span className="text-[#2e3a50] text-[10px] uppercase tracking-wide font-medium">· not sent (auto mode off)</span>
          )}
          {hasSnapshot && !expanded && !isSystemAction && !isDryRun && (
            <span className="text-[#2e3a50]">· snapshot saved</span>
          )}
        </div>
        {expanded && entry.snapshot && (
          <SnapshotCard s={entry.snapshot} />
        )}
      </div>
    </div>
  )
}

export default function TenantActivityLog({ interventions }: { interventions: Intervention[] }) {
  if (!interventions || interventions.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[#4b5563] text-sm py-2">
        <Clock size={14} />
        No actions taken yet
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {interventions.map((a, i) => (
        a.type === "hardship_checkin"
          ? <HardshipEntry key={a.id} entry={a} isLast={i === interventions.length - 1} />
          : <ActivityEntry key={a.id} entry={a} isLast={i === interventions.length - 1} />
      ))}
    </div>
  )
}
