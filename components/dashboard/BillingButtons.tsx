"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function BillingButtons({ status }: { status: string }) {
  const [loading, setLoading] = useState(false)

  async function startSubscription() {
    setLoading(true)
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else toast.error(data.error || "Could not start checkout.")
    } catch {
      toast.error("Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  async function openPortal() {
    setLoading(true)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else toast.error(data.error || "Could not open billing portal.")
    } catch {
      toast.error("Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  if (status === "active") {
    return (
      <div className="flex gap-3">
        <Button
          onClick={openPortal}
          disabled={loading}
          variant="outline"
          className="border-[#1e2d45] text-white hover:bg-[#131929]"
        >
          {loading ? "Loading…" : "Manage Subscription"}
        </Button>
        <Button
          onClick={openPortal}
          disabled={loading}
          variant="outline"
          className="border-red-500/50 text-red-400 hover:bg-red-500/10"
        >
          Cancel Plan
        </Button>
      </div>
    )
  }

  if (status === "past_due") {
    return (
      <div className="space-y-3">
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-4 text-yellow-400 text-sm">
          Your last payment failed. Update your payment method to restore access.
        </div>
        <Button
          onClick={openPortal}
          disabled={loading}
          className="bg-yellow-400 hover:bg-yellow-300 text-black font-semibold"
        >
          {loading ? "Loading…" : "Update Payment Method"}
        </Button>
      </div>
    )
  }

  return (
    <Button
      onClick={startSubscription}
      disabled={loading}
      className="bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold px-8"
    >
      {loading ? "Loading…" : "Start Subscription"}
    </Button>
  )
}
