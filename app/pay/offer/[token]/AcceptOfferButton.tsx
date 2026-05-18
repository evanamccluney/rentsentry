"use client"
import { useState } from "react"
import { CheckCircle2, Zap } from "lucide-react"

interface Props {
  token: string
  tenantName: string
  offerType: "pre_due_installment_offer" | "split_pay_offer"
  totalAmount: number
  balanceDue?: number
  rentAmount?: number
  maxInstallments: number
  minInstallments?: number
  includesNextMonth?: boolean
  feeRate: number
}

function buildSchedule(total: number, count: number): { amount: number; due_date: string }[] {
  const base = Math.floor((total / count) * 100) / 100
  const remainder = Math.round((total - base * (count - 1)) * 100) / 100
  const today = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i * 14)
    return {
      amount: i === count - 1 ? remainder : base,
      due_date: d.toISOString().split("T")[0],
    }
  })
}

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  })
}

export default function AcceptOfferButton({
  token, tenantName, offerType,
  totalAmount, balanceDue, rentAmount,
  maxInstallments, minInstallments = 2,
  includesNextMonth = false,
  feeRate,
}: Props) {
  // scope: "pastdue" = overdue only, "bundle" = overdue + next month
  const [scope, setScope] = useState<"pastdue" | "bundle">("pastdue")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autopay, setAutopay] = useState(false)

  // Effective amounts based on scope
  const pastDueOnly = includesNextMonth && scope === "pastdue"
  const effectiveTotal = pastDueOnly ? (balanceDue ?? totalAmount) : totalAmount
  const effectiveMax = pastDueOnly ? Math.min(3, maxInstallments) : maxInstallments

  const [installmentCount, setInstallmentCount] = useState(
    offerType === "split_pay_offer" ? minInstallments : maxInstallments
  )
  // Clamp when scope changes
  const clampedCount = Math.min(installmentCount, effectiveMax)

  const schedule = buildSchedule(effectiveTotal, clampedCount)
  const firstAmount = schedule[0]?.amount ?? 0
  const firstFee = Math.round(firstAmount * feeRate * 100) / 100

  async function handleAccept() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/payments/accept-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          enableAutopay: autopay,
          installmentCount: offerType === "split_pay_offer" ? clampedCount : undefined,
          pastDueOnly,
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || "Something went wrong. Contact your property manager.")
        setLoading(false)
      }
    } catch {
      setError("Network error. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Scope toggle — only shown when both months are bundled */}
      {offerType === "split_pay_offer" && includesNextMonth && (
        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-4">
          <p className="text-[#71717a] text-xs mb-3">What would you like to pay off?</p>
          <div className="space-y-2">
            <button
              onClick={() => { setScope("pastdue"); setInstallmentCount(minInstallments) }}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                scope === "pastdue"
                  ? "border-indigo-500/40 bg-indigo-500/10"
                  : "border-[#27272a] bg-white/[0.02] hover:border-[#3f3f46]"
              }`}
            >
              <div className={`text-sm font-semibold ${scope === "pastdue" ? "text-indigo-300" : "text-white"}`}>
                Just what I owe now — ${(balanceDue ?? totalAmount).toLocaleString()}
              </div>
              <div className="text-[#52525b] text-xs mt-0.5">
                Split your overdue balance into up to {Math.min(3, maxInstallments)} payments. Next month{"'"}s rent stays on its normal schedule.
              </div>
            </button>
            <button
              onClick={() => { setScope("bundle"); setInstallmentCount(minInstallments) }}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                scope === "bundle"
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-[#27272a] bg-white/[0.02] hover:border-[#3f3f46]"
              }`}
            >
              <div className={`text-sm font-semibold ${scope === "bundle" ? "text-amber-300" : "text-white"}`}>
                Bundle both months — ${totalAmount.toLocaleString()}
              </div>
              <div className="text-[#52525b] text-xs mt-0.5">
                Covers the overdue balance (${(balanceDue ?? 0).toLocaleString()}) and next month{"'"}s rent (${(rentAmount ?? 0).toLocaleString()}) — nothing else due next month.
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Installment count selector — only for split_pay_offer */}
      {offerType === "split_pay_offer" && (
        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-4">
          <p className="text-[#71717a] text-xs mb-3">How many payments?</p>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: effectiveMax - minInstallments + 1 }, (_, i) => {
              const count = minInstallments + i
              const perPayment = Math.floor((effectiveTotal / count) * 100) / 100
              return (
                <button
                  key={count}
                  onClick={() => setInstallmentCount(count)}
                  className={`flex flex-col items-center py-2.5 rounded-lg border text-center transition-colors ${
                    clampedCount === count
                      ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                      : "border-[#27272a] bg-white/[0.02] text-[#71717a] hover:border-[#3f3f46]"
                  }`}
                >
                  <span className="text-base font-bold leading-none">{count}</span>
                  <span className="text-[10px] mt-1 opacity-70">${perPayment.toLocaleString()}<br />each</span>
                </button>
              )
            })}
          </div>

          {/* Preview of chosen schedule */}
          <div className="mt-3 space-y-1.5">
            {schedule.map((inst, i) => {
              const fee = Math.round(inst.amount * feeRate * 100) / 100
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-[#52525b]">
                    {i === 0 ? "Pay now" : formatDate(inst.due_date)}
                  </span>
                  <span className="text-[#a1a1aa]">
                    ${inst.amount.toLocaleString()} <span className="text-[#52525b]">+${fee.toFixed(2)} fee</span>
                  </span>
                </div>
              )
            })}
            {pastDueOnly && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[#27272a] mt-1">
                <span className="text-[#52525b]">Next month{"'"}s rent</span>
                <span className="text-[#52525b]">due on normal schedule</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Autopay toggle */}
      <button
        onClick={() => setAutopay(v => !v)}
        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-start gap-3 ${
          autopay
            ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
            : "border-[#27272a] bg-white/[0.02] text-[#52525b] hover:text-[#71717a]"
        }`}
      >
        <span className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${autopay ? "bg-indigo-500 border-indigo-500" : "border-[#3f3f46]"}`}>
          {autopay && <span className="w-2 h-2 rounded-sm bg-white" />}
        </span>
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Zap size={12} className={autopay ? "text-indigo-400" : "text-[#52525b]"} />
            Enable monthly autopay
          </div>
          <p className="text-xs opacity-70 mt-0.5 leading-relaxed">
            Save your payment method and automatically pay each month. Cancel anytime through your property manager.
          </p>
        </div>
      </button>

      <button
        onClick={handleAccept}
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-semibold text-sm hover:bg-emerald-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <CheckCircle2 size={15} />
        {loading
          ? "Setting up…"
          : `Accept & Pay $${firstAmount.toLocaleString()} now (+$${firstFee.toFixed(2)} fee)`}
      </button>
      {error && <p className="text-red-400 text-xs text-center mt-3">{error}</p>}
    </div>
  )
}
