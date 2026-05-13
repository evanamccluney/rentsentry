import Link from "next/link"
import { ArrowRight, Zap, CheckCircle2, Bot } from "lucide-react"

const TIER_DOT: Record<string, string> = {
  legal:         "bg-red-500",
  pay_or_quit:   "bg-red-400",
  cash_for_keys: "bg-orange-500",
  payment_plan:  "bg-amber-500",
  reminder:      "bg-yellow-400",
  watch:         "bg-blue-400",
}

const TIER_PILL: Record<string, string> = {
  legal:         "bg-red-500/10 text-red-400 border border-red-500/20",
  pay_or_quit:   "bg-red-400/10 text-red-300 border border-red-400/20",
  cash_for_keys: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  payment_plan:  "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  reminder:      "bg-yellow-400/10 text-yellow-400 border border-yellow-400/20",
  watch:         "bg-blue-400/10 text-blue-400 border border-blue-400/20",
}

interface ScoredTenant {
  id: string
  name: string
  unit: string
  tier: string
  recommended_action: string
  balance_due: number
  rent_amount: number
  days_past_due: number
  requires_attorney: boolean
  late_payment_count: number
  days_late_avg: number
}

interface Task {
  tenantId: string
  name: string
  unit: string
  tier: string
  action: string
  detail: string
  amountAtRisk: number
  automated?: boolean
}

const TIER_ORDER = ["legal", "pay_or_quit", "cash_for_keys", "payment_plan", "reminder", "watch"]

function autoLabel(type: string): string {
  if (type === "pre_due_installment_offer") return "split-pay offer"
  if (type === "pre_due_urgent") return "urgent reminder"
  if (type === "pre_due_delinquent_warning") return "balance warning"
  if (type === "payment_method_alert") return "payment method alert"
  return "proactive reminder"
}

function buildTask(t: ScoredTenant, lastAuto?: { type: string; daysAgo: number }): Task | null {
  if (!TIER_ORDER.includes(t.tier)) return null
  const bal = t.balance_due || 0
  const balFmt = `$${bal.toLocaleString()}`
  const autoWhen = lastAuto ? (lastAuto.daysAgo === 0 ? "today" : lastAuto.daysAgo === 1 ? "yesterday" : `${lastAuto.daysAgo}d ago`) : null

  const tasks: Record<string, { action: string; detail: string; automated?: boolean }> = {
    legal: {
      action: "Review eviction filing",
      detail: `${t.days_past_due}d past due · ${balFmt} owed${t.requires_attorney ? " — attorney review needed" : ""}`,
    },
    pay_or_quit: {
      action: "Issue Pay or Quit notice",
      detail: `${t.days_past_due}d past due · ${balFmt} owed — starts the legal clock`,
    },
    cash_for_keys: {
      action: "Offer Cash for Keys",
      detail: `${t.days_past_due}d past due · likely cheaper than eviction now`,
    },
    payment_plan: {
      action: "Send payment plan offer",
      detail: `${balFmt} owed · structured plan prevents escalation`,
    },
    reminder: lastAuto ? {
      action: "Follow up — system reached out, no response",
      detail: `${autoLabel(lastAuto.type)} sent ${autoWhen} · ${balFmt} still unpaid`,
      automated: true,
    } : {
      action: t.late_payment_count >= 3 ? "Send firm reminder" : "Send friendly reminder",
      detail: `${balFmt} outstanding · ${t.late_payment_count >= 3 ? `${t.late_payment_count} prior late payments` : "no prior history"}`,
    },
    watch: lastAuto ? {
      action: "System sent — monitoring",
      detail: `${autoLabel(lastAuto.type)} sent ${autoWhen} · awaiting response`,
      automated: true,
    } : {
      action: t.days_late_avg >= 5 ? "Send proactive reminder — chronic pattern" : "Send proactive reminder",
      detail: "Rent coming due · historical pattern suggests late risk",
    },
  }

  const task = tasks[t.tier]
  return {
    tenantId: t.id,
    name: t.name,
    unit: t.unit,
    tier: t.tier,
    action: task.action,
    detail: task.detail,
    amountAtRisk: bal > 0 ? bal : t.rent_amount,
    automated: task.automated ?? false,
  }
}

export default function TodayBriefing({ tenants, lastAutoActions = {} }: { tenants: ScoredTenant[]; lastAutoActions?: Record<string, { type: string; daysAgo: number }> }) {
  const tasks = tenants
    .map(t => buildTask(t, lastAutoActions[t.id]))
    .filter((t): t is Task => t !== null)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
    .slice(0, 7)

  const totalAtRisk = tasks.reduce((s, t) => s + t.amountAtRisk, 0)

  if (tasks.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl px-5 py-4 mb-6">
        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
        <span className="text-emerald-400 text-sm font-medium">All clear today</span>
        <span className="text-[#4b5563] text-sm">— no tenants need action right now.</span>
      </div>
    )
  }

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
            <Zap size={14} className="text-amber-400" />
          </div>
          <h2 className="text-white font-semibold text-sm">Today&apos;s Priorities</h2>
        </div>
        <Link href="/dashboard/tenants" className="text-[#4b5563] hover:text-white text-xs transition-colors flex items-center gap-1">
          All tenants <ArrowRight size={11} />
        </Link>
      </div>
      <p className="text-[#4b5563] text-xs mb-4 ml-9.5">
        {tasks.length} tenant{tasks.length !== 1 ? "s" : ""} need action today · ${totalAtRisk.toLocaleString()} at risk
      </p>

      <div className="space-y-0.5">
        {tasks.map(task => (
          <Link
            key={task.tenantId}
            href={`/dashboard/tenants/${task.tenantId}`}
            className="flex items-center gap-3 hover:bg-white/[0.04] rounded-xl px-3 py-2.5 -mx-3 transition-colors group"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${TIER_DOT[task.tier]}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-sm font-medium">{task.name}</span>
                <span className="text-[#4b5563] text-xs">Unit {task.unit}</span>
                {task.automated ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Bot size={9} />
                    {task.action}
                  </span>
                ) : (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${TIER_PILL[task.tier]}`}>
                    {task.action}
                  </span>
                )}
              </div>
              {task.detail && (
                <p className="text-[#4b5563] text-xs mt-0.5 truncate">{task.detail}</p>
              )}
            </div>
            <ArrowRight size={13} className="text-[#2e3a50] group-hover:text-[#6b7280] shrink-0 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  )
}
