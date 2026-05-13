"use client"
import { useState } from "react"
import { CheckCircle2 } from "lucide-react"

interface Props {
  tenantId: string
  tenantName: string
}

const OPTIONS = [
  { key: "responded",    label: "They responded",          note: "Tenant responded to outbound contact" },
  { key: "no_response",  label: "Still no response",       note: "No response — tenant did not reply to outbound contact" },
  { key: "reached_out",  label: "They reached out to me",  note: "Tenant initiated contact with landlord directly" },
] as const

export default function TenantResponsePrompt({ tenantId, tenantName }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) return null

  async function log(option: typeof OPTIONS[number]) {
    setLoading(option.key)
    try {
      await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          type: "tenant_response",
          phone: null,
          name: tenantName,
          snapshot: { triggered_by: "user", response_type: option.key },
          notes: option.note,
        }),
      })
      setDone(true)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl px-5 py-4 mb-5">
      <p className="text-[#6b7280] text-xs mb-3">Did {tenantName} respond to your last message?</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => log(opt)}
            disabled={!!loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-[#9ca3af] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            {loading === opt.key ? (
              <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <CheckCircle2 size={11} className="text-[#4b5563]" />
            )}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
