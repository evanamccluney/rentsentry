"use client"
import { useState } from "react"
import { X, ClipboardList } from "lucide-react"

export interface IntakeAnswers {
  contact: "yes" | "no" | "stopped_responding"
  reason: "job_loss" | "disputing_charges" | "maintenance_issue" | "no_reason" | "other"
  partial_payment: "yes" | "no"
  tenancy_length: string
}

interface Props {
  tenantName: string
  tenancyLength: string
  tier: string
  onComplete: (answers: IntakeAnswers) => void
  onSkip: () => void
  onClose: () => void
}

const CONTACT_OPTIONS = [
  { value: "yes",               label: "Yes, we've spoken recently" },
  { value: "no",                label: "No contact yet" },
  { value: "stopped_responding", label: "They stopped responding" },
] as const

const REASON_OPTIONS = [
  { value: "job_loss",           label: "Job loss / financial hardship" },
  { value: "disputing_charges",  label: "Disputing charges or balance" },
  { value: "maintenance_issue",  label: "Maintenance or habitability issue" },
  { value: "no_reason",          label: "No reason given" },
  { value: "other",              label: "Other" },
] as const

const TIER_LABELS: Record<string, string> = {
  pay_or_quit:  "Pay or Quit Notice",
  cash_for_keys: "Cash for Keys Offer",
  legal:         "Legal Packet",
}

export default function EscalationIntakeModal({ tenantName, tenancyLength, tier, onComplete, onSkip, onClose }: Props) {
  const [contact, setContact] = useState<IntakeAnswers["contact"] | null>(null)
  const [reason, setReason] = useState<IntakeAnswers["reason"] | null>(null)
  const [partialPayment, setPartialPayment] = useState<IntakeAnswers["partial_payment"] | null>(null)

  const allAnswered = contact && reason && partialPayment
  const tierLabel = TIER_LABELS[tier] ?? "this action"

  function handleSubmit() {
    if (!allAnswered) return
    onComplete({
      contact,
      reason,
      partial_payment: partialPayment,
      tenancy_length: tenancyLength,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <ClipboardList size={14} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Before sending {tierLabel}</h2>
              <p className="text-[#4b5563] text-xs mt-0.5">3 quick questions about {tenantName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors mt-0.5">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Tenancy length — auto-filled */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-[#4b5563] text-xs">Tenancy length</span>
            <span className="text-white text-xs font-medium">{tenancyLength}</span>
          </div>

          {/* Q1 */}
          <div>
            <p className="text-white text-sm font-medium mb-3">Have you been in contact with this tenant?</p>
            <div className="space-y-2">
              {CONTACT_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${contact === opt.value ? "border-blue-500 bg-blue-500" : "border-white/20 group-hover:border-white/40"}`}>
                    {contact === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className={`text-sm transition-colors ${contact === opt.value ? "text-white" : "text-[#6b7280] group-hover:text-[#9ca3af]"}`}>
                    {opt.label}
                  </span>
                  <input type="radio" className="sr-only" checked={contact === opt.value} onChange={() => setContact(opt.value)} />
                </label>
              ))}
            </div>
          </div>

          {/* Q2 */}
          <div>
            <p className="text-white text-sm font-medium mb-3">Did they give a reason for non-payment?</p>
            <div className="space-y-2">
              {REASON_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${reason === opt.value ? "border-blue-500 bg-blue-500" : "border-white/20 group-hover:border-white/40"}`}>
                    {reason === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className={`text-sm transition-colors ${reason === opt.value ? "text-white" : "text-[#6b7280] group-hover:text-[#9ca3af]"}`}>
                    {opt.label}
                  </span>
                  <input type="radio" className="sr-only" checked={reason === opt.value} onChange={() => setReason(opt.value)} />
                </label>
              ))}
            </div>
          </div>

          {/* Q3 */}
          <div>
            <p className="text-white text-sm font-medium mb-3">Have they made any payment recently?</p>
            <div className="space-y-2">
              {([
                { value: "yes", label: "Yes — I'll log it separately" },
                { value: "no",  label: "No payment received" },
              ] as const).map(opt => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${partialPayment === opt.value ? "border-blue-500 bg-blue-500" : "border-white/20 group-hover:border-white/40"}`}>
                    {partialPayment === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className={`text-sm transition-colors ${partialPayment === opt.value ? "text-white" : "text-[#6b7280] group-hover:text-[#9ca3af]"}`}>
                    {opt.label}
                  </span>
                  <input type="radio" className="sr-only" checked={partialPayment === opt.value} onChange={() => setPartialPayment(opt.value)} />
                </label>
              ))}
            </div>
          </div>

          {/* Maintenance warning */}
          {reason === "maintenance_issue" && (
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl px-4 py-3">
              <p className="text-orange-400 text-xs font-medium mb-1">Active maintenance dispute detected</p>
              <p className="text-[#6b7280] text-xs leading-relaxed">
                Sending a pay or quit notice while a habitability complaint is open may be considered retaliation in many states. Consider resolving the maintenance issue first or consult an attorney.
              </p>
            </div>
          )}

          {/* Disputing warning */}
          {reason === "disputing_charges" && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
              <p className="text-amber-400 text-xs font-medium mb-1">Charge dispute flagged</p>
              <p className="text-[#6b7280] text-xs leading-relaxed">
                If the tenant is disputing the amount owed, confirm the correct balance before serving a notice. An incorrect amount can invalidate the notice.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onSkip}
            className="py-2.5 px-4 rounded-xl text-sm font-semibold text-[#4b5563] hover:text-[#6b7280] bg-white/5 hover:bg-white/10 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {allAnswered ? "Continue to action" : "Answer all 3 to continue"}
          </button>
        </div>
      </div>
    </div>
  )
}
