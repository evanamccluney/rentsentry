"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface Props {
  tenantId: string
  riskScore: string
  email: string
  name: string
}

export default function TenantActions({ tenantId, riskScore, email, name }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  async function downloadLegalPacket() {
    setLoading("legal_packet")
    try {
      const res = await fetch("/api/legal-packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      })
      if (!res.ok) { toast.error("Failed to generate legal packet."); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `legal_packet_${name.replace(/\s+/g, "_").toLowerCase()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Legal packet downloaded.")
    } catch {
      toast.error("Could not generate legal packet.")
    } finally {
      setLoading(null)
    }
  }

  async function trigger(type: string) {
    setLoading(type)
    try {
      const res = await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, type, email, name }),
      })
      const data = await res.json()
      if (data.ok) toast.success(data.message)
      else toast.error(data.error || "Something went wrong.")
    } catch {
      toast.error("Could not send action.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {(riskScore === "yellow" || riskScore === "red") && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading === "payment_reminder"}
          onClick={() => trigger("payment_reminder")}
          className="border-yellow-500 text-yellow-400 hover:bg-yellow-500/10 text-xs px-2 py-1 h-auto"
        >
          {loading === "payment_reminder" ? "…" : "Send Reminder"}
        </Button>
      )}
      {(riskScore === "yellow" || riskScore === "red") && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading === "split_pay_offer"}
          onClick={() => trigger("split_pay_offer")}
          className="border-blue-500 text-blue-400 hover:bg-blue-500/10 text-xs px-2 py-1 h-auto"
        >
          {loading === "split_pay_offer" ? "…" : "Split Pay"}
        </Button>
      )}
      {riskScore === "red" && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading === "cash_for_keys"}
          onClick={() => trigger("cash_for_keys")}
          className="border-orange-500 text-orange-400 hover:bg-orange-500/10 text-xs px-2 py-1 h-auto"
        >
          {loading === "cash_for_keys" ? "…" : "Cash for Keys"}
        </Button>
      )}
      {riskScore === "red" && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading === "legal_packet"}
          onClick={() => downloadLegalPacket()}
          className="border-red-500 text-red-400 hover:bg-red-500/10 text-xs px-2 py-1 h-auto"
        >
          {loading === "legal_packet" ? "…" : "Legal Packet"}
        </Button>
      )}
    </div>
  )
}
