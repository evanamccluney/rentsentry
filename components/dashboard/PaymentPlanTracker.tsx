"use client"
import { useState } from "react"
import { CheckCircle2, Clock, AlertCircle } from "lucide-react"

interface Installment {
  amount: number
  due_date: string
}

interface Props {
  tenantId: string
  installments: Installment[]
  paidIndices: number[]
  totalPlanAmount: number
  frequency: string
}

export default function PaymentPlanTracker({
  tenantId,
  installments,
  paidIndices: initialPaid,
  totalPlanAmount,
  frequency,
}: Props) {
  const [paid, setPaid] = useState<Set<number>>(new Set(initialPaid))
  const [loading, setLoading] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split("T")[0]

  async function markPaid(index: number, amount: number) {
    setLoading(index)
    setError(null)
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          amount,
          date: today,
          note: `installment:${index}`,
        }),
      })
      if (!res.ok) throw new Error()
      setPaid(prev => new Set([...prev, index]))
    } catch {
      setError("Failed to record payment. Try again.")
    } finally {
      setLoading(null)
    }
  }

  const paidCount = paid.size
  const amountPaid = installments.filter((_, i) => paid.has(i)).reduce((s, inst) => s + inst.amount, 0)
  const remaining = totalPlanAmount - amountPaid
  const allPaid = paidCount === installments.length

  const freqLabel = frequency === "biweekly" ? "Every 2 weeks" : frequency.charAt(0).toUpperCase() + frequency.slice(1)

  return (
    <div className={`border rounded-2xl p-5 mb-5 ${allPaid ? "bg-emerald-500/5 border-emerald-500/20" : "bg-[#111827] border-amber-500/20"}`}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-white font-semibold text-sm">
          {allPaid ? "Payment Plan — Completed" : "Active Payment Plan"}
        </h2>
        <div className="text-right">
          <div className={`text-sm font-bold tabular-nums ${allPaid ? "text-emerald-400" : "text-amber-400"}`}>
            {allPaid ? "Paid in full" : `$${remaining.toLocaleString()} left`}
          </div>
        </div>
      </div>

      <div className="text-[#9ca3af] text-xs mb-4">
        {freqLabel} · ${totalPlanAmount.toLocaleString()} total · {paidCount}/{installments.length} installments paid
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-white/5 rounded-full mb-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${allPaid ? "bg-emerald-500" : "bg-amber-500"}`}
          style={{ width: `${installments.length > 0 ? (paidCount / installments.length) * 100 : 0}%` }}
        />
      </div>

      <div className="space-y-2">
        {installments.map((inst, i) => {
          const isPaid = paid.has(i)
          const isOverdue = !isPaid && inst.due_date < today
          const isDueToday = !isPaid && inst.due_date === today

          return (
            <div
              key={i}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                isPaid
                  ? "bg-emerald-500/5 border-emerald-500/15"
                  : isOverdue
                  ? "bg-red-500/5 border-red-500/15"
                  : isDueToday
                  ? "bg-amber-500/5 border-amber-500/20"
                  : "bg-white/[0.02] border-white/[0.06]"
              }`}
            >
              <div className="flex items-center gap-3">
                {isPaid
                  ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  : isOverdue
                  ? <AlertCircle size={14} className="text-red-400 shrink-0" />
                  : <Clock size={14} className={isDueToday ? "text-amber-400 shrink-0" : "text-[#4b5563] shrink-0"} />
                }
                <div>
                  <div className={`text-sm font-medium ${isPaid ? "text-emerald-400" : isOverdue ? "text-red-400" : isDueToday ? "text-amber-300" : "text-white"}`}>
                    Installment {i + 1} — ${inst.amount.toLocaleString()}
                  </div>
                  <div className="text-[#4b5563] text-xs">
                    Due {new Date(inst.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {isPaid && <span className="text-emerald-600 ml-1.5">· Paid</span>}
                    {isOverdue && <span className="text-red-500 ml-1.5">· Overdue</span>}
                    {isDueToday && <span className="text-amber-500 ml-1.5">· Due today</span>}
                  </div>
                </div>
              </div>

              {!isPaid && (
                <button
                  onClick={() => markPaid(i, inst.amount)}
                  disabled={loading === i}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 shrink-0 ml-3"
                >
                  {loading === i ? "Saving…" : "Mark Paid"}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
    </div>
  )
}
