"use client"
import { useState } from "react"
import { CheckCircle2, Clock, CreditCard, ExternalLink, AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function StripeConnect({
  connected,
  connectedAt,
  chargesEnabled,
}: {
  connected: boolean
  connectedAt: string | null
  chargesEnabled: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/billing/connect/create-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || "Something went wrong. Try again.")
        setLoading(false)
      }
    } catch {
      setError("Network error. Try again.")
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
          <CreditCard size={14} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white text-sm font-semibold">Payment Collection</span>
            {!connected && null}
            {connected && !chargesEnabled && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                Pending verification
              </span>
            )}
            {connected && chargesEnabled && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                Active
              </span>
            )}
          </div>
          <p className="text-[#6b7280] text-xs leading-relaxed">
            {!connected
              ? "Send tenants a secure payment link when they're late. Money goes directly to your Stripe account. Tenants pay a 0.5% processing fee — you receive the full rent amount."
              : connected && !chargesEnabled
              ? "Your Stripe account is connected but Stripe is still verifying your information. Payment links will activate automatically once approved — usually within a few minutes."
              : `Connected since ${connectedAt ? new Date(connectedAt).toLocaleDateString() : "recently"}. Send tenants a secure payment link when they're late. Tenants pay a 0.5% processing fee — you receive the full rent amount.`
            }
          </p>
          <p className="text-[#4b5563] text-[11px] leading-relaxed mt-1">
            Always ensure tenants have a free alternative (check or money order). You are responsible for compliance with your local landlord-tenant laws.
          </p>
        </div>
      </div>

      {!connected && (
        <>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-sm font-semibold disabled:opacity-50"
          >
            <ExternalLink size={13} />
            {loading ? "Setting up…" : "Connect Stripe Account"}
          </button>
          {error && <p className="mt-2 text-red-400 text-xs">{error}</p>}
        </>
      )}

      {connected && !chargesEnabled && (
        <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs">
          <Clock size={12} />
          Waiting for Stripe to verify your account — this usually takes a few minutes
        </div>
      )}

      {connected && chargesEnabled && (
        <div className="mt-3 flex items-center gap-2 text-emerald-400 text-xs">
          <CheckCircle2 size={12} />
          Ready — use &quot;Send Payment Link&quot; on any delinquent tenant
        </div>
      )}
    </div>
  )
}
