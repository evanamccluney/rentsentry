"use client"
import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, HandCoins, Scale, X, Send } from "lucide-react"

const SMS_PREVIEWS: Record<string, (name: string) => string> = {
  cash_for_keys: (name) =>
    `Hi ${name}, your property manager has a time-sensitive offer regarding your unit. Please contact them within 5 days to discuss your options.`,
  legal_packet: (name) =>
    `Hi ${name}, your account is significantly overdue and legal proceedings are being prepared. Contact your property manager immediately to resolve this.`,
}

interface Props {
  tenant: {
    id: string
    name: string
    phone: string | null
    balance_due: number
    rent_amount: number
    late_payment_count: number
    previous_delinquency: boolean
    tier: string
    reasons: string[]
    days_past_due: number
    days_late_avg: number
    card_expiry?: string | null
    payment_method?: string | null
    late_fee: number
    requires_attorney: boolean
    property_name?: string | null
    recommended_action: string
  }
  evictionWeeks: number
  propertyState: string | null
}

function computeRecommendation(
  evictionWeeks: number,
  repeatOffender: boolean,
  monthsOwed: number,
  propertyState: string | null
): { action: "cash_for_keys" | "legal_packet"; headline: string; reasoning: string } {
  const slowState = evictionWeeks >= 12
  const months = Math.round(monthsOwed * 10) / 10

  if (monthsOwed >= 3 && repeatOffender) {
    return {
      action: "legal_packet",
      headline: "File for Eviction (UD)",
      reasoning: `At ${months} months overdue with a prior delinquency on record, voluntary resolution is unlikely. Filing Unlawful Detainer is the most cost-effective path — every additional week adds more unpaid rent with low probability of recovery.`,
    }
  }

  if (slowState && !repeatOffender) {
    return {
      action: "cash_for_keys",
      headline: "Offer Cash for Keys",
      reasoning: `${propertyState ? `${propertyState}'s` : "Your state's"} eviction process averages ~${evictionWeeks} weeks in court. A Cash for Keys offer (50–100% of one month's rent) will resolve this faster and cheaper than filing — and leaves the unit in better condition.`,
    }
  }

  if (repeatOffender) {
    return {
      action: "legal_packet",
      headline: "File for Eviction (UD)",
      reasoning: `With a prior delinquency on record and ${months} months unpaid, this tenant has shown they won't self-correct. Filing Unlawful Detainer starts the legal clock and protects your position for a future court date.`,
    }
  }

  // Default: CFK (cheaper, faster, first-time situation)
  return {
    action: "cash_for_keys",
    headline: "Offer Cash for Keys",
    reasoning: `At ${months} months overdue with no prior delinquency, Cash for Keys is the fastest path to recovering the unit. Court costs and lost rent during a ${evictionWeeks}-week eviction will likely exceed a reasonable offer — and removes the uncertainty of a contested case.`,
  }
}

export default function EscalationDecisionBanner({ tenant, evictionWeeks, propertyState }: Props) {
  const [pendingAction, setPendingAction] = useState<"cash_for_keys" | "legal_packet" | null>(null)
  const [loading, setLoading] = useState(false)

  const monthsOwed = tenant.rent_amount > 0 ? tenant.balance_due / tenant.rent_amount : 0
  const repeatOffender = tenant.previous_delinquency || tenant.late_payment_count >= 5
  const rec = computeRecommendation(evictionWeeks, repeatOffender, monthsOwed, propertyState)

  function buildSnapshot(actionType: string) {
    return {
      tier: tenant.tier,
      balance_due: tenant.balance_due,
      rent_amount: tenant.rent_amount,
      days_past_due: tenant.days_past_due,
      days_late_avg: tenant.days_late_avg,
      late_payment_count: tenant.late_payment_count,
      previous_delinquency: tenant.previous_delinquency,
      card_expiry: tenant.card_expiry ?? null,
      payment_method: tenant.payment_method ?? null,
      reasons: tenant.reasons,
      recommended_action: tenant.recommended_action,
      action_type: actionType,
      late_fee: tenant.late_fee,
      requires_attorney: tenant.requires_attorney,
      property_name: tenant.property_name ?? null,
      scored_at: new Date().toISOString(),
    }
  }

  async function execute(type: string) {
    setLoading(true)
    try {
      const res = await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          type,
          phone: tenant.phone,
          name: tenant.name,
          snapshot: buildSnapshot(type),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message)
        window.location.reload()
      } else {
        toast.error(data.error || "Something went wrong.")
      }
    } catch {
      toast.error("Could not complete action.")
    } finally {
      setLoading(false)
      setPendingAction(null)
    }
  }

  const hasPhone = !!tenant.phone
  const msgFn = pendingAction ? SMS_PREVIEWS[pendingAction] : null
  const msgBody = msgFn ? msgFn(tenant.name) : ""

  return (
    <>
      {/* SMS Review Modal */}
      {pendingAction && msgFn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPendingAction(null)}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold text-base">Review SMS Before Sending</h3>
                <button onClick={() => setPendingAction(null)} className="text-[#4b5563] hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
              <p className="text-[#4b5563] text-xs mb-5">Prepared by system · snapshot saved to history</p>

              <div className="flex gap-3 text-sm items-baseline mb-4">
                <span className="text-[#4b5563] w-14 shrink-0 text-xs uppercase tracking-wide">To</span>
                {hasPhone
                  ? <span className="text-white font-mono">{tenant.phone}</span>
                  : <span className="text-orange-400 text-xs">No phone number on file — action will be logged only</span>
                }
              </div>

              <div className="bg-[#0d1117] border border-white/5 rounded-2xl rounded-tl-sm p-4 mb-1">
                <p className="text-[#d1d5db] text-sm leading-relaxed">{msgBody}</p>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[#2e3a50] text-[10px]">SMS · {msgBody.length} chars · 1 segment</span>
                <span className="text-[#2e3a50] text-[10px]">Sent from RentSentry</span>
              </div>

              <p className="text-[#374151] text-xs mb-5">
                Logged permanently to this tenant&apos;s history regardless of delivery
              </p>
              <div className="flex gap-3">
                <button onClick={() => setPendingAction(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => execute(pendingAction)}
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
      )}

      {/* Banner */}
      <div className="bg-red-500/5 border border-red-500/25 rounded-2xl p-5 mb-5">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-red-300 font-semibold text-sm">Critical Escalation — Action Required</h2>
            <p className="text-[#9ca3af] text-xs mt-0.5">
              {tenant.name} owes {Math.round(monthsOwed * 10) / 10} months of rent (${tenant.balance_due.toLocaleString()}). Choose how to proceed.
            </p>
          </div>
        </div>

        {/* Recommendation */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 mb-4">
          <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-1.5">RentSentry recommends</div>
          <p className="text-white text-sm font-semibold mb-1.5">{rec.headline}</p>
          <p className="text-[#9ca3af] text-sm leading-relaxed">{rec.reasoning}</p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setPendingAction("cash_for_keys")}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold border transition-colors ${
              rec.action === "cash_for_keys"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                : "bg-white/5 border-white/10 text-[#9ca3af] hover:bg-white/10 hover:text-white"
            }`}
          >
            <HandCoins size={15} />
            Offer Cash for Keys
            {rec.action === "cash_for_keys" && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full ml-1">Recommended</span>
            )}
          </button>
          <button
            onClick={() => setPendingAction("legal_packet")}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold border transition-colors ${
              rec.action === "legal_packet"
                ? "bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25"
                : "bg-white/5 border-white/10 text-[#9ca3af] hover:bg-white/10 hover:text-white"
            }`}
          >
            <Scale size={15} />
            Prepare UD Filing
            {rec.action === "legal_packet" && (
              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full ml-1">Recommended</span>
            )}
          </button>
        </div>
        <p className="text-[#374151] text-xs mt-3">
          RentSentry never auto-sends legal notices. You review and approve every action.
        </p>
      </div>
    </>
  )
}
