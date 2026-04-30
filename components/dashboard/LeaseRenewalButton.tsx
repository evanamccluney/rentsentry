"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { RefreshCw, X } from "lucide-react"

interface Props {
  tenantId: string
  tenantName: string
  currentLeaseEnd: string | null
  currentRent: number | null
}

export default function LeaseRenewalButton({ tenantId, tenantName, currentLeaseEnd, currentRent }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  // Default new start = day after current end, or today
  const defaultStart = currentLeaseEnd
    ? new Date(new Date(currentLeaseEnd).getTime() + 86400000).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0]

  // Default new end = 1 year after new start
  const defaultEnd = new Date(new Date(defaultStart).getTime() + 365 * 86400000).toISOString().split("T")[0]

  const [leaseStart, setLeaseStart] = useState(defaultStart)
  const [leaseEnd, setLeaseEnd] = useState(defaultEnd)
  const [rent, setRent] = useState(String(currentRent ?? ""))

  function close() {
    setOpen(false)
    setLeaseStart(defaultStart)
    setLeaseEnd(defaultEnd)
    setRent(String(currentRent ?? ""))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!leaseStart || !leaseEnd) { toast.error("Enter both start and end dates."); return }
    if (new Date(leaseEnd) <= new Date(leaseStart)) { toast.error("End date must be after start date."); return }

    setSaving(true)
    const supabase = createClient()
    const rentAmount = parseFloat(rent)

    const { error } = await supabase
      .from("tenants")
      .update({
        lease_start: leaseStart,
        lease_end: leaseEnd,
        ...(rentAmount > 0 ? { rent_amount: rentAmount } : {}),
      })
      .eq("id", tenantId)

    setSaving(false)

    if (error) { toast.error(error.message); return }
    toast.success(`Lease renewed for ${tenantName}.`)
    close()
    router.refresh()
  }

  return (
    <>
      <button
        onClick={e => { e.preventDefault(); setOpen(true) }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors shrink-0"
      >
        <RefreshCw size={11} />
        Renew
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <form onSubmit={submit}>
              <div className="flex items-center justify-between p-5 border-b border-white/5">
                <div>
                  <h3 className="text-white font-semibold">Renew Lease</h3>
                  <p className="text-[#4b5563] text-xs mt-0.5">{tenantName}</p>
                </div>
                <button type="button" onClick={close} className="text-[#4b5563] hover:text-white transition-colors">
                  <X size={15} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">New Start</label>
                    <input
                      type="date"
                      value={leaseStart}
                      onChange={e => setLeaseStart(e.target.value)}
                      required
                      className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20"
                    />
                  </div>
                  <div>
                    <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">New End</label>
                    <input
                      type="date"
                      value={leaseEnd}
                      onChange={e => setLeaseEnd(e.target.value)}
                      required
                      className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">
                    Monthly Rent <span className="text-[#2e3a50] normal-case">(leave unchanged to keep current)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b5563] text-sm">$</span>
                    <input
                      type="number"
                      value={rent}
                      onChange={e => setRent(e.target.value)}
                      placeholder={String(currentRent ?? "0")}
                      min={0}
                      className="w-full bg-[#0d1117] border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white placeholder-[#374151] focus:outline-none focus:border-white/20"
                    />
                  </div>
                </div>

                {currentLeaseEnd && (
                  <div className="text-[#374151] text-xs bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2">
                    Previous lease ended{" "}
                    {new Date(currentLeaseEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}
              </div>

              <div className="flex gap-3 px-5 pb-5">
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <RefreshCw size={13} />
                  {saving ? "Saving…" : "Confirm Renewal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
