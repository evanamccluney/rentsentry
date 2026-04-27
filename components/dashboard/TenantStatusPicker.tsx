"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { ChevronDown } from "lucide-react"

const STATUS_OPTIONS = [
  { value: null,              label: "Active",          color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  { value: "payment_plan",   label: "Payment Plan",    color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  { value: "eviction_filed", label: "Eviction Filed",  color: "bg-red-500/15 text-red-400 border-red-500/20" },
  { value: "vacated",        label: "Vacated",         color: "bg-white/10 text-[#9ca3af] border-white/10" },
  { value: "collections",   label: "Collections",     color: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
]

export default function TenantStatusPicker({
  tenantId,
  initialStatus,
}: {
  tenantId: string
  initialStatus: string | null
}) {
  const [status, setStatus] = useState<string | null>(initialStatus)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const current = STATUS_OPTIONS.find(o => o.value === status) ?? STATUS_OPTIONS[0]

  async function pick(value: string | null) {
    setSaving(true)
    setOpen(false)
    const supabase = createClient()
    const { error } = await supabase
      .from("tenants")
      .update({
        resolution_status: value,
        ...(value === "vacated" ? { status: "vacated" } : {}),
      })
      .eq("id", tenantId)
    if (error) { toast.error("Could not update status."); setSaving(false); return }
    setStatus(value)
    toast.success("Status updated.")
    setSaving(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${current.color} disabled:opacity-50`}
      >
        {saving ? "Saving…" : current.label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-[#111827] border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[160px]">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => pick(opt.value)}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors hover:bg-white/5 ${
                  status === opt.value ? "text-white bg-white/[0.04]" : "text-[#9ca3af]"
                }`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${
                  opt.value === null ? "bg-emerald-500" :
                  opt.value === "payment_plan" ? "bg-amber-500" :
                  opt.value === "eviction_filed" ? "bg-red-500" :
                  opt.value === "vacated" ? "bg-[#4b5563]" :
                  "bg-purple-500"
                }`} />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
