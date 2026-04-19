"use client"
import { useState } from "react"
import { toast } from "sonner"
import { Send, X } from "lucide-react"

const SMS_PREVIEWS: Record<string, (name: string) => string> = {
  payment_reminder: (name) =>
    `Hi ${name}, this is a reminder that rent is due on the 1st. Please ensure payment is ready. Contact your property manager with any questions.`,
  proactive_reminder: (name) =>
    `Hi ${name}, rent is due on the 1st. Based on your payment history we wanted to reach out early. Contact your property manager with any questions.`,
  // card_expiry_alert kept for backward compat
  card_expiry_alert: (name) =>
    `Hi ${name}, your payment method on file may need attention. Please confirm or update it before the 1st to avoid any issues with your tenancy.`,
  split_pay_offer: (name) =>
    `Hi ${name}, your property manager is offering a flexible split-payment option this month. Reply or call to arrange installments before the 1st.`,
  cash_for_keys: (name) =>
    `Hi ${name}, your property manager has a time-sensitive offer regarding your unit. Please contact them within 5 days to discuss your options.`,
  legal_packet: (name) =>
    `Hi ${name}, your account is significantly overdue and legal proceedings are being prepared. Contact your property manager immediately to resolve this.`,
}

interface Props {
  tenant: {
    id: string
    name: string
    email: string | null
    phone: string | null
    action_type: string
    recommended_action: string
    // Risk snapshot fields — captured at execution time
    tier: string
    balance_due: number
    rent_amount: number
    days_past_due: number
    days_late_avg: number
    late_payment_count: number
    previous_delinquency: boolean
    card_expiry?: string | null
    payment_method?: string | null
    reasons: string[]
    late_fee: number
    requires_attorney: boolean
    property_name?: string | null
  }
}

export default function TenantDetailActions({ tenant }: Props) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function buildSnapshot(actionType: string) {
    return {
      tier: tenant.tier,
      balance_due: tenant.balance_due,
      rent_amount: tenant.rent_amount,
      days_past_due: tenant.days_past_due,
      days_late_avg: tenant.days_late_avg,
      late_payment_count: tenant.late_payment_count,
      previous_delinquency: tenant.previous_delinquency,
      card_expiry: tenant.card_expiry ?? null,
      payment_method: tenant.payment_method ?? null,
      reasons: tenant.reasons,
      recommended_action: tenant.recommended_action,
      action_type: actionType,
      late_fee: tenant.late_fee,
      requires_attorney: tenant.requires_attorney,
      property_name: tenant.property_name ?? null,
      scored_at: new Date().toISOString(),
    }
  }

  async function execute(type: string) {
    setLoading(true)
    try {
      const res = await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          type,
          phone: tenant.phone,
          name: tenant.name,
          snapshot: buildSnapshot(type),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message)
        window.location.reload()
      } else {
        toast.error(data.error || "Something went wrong.")
      }
    } catch {
      toast.error("Could not send action.")
    } finally {
      setLoading(false)
      setPendingAction(null)
    }
  }

  const msgFn = pendingAction ? SMS_PREVIEWS[pendingAction] : null
  const msgBody = msgFn ? msgFn(tenant.name) : ""
  const hasPhone = !!tenant.phone

  return (
    <>
      {msgFn && pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPendingAction(null)}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold text-base">Review SMS Before Sending</h3>
                <button onClick={() => setPendingAction(null)} className="text-[#4b5563] hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
              <p className="text-[#4b5563] text-xs mb-5">Prepared by system · snapshot saved to history</p>

              <div className="flex gap-3 text-sm items-baseline mb-4">
                <span className="text-[#4b5563] w-14 shrink-0 text-xs uppercase tracking-wide">To</span>
                {hasPhone
                  ? <span className="text-white font-mono">{tenant.phone}</span>
                  : <span className="text-orange-400 text-xs">No phone number on file</span>
                }
              </div>

              <div className="bg-[#0d1117] border border-white/5 rounded-2xl rounded-tl-sm p-4 mb-1">
                <p className="text-[#d1d5db] text-sm leading-relaxed">{msgBody}</p>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[#2e3a50] text-[10px]">SMS · {msgBody.length} chars · 1 segment</span>
                <span className="text-[#2e3a50] text-[10px]">Sent from RentSentry</span>
              </div>

              <p className="text-[#374151] text-xs mb-5">
                Logged permanently to this tenant&apos;s history regardless of delivery
              </p>
              <div className="flex gap-3">
                <button onClick={() => setPendingAction(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => execute(pendingAction)}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Send size={13} />
                  {loading ? "Sending…" : "Approve & Send SMS"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tenant.action_type && SMS_PREVIEWS[tenant.action_type] && (
        <button
          onClick={() => setPendingAction(tenant.action_type)}
          className="shrink-0 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          Review & Send SMS
        </button>
      )}
    </>
  )
}
