"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { X, Heart } from "lucide-react"

const HARDSHIP_TYPES = [
  { value: "job_loss",          label: "Job Loss / Income Drop" },
  { value: "medical",           label: "Medical Emergency" },
  { value: "family_emergency",  label: "Family Emergency" },
  { value: "other",             label: "Other" },
]

interface Props {
  tenantId: string
  tenantName: string
  onClose: () => void
  onSaved: () => void
}

export default function HardshipModal({ tenantId, tenantName, onClose, onSaved }: Props) {
  const [hardshipType, setHardshipType] = useState("job_loss")
  const [notes, setNotes] = useState("")
  const [graceAgreed, setGraceAgreed] = useState(false)
  const [graceUntil, setGraceUntil] = useState("")
  const [promisedAmount, setPromisedAmount] = useState("")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!notes.trim()) { toast.error("Add notes about the situation."); return }
    if (graceAgreed && !graceUntil) { toast.error("Enter a grace period end date."); return }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase.from("interventions").insert({
      tenant_id: tenantId,
      user_id: user.id,
      type: "hardship_checkin",
      status: "logged",
      sent_at: new Date().toISOString(),
      notes: notes.trim(),
      snapshot: {
        hardship_type: hardshipType,
        grace_agreed: graceAgreed,
        grace_until: graceAgreed ? graceUntil : null,
        promised_amount: promisedAmount ? parseFloat(promisedAmount) : null,
      },
    })

    if (error) { toast.error("Could not save."); setSaving(false); return }
    toast.success("Hardship logged.")
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Heart size={14} className="text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Log Hardship Check-in</h3>
                <p className="text-[#4b5563] text-xs">{tenantName}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Hardship type */}
            <div>
              <label className="text-[#6b7280] text-xs uppercase tracking-wide block mb-2">Situation</label>
              <div className="grid grid-cols-2 gap-2">
                {HARDSHIP_TYPES.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setHardshipType(opt.value)}
                    className={`text-left px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                      hardshipType === opt.value
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                        : "border-white/5 bg-white/[0.02] text-[#6b7280] hover:border-white/10 hover:text-[#9ca3af]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">What they said / PM notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Called on 4/26 — said she was laid off last week. Expecting new job by mid-May. Promised $800 by the 15th."
                rows={3}
                autoFocus
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20 resize-none leading-relaxed"
              />
            </div>

            {/* Grace period */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[#6b7280] text-xs uppercase tracking-wide">Grace Period Agreed</label>
                <button
                  onClick={() => setGraceAgreed(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${graceAgreed ? "bg-blue-500" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${graceAgreed ? "left-4" : "left-0.5"}`} />
                </button>
              </div>

              {graceAgreed && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-[#4b5563] text-xs block mb-1">Grace until</label>
                    <input
                      type="date"
                      value={graceUntil}
                      onChange={e => setGraceUntil(e.target.value)}
                      className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-white/20"
                    />
                  </div>
                  <div>
                    <label className="text-[#4b5563] text-xs block mb-1">Promised amount <span className="text-[#374151]">(optional)</span></label>
                    <input
                      type="number"
                      value={promisedAmount}
                      onChange={e => setPromisedAmount(e.target.value)}
                      placeholder="e.g. 800"
                      className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2 placeholder:text-[#374151] focus:outline-none focus:border-white/20"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Log Hardship"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
