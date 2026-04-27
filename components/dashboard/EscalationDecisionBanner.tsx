"use client"
import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, HandCoins, Scale, X, Send, TrendingDown } from "lucide-react"
import type { EconomicsResult } from "@/lib/eviction-economics"

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
  econ: EconomicsResult
  propertyState: string | null
}

export default function EscalationDecisionBanner({ tenant, econ, propertyState }: Props) {
  const [pendingAction, setPendingAction] = useState<"cash_for_keys" | "legal_packet" | null>(null)
  const [loading, setLoading] = useState(false)

  const monthsOwed = tenant.rent_amount > 0 ? tenant.balance_due / tenant.rent_amount : 0
  const recAction: "cash_for_keys" | "legal_packet" = econ.recommendation === "cfk" ? "cash_for_keys" : "legal_packet"
  const recHeadline = econ.recommendation === "cfk" ? "Offer Cash for Keys" : "File for Eviction (UD)"

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

        {/* Economics summary strip */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-red-500/8 border border-red-500/15 rounded-xl px-3 py-2.5 text-center">
            <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">Eviction cost</div>
            <div className="text-red-400 font-bold tabular-nums text-sm">~${econ.blendedEviction.toLocaleString()}</div>
            <div className="text-[#374151] text-[10px] mt-0.5">~{econ.uncontested.lostRentWeeks} wk timeline</div>
          </div>
          <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-xl px-3 py-2.5 text-center">
            <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">Cash for Keys</div>
            <div className="text-emerald-400 font-bold tabular-nums text-sm">~${econ.cfk.total.toLocaleString()}</div>
            <div className="text-[#374151] text-[10px] mt-0.5">~{econ.cfk.weeksTotal} wk timeline</div>
          </div>
          <div className={`rounded-xl px-3 py-2.5 text-center border ${econ.cfkSavings > 0 ? "bg-white/5 border-white/10" : "bg-red-500/8 border-red-500/15"}`}>
            <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">CFK saves</div>
            <div className={`font-bold tabular-nums text-sm ${econ.cfkSavings > 0 ? "text-white" : "text-red-400"}`}>
              {econ.cfkSavings > 0 ? `$${econ.cfkSavings.toLocaleString()}` : "—"}
            </div>
            <div className="text-[#374151] text-[10px] mt-0.5">
              {econ.cfkSavings > 0 ? `max offer $${econ.breakEvenOffer.toLocaleString()}` : "eviction cheaper"}
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className={`border rounded-xl px-4 py-3 mb-4 ${
          econ.recommendation === "cfk"
            ? "bg-emerald-500/5 border-emerald-500/20"
            : "bg-red-500/5 border-red-500/20"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={13} className={econ.recommendation === "cfk" ? "text-emerald-400 shrink-0" : "text-red-400 shrink-0"} />
            <div className="text-[#4b5563] text-xs uppercase tracking-wide">RentSentry recommends</div>
            <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
              econ.recommendationStrength === "strong" ? "bg-white/10 text-white" :
              econ.recommendationStrength === "moderate" ? "bg-yellow-500/15 text-yellow-400" :
              "bg-white/5 text-[#6b7280]"
            }`}>
              {econ.recommendationStrength === "strong" ? "Strong" : econ.recommendationStrength === "moderate" ? "Moderate" : "Close call"}
            </span>
          </div>
          <p className="text-white text-sm font-semibold mb-2">{recHeadline}</p>
          <ul className="space-y-1">
            {econ.reasoning.map((r, i) => (
              <li key={i} className="text-[#9ca3af] text-xs flex items-start gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[#374151] shrink-0 mt-1.5" />
                {r}
              </li>
            ))}
          </ul>
          {econ.recommendation === "cfk" && (
            <div className="mt-2 text-[#4b5563] text-[11px]">
              {propertyState ?? "National avg"} · max viable CFK offer: <span className="text-white font-medium">${econ.breakEvenOffer.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setPendingAction("cash_for_keys")}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold border transition-colors ${
              recAction === "cash_for_keys"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                : "bg-white/5 border-white/10 text-[#9ca3af] hover:bg-white/10 hover:text-white"
            }`}
          >
            <HandCoins size={15} />
            Offer Cash for Keys
            {recAction === "cash_for_keys" && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full ml-1">Recommended</span>
            )}
          </button>
          <button
            onClick={() => setPendingAction("legal_packet")}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold border transition-colors ${
              recAction === "legal_packet"
                ? "bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25"
                : "bg-white/5 border-white/10 text-[#9ca3af] hover:bg-white/10 hover:text-white"
            }`}
          >
            <Scale size={15} />
            Prepare UD Filing
            {recAction === "legal_packet" && (
              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full ml-1">Recommended</span>
            )}
          </button>
        </div>
        <p className="text-[#374151] text-xs mt-3">
          Estimates based on {propertyState ?? "national"} averages. RentSentry never auto-sends legal notices — you review every action.
        </p>
      </div>
    </>
  )
}
