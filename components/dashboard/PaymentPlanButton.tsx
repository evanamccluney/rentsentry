"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, X } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function PaymentPlanButton({
  tenantId,
  tenantName,
  balanceDue,
  stripeConnected,
}: {
  tenantId: string
  tenantName: string
  balanceDue: number
  stripeConnected: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [split, setSplit] = useState<2 | 3>(2)
  const [frequency, setFrequency] = useState<"biweekly" | "monthly">("biweekly")
  const [loading, setLoading] = useState(false)

  if (!stripeConnected || balanceDue <= 0) return null

  const FEE_RATE = 0.005

  function getInstallments() {
    const gapDays = frequency === "biweekly" ? 14 : 30
    if (split === 2) {
      const half = Math.round(balanceDue / 2 * 100) / 100
      return [
        { amount: half, due_date: addDays(0) },
        { amount: Math.round((balanceDue - half) * 100) / 100, due_date: addDays(gapDays) },
      ]
    }
    const third = Math.round(balanceDue / 3 * 100) / 100
    const last = Math.round((balanceDue - third * 2) * 100) / 100
    return [
      { amount: third, due_date: addDays(0) },
      { amount: third, due_date: addDays(gapDays) },
      { amount: last, due_date: addDays(gapDays * 2) },
    ]
  }

  async function handleCreate() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/payments/create-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ tenantId, installments: getInstallments(), frequency }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Payment plan created — first link sent to ${tenantName} via SMS`)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(data.error || "Could not create payment plan")
      }
    } catch {
      toast.error("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const installments = getInstallments()

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium transition-colors"
      >
        <CalendarClock size={12} />
        Payment Plan
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-[#0f1623] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-semibold text-base">Payment Plan</h2>
                <p className="text-[#6b7280] text-xs mt-0.5">{tenantName} · ${balanceDue.toLocaleString()} owed</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#4b5563] hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Split selector */}
            <div className="mb-4">
              <label className="text-[#4b5563] text-xs uppercase tracking-wide mb-2 block">Number of payments</label>
              <div className="flex gap-2">
                {([2, 3] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setSplit(n)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      split === n
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                        : "bg-white/[0.03] border-white/[0.08] text-[#6b7280] hover:text-white"
                    }`}
                  >
                    {n} Payments
                  </button>
                ))}
              </div>
            </div>

            {/* Frequency selector */}
            <div className="mb-5">
              <label className="text-[#4b5563] text-xs uppercase tracking-wide mb-2 block">Frequency</label>
              <div className="flex gap-2">
                {(["biweekly", "monthly"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFrequency(f)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      frequency === f
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                        : "bg-white/[0.03] border-white/[0.08] text-[#6b7280] hover:text-white"
                    }`}
                  >
                    {f === "biweekly" ? "Every 2 Weeks" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            {/* Installment preview */}
            <div className="mb-5 space-y-2">
              <label className="text-[#4b5563] text-xs uppercase tracking-wide block">Installment breakdown</label>
              {installments.map((inst, i) => {
                const fee = Math.round(inst.amount * FEE_RATE * 100) / 100
                return (
                  <div key={i} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                    <div>
                      <div className="text-white text-sm font-medium">Installment {i + 1}</div>
                      <div className="text-[#4b5563] text-xs">Due {formatDate(inst.due_date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-white text-sm font-semibold">${inst.amount.toLocaleString()}</div>
                      <div className="text-[#4b5563] text-xs">+${fee.toFixed(2)} fee</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-[#374151] text-xs mb-5">
              First link sent immediately via SMS. Tenant pays 0.5% processing fee per installment. You receive the full amount.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-[#6b7280] text-sm font-medium hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-sm font-semibold hover:bg-amber-500/25 transition-colors disabled:opacity-50"
              >
                {loading ? "Creating…" : "Create Plan & Send Link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
