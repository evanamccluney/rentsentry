"use client"
import { useState } from "react"
import { toast } from "sonner"
import SmsSendModal from "@/components/dashboard/SmsSendModal"

const SMS_ACTION_TYPES = new Set([
  "payment_reminder", "proactive_reminder", "card_expiry_alert",
  "split_pay_offer", "cash_for_keys", "legal_packet",
])

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

  async function execute(type: string, messageBody: string) {
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
          message: messageBody,
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

  return (
    <>
      {pendingAction && (
        <SmsSendModal
          tenantId={tenant.id}
          actionType={pendingAction}
          tenant={tenant}
          onConfirm={(msg) => execute(pendingAction, msg)}
          onCancel={() => setPendingAction(null)}
          loading={loading}
        />
      )}

      {tenant.action_type && SMS_ACTION_TYPES.has(tenant.action_type) && (
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
