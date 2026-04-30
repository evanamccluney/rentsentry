"use client"
import { useState } from "react"
import { ChevronDown, ChevronRight, Scale, AlertTriangle } from "lucide-react"
import type { RiskTier, TenantPattern } from "@/lib/risk-engine"

const STAGES: {
  tier: RiskTier
  label: string
  dot: string
  ring: string
  textColor: string
  dayMarker: string
  trigger: string
  action: string
  requiresAttorney?: boolean
}[] = [
  {
    tier: "healthy",
    label: "Healthy",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500",
    textColor: "text-emerald-400",
    dayMarker: "Ongoing",
    trigger: "No balance, no risk signals. Proactive monitoring only.",
    action: "No action needed",
  },
  {
    tier: "watch",
    label: "Watch",
    dot: "bg-blue-400",
    ring: "ring-blue-400",
    textColor: "text-blue-400",
    dayMarker: "Pre-1st",
    trigger: "No balance — but 2+ late payments, avg 3+ days late, no payment method, or card expiring. Proactive alert 5 days before due, urgent alert 1 day before due.",
    action: "Send proactive reminder or confirm payment method",
  },
  {
    tier: "reminder",
    label: "Reminder",
    dot: "bg-yellow-400",
    ring: "ring-yellow-400",
    textColor: "text-yellow-400",
    dayMarker: "Day 1–14",
    trigger: "Balance outstanding. First or second offense, or partial payment received. No significant history.",
    action: "Send friendly reminder or hardship check-in (sudden non-payers)",
  },
  {
    tier: "payment_plan",
    label: "Payment Plan",
    dot: "bg-amber-500",
    ring: "ring-amber-500",
    textColor: "text-amber-400",
    dayMarker: "Day 15+",
    trigger: "Balance + 15+ days past due, or full month's rent owed, or chronic late history. Structure repayment before legal escalation.",
    action: "Offer 2–3 installment payment plan",
  },
  {
    tier: "pay_or_quit",
    label: "Pay or Quit",
    dot: "bg-red-400",
    ring: "ring-red-400",
    textColor: "text-red-300",
    dayMarker: "Day 15+",
    trigger: "1+ month owed + 15 days past due, OR repeat offender + any balance. Starts legal clock without committing to eviction. 80% of tenants pay within 3–7 days of notice.",
    action: "Issue Pay or Quit notice",
    requiresAttorney: true,
  },
  {
    tier: "cash_for_keys",
    label: "Cash for Keys",
    dot: "bg-orange-500",
    ring: "ring-orange-500",
    textColor: "text-orange-400",
    dayMarker: "Day 30–45",
    trigger: "1.5+ months owed + 30 days past due, OR repeat offender with 1.5+ months. Optimal window before court — tenant anxiety is highest, no attorney yet, eviction not on public record.",
    action: "Offer $500–$1,500 for voluntary move-out within 14 days",
  },
  {
    tier: "legal",
    label: "Start Eviction",
    dot: "bg-red-500",
    ring: "ring-red-500",
    textColor: "text-red-400",
    dayMarker: "Day 45+",
    trigger: "2+ months owed + repeat offender OR 45+ days past due. 3+ months owed regardless of days. 1.5+ months + 60 days past due (two full billing cycles ignored).",
    action: "File for eviction — requires attorney",
    requiresAttorney: true,
  },
]

const TIER_ORDER: RiskTier[] = [
  "healthy", "watch", "reminder", "payment_plan", "pay_or_quit", "cash_for_keys", "legal",
]

const PATTERN_LABELS: Record<TenantPattern, { label: string; color: string }> = {
  repeat_offender: { label: "Repeat offender", color: "text-red-400" },
  escalating_late: { label: "Escalating pattern", color: "text-orange-400" },
  chronic_late:    { label: "Chronic late payer", color: "text-amber-400" },
  sudden_nonpayer: { label: "Sudden non-payer", color: "text-blue-400" },
  first_offense:   { label: "First offense", color: "text-yellow-400" },
  stable:          { label: "Stable", color: "text-emerald-400" },
}

interface Props {
  currentTier: RiskTier
  daysPastDue: number
  daysUntilDue?: number
  tenantPattern: TenantPattern
}

export default function EscalationTimeline({ currentTier, daysPastDue, daysUntilDue, tenantPattern }: Props) {
  const [open, setOpen] = useState(false)
  const currentIndex = TIER_ORDER.indexOf(currentTier)
  const pattern = PATTERN_LABELS[tenantPattern]

  const statusLabel = daysPastDue > 0
    ? `Day ${daysPastDue} past due`
    : daysUntilDue !== undefined
    ? `${daysUntilDue}d until rent due`
    : "No balance"

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl mb-5 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-white font-semibold text-sm">Escalation Path</div>
          <span className="text-[#4b5563] text-xs">{statusLabel}</span>
          {pattern && (
            <span className={`text-xs font-medium ${pattern.color}`}>· {pattern.label}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[#4b5563]">
          <span className="text-xs">
            {STAGES[currentIndex]?.label ?? "Unknown"}
          </span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-white/5">
          <p className="text-[#374151] text-xs py-3 mb-1">
            Escalation path if rent goes unpaid — current stage highlighted. Triggers are evaluated daily by RentSentry.
          </p>

          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[9px] top-4 bottom-4 w-px bg-[#1e2d45]" />

            <div className="space-y-0">
              {STAGES.map((stage, i) => {
                const isCurrent = stage.tier === currentTier
                const isPast = i < currentIndex
                const isFuture = i > currentIndex

                return (
                  <div key={stage.tier} className="relative flex items-start gap-3">
                    {/* Dot */}
                    <div
                      className={`relative z-10 w-[19px] h-[19px] rounded-full flex items-center justify-center shrink-0 mt-[3px] ${
                        isCurrent
                          ? `${stage.dot} ring-2 ring-offset-2 ring-offset-[#111827] ${stage.ring}`
                          : isPast
                          ? "bg-[#1e2d45] border border-[#374151]"
                          : "bg-[#0d1220] border border-[#1e2d45]"
                      }`}
                    >
                      {isCurrent && <span className="w-2 h-2 rounded-full bg-white/80" />}
                      {isPast && <span className="w-1 h-1 rounded-full bg-[#374151]" />}
                    </div>

                    {/* Content */}
                    <div className={`pb-4 flex-1 min-w-0 ${i === STAGES.length - 1 ? "pb-0" : ""}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-semibold ${
                            isCurrent ? stage.textColor : isFuture ? "text-[#2e3a50]" : "text-[#374151]"
                          }`}
                        >
                          {stage.label}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            isCurrent
                              ? "bg-white/8 text-[#6b7280]"
                              : "bg-[#0d1220] text-[#1e2d45]"
                          }`}
                        >
                          {stage.dayMarker}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded font-semibold">
                            Current
                          </span>
                        )}
                        {stage.requiresAttorney && isCurrent && (
                          <span className="flex items-center gap-1 text-[10px] text-[#4b5563]">
                            <Scale size={10} /> Attorney recommended
                          </span>
                        )}
                      </div>

                      {isCurrent && (
                        <>
                          <p className="text-[#6b7280] text-xs mt-1 leading-relaxed">{stage.trigger}</p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <AlertTriangle size={10} className={stage.textColor} />
                            <span className={`text-xs font-medium ${stage.textColor}`}>{stage.action}</span>
                          </div>
                        </>
                      )}

                      {!isCurrent && isFuture && (
                        <p className="text-[#1e2d45] text-[11px] mt-0.5 leading-relaxed">{stage.action}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
