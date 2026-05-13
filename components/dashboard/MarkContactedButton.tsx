"use client"
import { useState } from "react"
import { CheckCircle2 } from "lucide-react"

export default function MarkContactedButton({ tenantId }: { tenantId: string }) {
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          type: "contact_noted",
          notes: "Marked as contacted from notifications page",
          snapshot: null,
          phone: null,
          name: "",
          message: null,
        }),
      })
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 size={11} /> Contacted
      </span>
    )
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="text-xs font-medium text-[#6b7280] hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.07] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
    >
      {loading ? "Saving…" : "Mark as contacted"}
    </button>
  )
}
