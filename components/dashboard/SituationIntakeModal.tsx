"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { ClipboardList, X } from "lucide-react"

const RESPONSE_TYPES = [
  { value: "no_response", label: "No response" },
  { value: "promised_to_pay", label: "Promised to pay" },
  { value: "hardship", label: "Hardship" },
  { value: "dispute_or_repair", label: "Dispute / repair issue" },
  { value: "wants_to_move", label: "Wants to move" },
  { value: "other", label: "Other" },
]

const OUTCOMES = [
  { value: "recover_rent", label: "Recover rent" },
  { value: "payment_plan", label: "Payment plan" },
  { value: "voluntary_moveout", label: "Voluntary move-out" },
  { value: "legal_escalation", label: "Legal escalation" },
  { value: "unsure", label: "Unsure" },
]

interface Props {
  tenantId: string
  tenantName: string
  onClose: () => void
  onSaved: () => void
}

export default function SituationIntakeModal({ tenantId, tenantName, onClose, onSaved }: Props) {
  const [responseType, setResponseType] = useState("no_response")
  const [tenantStatement, setTenantStatement] = useState("")
  const [promisedDate, setPromisedDate] = useState("")
  const [promisedAmount, setPromisedAmount] = useState("")
  const [brokenPromise, setBrokenPromise] = useState(false)
  const [repairIssue, setRepairIssue] = useState(false)
  const [repairNotes, setRepairNotes] = useState("")
  const [preferredOutcome, setPreferredOutcome] = useState("recover_rent")
  const [saving, setSaving] = useState(false)

  async function save() {
    const hasStatement = tenantStatement.trim().length > 0
    const hasRepairNotes = !repairIssue || repairNotes.trim().length > 0
    if (!hasStatement && responseType !== "no_response") {
      toast.error("Add what the tenant said.")
      return
    }
    if (!hasRepairNotes) {
      toast.error("Add repair/access notes.")
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const responseLabel = RESPONSE_TYPES.find(t => t.value === responseType)?.label ?? responseType
    const outcomeLabel = OUTCOMES.find(o => o.value === preferredOutcome)?.label ?? preferredOutcome
    const notes = [
      `Response: ${responseLabel}`,
      tenantStatement.trim() ? `Tenant said: ${tenantStatement.trim()}` : "Tenant has not responded.",
      promisedDate || promisedAmount
        ? `Promise: ${promisedAmount ? `$${Number(promisedAmount).toLocaleString()}` : "amount not specified"}${promisedDate ? ` by ${promisedDate}` : ""}`
        : null,
      brokenPromise ? "Prior promise already broken." : null,
      repairIssue ? `Repair/access issue: ${repairNotes.trim()}` : null,
      `Preferred outcome: ${outcomeLabel}`,
    ].filter(Boolean).join("\n")

    const { error } = await supabase.from("interventions").insert({
      tenant_id: tenantId,
      user_id: user.id,
      type: "situation_intake",
      status: "logged",
      sent_at: new Date().toISOString(),
      notes,
      snapshot: {
        response_type: responseType,
        tenant_statement: tenantStatement.trim() || null,
        promised_date: promisedDate || null,
        promised_amount: promisedAmount ? parseFloat(promisedAmount) : null,
        broken_promise: brokenPromise,
        repair_issue: repairIssue,
        repair_notes: repairIssue ? repairNotes.trim() : null,
        preferred_outcome: preferredOutcome,
      },
    })

    if (error) { toast.error("Could not save situation."); setSaving(false); return }
    toast.success("Situation logged.")
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <ClipboardList size={14} className="text-violet-300" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Log Current Situation</h3>
                <p className="text-[#4b5563] text-xs">{tenantName}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[#6b7280] text-xs uppercase tracking-wide block mb-2">Tenant response</label>
              <div className="grid grid-cols-2 gap-2">
                {RESPONSE_TYPES.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setResponseType(opt.value)}
                    className={`text-left px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                      responseType === opt.value
                        ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                        : "border-white/5 bg-white/[0.02] text-[#6b7280] hover:border-white/10 hover:text-[#9ca3af]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">What happened / what they said</label>
              <textarea
                value={tenantStatement}
                onChange={e => setTenantStatement(e.target.value)}
                placeholder="e.g. Tenant said they lost hours at work and can pay $700 Friday. No response after two texts. Tenant disputed balance. Tenant mentioned mold."
                rows={3}
                autoFocus
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20 resize-none leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">Promised date</label>
                <input
                  type="date"
                  value={promisedDate}
                  onChange={e => setPromisedDate(e.target.value)}
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">Promised amount</label>
                <input
                  type="number"
                  value={promisedAmount}
                  onChange={e => setPromisedAmount(e.target.value)}
                  placeholder="e.g. 700"
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                <span className="text-[#9ca3af] text-sm">Broken prior promise</span>
                <input type="checkbox" checked={brokenPromise} onChange={e => setBrokenPromise(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                <span className="text-[#9ca3af] text-sm">Repair/access issue</span>
                <input type="checkbox" checked={repairIssue} onChange={e => setRepairIssue(e.target.checked)} />
              </label>
            </div>

            {repairIssue && (
              <div>
                <label className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">Repair/access details</label>
                <textarea
                  value={repairNotes}
                  onChange={e => setRepairNotes(e.target.value)}
                  placeholder="e.g. Reported bathroom mold on Apr 2. Vendor offered Apr 4 access window. Tenant refused entry."
                  rows={2}
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20 resize-none leading-relaxed"
                />
              </div>
            )}

            <div>
              <label className="text-[#6b7280] text-xs uppercase tracking-wide block mb-2">Preferred outcome</label>
              <div className="flex flex-wrap gap-2">
                {OUTCOMES.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPreferredOutcome(opt.value)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      preferredOutcome === opt.value
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                        : "border-white/5 bg-white/[0.02] text-[#6b7280] hover:border-white/10 hover:text-[#9ca3af]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
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
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-500 hover:bg-violet-600 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Situation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
