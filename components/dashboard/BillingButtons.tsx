"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface Props {
  status: string
  currentPlan?: string | null
  suggestedPlan?: string | null
  trialActive?: boolean
}

export default function BillingButtons({ status, currentPlan, suggestedPlan, trialActive }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  async function startSubscription(plan: string) {
    setLoading(plan)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else toast.error(data.error || "Could not start checkout.")
    } catch {
      toast.error("Something went wrong.")
    } finally {
      setLoading(null)
    }
  }

  async function openPortal() {
    setLoading("portal")
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else toast.error(data.error || "Could not open billing portal.")
    } catch {
      toast.error("Something went wrong.")
    } finally {
      setLoading(null)
    }
  }

  if (status === "active") {
    return (
      <div className="flex gap-3 mt-2">
        <Button
          onClick={openPortal}
          disabled={!!loading}
          variant="outline"
          className="border-[#1e2d45] text-white hover:bg-[#131929]"
        >
          {loading === "portal" ? "Loading…" : "Manage Subscription"}
        </Button>
        <Button
          onClick={openPortal}
          disabled={!!loading}
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
      <div className="space-y-3 mt-2">
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-4 text-yellow-400 text-sm">
          Your last payment failed. Update your payment method to restore access.
        </div>
        <Button
          onClick={openPortal}
          disabled={!!loading}
          className="bg-yellow-400 hover:bg-yellow-300 text-black font-semibold"
        >
          {loading === "portal" ? "Loading…" : "Update Payment Method"}
        </Button>
      </div>
    )
  }

  const plans = [
    {
      id: "starter",
      name: "Starter",
      price: "$29",
      limit: "Up to 5 units",
      popular: false,
    },
    {
      id: "pro",
      name: "Pro",
      price: "$59",
      limit: "Up to 20 units",
      popular: true,
    },
    {
      id: "portfolio",
      name: "Portfolio",
      price: "$99",
      limit: "Up to 100 units",
      popular: false,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
      {plans.map(plan => (
        <div
          key={plan.id}
          className={`relative rounded-2xl p-5 border flex flex-col gap-4 ${
            plan.id === suggestedPlan || (!suggestedPlan && plan.popular)
              ? "bg-blue-500/10 border-blue-500/30"
              : "bg-[#111827] border-white/10"
          }`}
        >
          {(plan.id === suggestedPlan || (!suggestedPlan && plan.popular)) && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                {suggestedPlan ? "Recommended for you" : "Most Popular"}
              </span>
            </div>
          )}
          <div>
            <div className="text-white font-semibold text-sm">{plan.name}</div>
            <div className="text-[#6b7280] text-xs mt-0.5">{plan.limit}</div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white">{plan.price}</span>
            <span className="text-[#6b7280] text-sm">/mo</span>
          </div>
          <Button
            onClick={() => startSubscription(plan.id)}
            disabled={!!loading || currentPlan === plan.id}
            className={
              plan.id === suggestedPlan || (!suggestedPlan && plan.popular)
                ? "bg-blue-500 hover:bg-blue-400 text-white font-semibold w-full"
                : "bg-white/10 hover:bg-white/15 text-white font-semibold w-full"
            }
          >
            {loading === plan.id
              ? "Loading…"
              : currentPlan === plan.id
              ? "Current Plan"
              : trialActive
              ? "Start Free Trial"
              : "Subscribe"}
          </Button>
        </div>
      ))}
    </div>
  )
}
