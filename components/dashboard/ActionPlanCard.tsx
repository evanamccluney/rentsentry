"use client"
import { useEffect, useState } from "react"
import { ArrowRight, AlertTriangle, MessageCircle, PhoneOff, TrendingDown, Sparkles, Loader2 } from "lucide-react"
import type { ActionStep } from "@/lib/action-plan"

interface AIPlan {
  immediateAction: string
  immediateDetail: string
  trigger: { condition: string; days: number; nextAction: string } | null
  warning: string | null
  recoveryOdds: number
  recoveryContext: string
  keyInsight: string
}

function RecoveryBar({ odds }: { odds: number }) {
  const color = odds >= 70 ? "bg-emerald-500" : odds >= 45 ? "bg-yellow-500" : "bg-red-500"
  const textColor = odds >= 70 ? "text-emerald-400" : odds >= 45 ? "text-yellow-400" : "text-red-400"
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${odds}%` }} />
      </div>
      <span className={`text-sm font-bold tabular-nums shrink-0 ${textColor}`}>{odds}%</span>
    </div>
  )
}

function CommBadge({ status, declines }: { status: ActionStep["communicationStatus"]; declines: number }) {
  if (status === "unknown" && declines === 0) return null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === "responsive" && (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
          <MessageCircle size={10} />
          Tenant responsive
        </span>
      )}
      {status === "unresponsive" && (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium">
          <PhoneOff size={10} />
          Not responding
        </span>
      )}
      {declines >= 1 && (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[11px] font-medium">
          <TrendingDown size={10} />
          {declines} autopay decline{declines > 1 ? "s" : ""}
        </span>
      )}
    </div>
  )
}

function PlanContent({
  action, detail, trigger, warning, odds, oddsContext, keyInsight, escalationAccelerated,
}: {
  action: string
  detail: string
  trigger: { condition: string; days: number; nextAction: string } | null
  warning: string | null
  odds: number
  oddsContext: string
  keyInsight?: string
  escalationAccelerated?: boolean
}) {
  return (
    <>
      {/* Immediate action */}
      <div className="bg-blue-500/8 border border-blue-500/15 rounded-xl p-4 mb-3">
        <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1.5">Do this now</div>
        <div className="text-white font-semibold text-sm mb-1.5">{action}</div>
        <p className="text-[#9ca3af] text-xs leading-relaxed">{detail}</p>
      </div>

      {/* If-then trigger */}
      {trigger && (
        <div className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 mb-3">
          <ArrowRight size={13} className="text-[#4b5563] shrink-0 mt-0.5" />
          <div>
            <span className="text-[#4b5563] text-xs">
              If{" "}
              <span className="text-[#9ca3af]">{trigger.condition}</span>
              {" "}in{" "}
              <span className={`font-semibold ${escalationAccelerated ? "text-orange-400" : "text-white"}`}>
                {trigger.days} day{trigger.days !== 1 ? "s" : ""}
              </span>
              {escalationAccelerated && (
                <span className="text-orange-400 text-[10px] ml-1">(accelerated)</span>
              )}
              :
            </span>
            <div className="text-white text-sm font-medium mt-0.5">{trigger.nextAction}</div>
          </div>
        </div>
      )}

      {/* Key insight — AI only */}
      {keyInsight && (
        <div className="flex items-start gap-2.5 bg-violet-500/8 border border-violet-500/20 rounded-xl px-4 py-3 mb-3">
          <Sparkles size={13} className="text-violet-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-violet-400 text-[10px] uppercase tracking-wide mb-1">Key insight</div>
            <p className="text-[#c4b5fd] text-xs leading-relaxed">{keyInsight}</p>
          </div>
        </div>
      )}

      {/* Warning */}
      {warning && (
        <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 mb-3">
          <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs leading-relaxed">{warning}</p>
        </div>
      )}

      {/* Recovery odds */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3">
        <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-2">Recovery probability</div>
        <RecoveryBar odds={odds} />
        <p className="text-[#4b5563] text-xs mt-2 leading-relaxed">{oddsContext}</p>
      </div>
    </>
  )
}

interface Props {
  plan: ActionStep
  tenantId: string
}

export default function ActionPlanCard({ plan, tenantId }: Props) {
  const [aiPlan, setAiPlan] = useState<AIPlan | null>(null)
  const [aiLoading, setAiLoading] = useState(true)
  const [aiError, setAiError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/tenants/${tenantId}/ai-action-plan`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.plan) setAiPlan(data.plan)
        else if (!cancelled) setAiError(true)
      })
      .catch(() => { if (!cancelled) setAiError(true) })
      .finally(() => { if (!cancelled) setAiLoading(false) })
    return () => { cancelled = true }
  }, [tenantId])

  const showAI = !!aiPlan

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-white font-semibold text-sm">What To Do</h2>
          {aiLoading && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[#4b5563] text-[10px]">
              <Loader2 size={9} className="animate-spin" />
              Analyzing…
            </span>
          )}
          {showAI && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-400 text-[10px] font-medium">
              <Sparkles size={9} />
              AI Enhanced
            </span>
          )}
          {aiError && !showAI && (
            <span className="text-[#374151] text-[10px]">rule-based</span>
          )}
        </div>
        <CommBadge status={plan.communicationStatus} declines={plan.autopayDeclineCount} />
      </div>

      {/* Show AI plan if ready, otherwise template */}
      {showAI ? (
        <PlanContent
          action={aiPlan.immediateAction}
          detail={aiPlan.immediateDetail}
          trigger={aiPlan.trigger}
          warning={aiPlan.warning}
          odds={aiPlan.recoveryOdds}
          oddsContext={aiPlan.recoveryContext}
          keyInsight={aiPlan.keyInsight}
          escalationAccelerated={plan.escalationAccelerated}
        />
      ) : (
        <PlanContent
          action={plan.immediateAction}
          detail={plan.immediateDetail}
          trigger={plan.trigger}
          warning={plan.warning}
          odds={plan.recoveryOdds}
          oddsContext={plan.recoveryContext}
          escalationAccelerated={plan.escalationAccelerated}
        />
      )}
    </div>
  )
}
