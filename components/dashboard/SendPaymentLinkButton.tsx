"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Link2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

export default function SendPaymentLinkButton({
  tenantId,
  tenantName,
  balanceDue,
  stripeConnected,
}: {
  tenantId: string
  tenantName: string
  balanceDue: number
  stripeConnected: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (!stripeConnected || balanceDue <= 0) return null

  async function handleSend() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/payments/create-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json()
      if (data.url) {
        toast.success(`Payment link sent to ${tenantName} via SMS`)
        router.refresh()
      } else {
        toast.error(data.error || "Could not create payment link")
      }
    } catch {
      toast.error("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSend}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium transition-colors disabled:opacity-50"
    >
      <Link2 size={12} />
      {loading ? "Sending…" : "Send Payment Link"}
    </button>
  )
}
