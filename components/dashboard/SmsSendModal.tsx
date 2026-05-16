"use client"
import { useState, useEffect } from "react"
import { Send, X, Sparkles, Loader2, Link } from "lucide-react"

interface TenantContext {
  name: string
  phone?: string | null
  balance_due?: number
  rent_amount?: number
  days_past_due?: number
  days_late_avg?: number
  late_payment_count?: number
  previous_delinquency?: boolean
  tier?: string
}

interface Props {
  tenantId: string
  actionType: string
  tenant: TenantContext
  onConfirm: (messageBody: string) => void
  onCancel: () => void
  loading: boolean
}

// For split_pay_offer the link is generated server-side — show a static preview
function splitPayPreview(tenant: TenantContext): string {
  const firstName = (tenant.name || "Resident").split(" ")[0]
  const balance = (tenant.balance_due ?? 0).toLocaleString()
  return `Hi ${firstName}, your property manager is offering to split your $${balance} past-due balance into installments. Choose your plan: [payment link] Reply STOP to opt out.`
}

export default function SmsSendModal({ tenantId, actionType, tenant, onConfirm, onCancel, loading }: Props) {
  const isSplitPay = actionType === "split_pay_offer"
  const [draft, setDraft] = useState(() => isSplitPay ? splitPayPreview(tenant) : "")
  const [fetching, setFetching] = useState(!isSplitPay)
  const [fetchFailed, setFetchFailed] = useState(false)
  const hasPhone = !!tenant.phone

  async function fetchDraft() {
    if (isSplitPay) return
    setFetching(true)
    setFetchFailed(false)
    try {
      const res = await fetch("/api/draft-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType,
          tenant: {
            name: tenant.name,
            balance_due: tenant.balance_due ?? 0,
            rent_amount: tenant.rent_amount ?? 0,
            days_past_due: tenant.days_past_due ?? 0,
            days_late_avg: tenant.days_late_avg ?? 0,
            late_payment_count: tenant.late_payment_count ?? 0,
            previous_delinquency: tenant.previous_delinquency ?? false,
            tier: tenant.tier ?? "",
          },
        }),
      })
      const data = await res.json()
      if (data.draft) {
        setDraft(data.draft)
      } else {
        setFetchFailed(true)
      }
    } catch {
      setFetchFailed(true)
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => { if (!isSplitPay) fetchDraft() }, [])

  const charCount = draft.length
  const overLimit = charCount > 320
  const segmentCount = charCount <= 160 ? 1 : charCount <= 320 ? 2 : Math.ceil(charCount / 153)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold text-base">Review SMS Before Sending</h3>
            <button onClick={onCancel} className="text-[#4b5563] hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mb-5">
            <Sparkles size={11} className="text-[#6b7280]" />
            <p className="text-[#4b5563] text-xs">AI-drafted based on tenant context · edit freely before approving</p>
          </div>

          {/* To */}
          <div className="flex gap-3 text-sm items-baseline mb-4">
            <span className="text-[#4b5563] w-14 shrink-0 text-xs uppercase tracking-wide">To</span>
            {hasPhone
              ? <span className="text-white font-mono">{tenant.phone}</span>
              : <span className="text-orange-400 text-xs">No phone on file — action will be logged only</span>
            }
          </div>

          {/* Split-pay notice */}
          {isSplitPay && (
            <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2.5 mb-4">
              <Link size={12} className="text-blue-400 mt-0.5 shrink-0" />
              <p className="text-blue-300 text-xs leading-relaxed">
                A secure payment link and your display name are auto-inserted when sent. The preview below shows the template.
              </p>
            </div>
          )}

          {/* SMS bubble */}
          <div className="bg-[#0d1117] border border-white/5 rounded-2xl rounded-tl-sm p-4 mb-1">
            {fetching ? (
              <div>
                <div className="space-y-2 mb-3">
                  <div className="h-3 bg-white/5 rounded-full animate-pulse w-full" />
                  <div className="h-3 bg-white/5 rounded-full animate-pulse w-5/6" />
                  <div className="h-3 bg-white/5 rounded-full animate-pulse w-3/4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Loader2 size={11} className="text-[#4b5563] animate-spin" />
                  <span className="text-[#4b5563] text-[11px]">Drafting message…</span>
                </div>
              </div>
            ) : fetchFailed ? (
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="w-full bg-transparent text-[#d1d5db] text-sm leading-relaxed resize-none outline-none min-h-[80px] placeholder:text-[#374151]"
                placeholder="Draft failed — type your message here…"
                maxLength={640}
                autoFocus
              />
            ) : isSplitPay ? (
              <p className="text-[#d1d5db] text-sm leading-relaxed">{draft}</p>
            ) : (
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="w-full bg-transparent text-[#d1d5db] text-sm leading-relaxed resize-none outline-none min-h-[80px]"
                maxLength={640}
                autoFocus
              />
            )}
          </div>

          {/* Metadata row */}
          <div className="flex justify-between items-center mb-4">
            <span className={`text-[10px] ${overLimit ? "text-red-400" : "text-[#2e3a50]"}`}>
              SMS · {charCount} chars · {segmentCount} segment{segmentCount !== 1 ? "s" : ""}
            </span>
            {!isSplitPay && (
              <button
                onClick={fetchDraft}
                disabled={fetching}
                className="flex items-center gap-1 text-[#4b5563] hover:text-white text-[10px] transition-colors disabled:opacity-40"
              >
                <Sparkles size={10} />
                Regenerate
              </button>
            )}
          </div>

          <p className="text-[#374151] text-xs mb-5">
            Logged permanently to this tenant&apos;s history regardless of delivery
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(draft)}
              disabled={loading || fetching || !draft.trim() || overLimit}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Send size={13} />
              {loading ? "Sending…" : "Approve & Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
