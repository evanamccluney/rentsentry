"use client"
import { useState } from "react"
import { CheckCircle2 } from "lucide-react"

export default function AcceptOfferButton({ token, tenantName }: { token: string; tenantName: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/payments/accept-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || "Something went wrong. Contact your property manager.")
        setLoading(false)
      }
    } catch {
      setError("Network error. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleAccept}
        disabled={loading}
        className="w-full py-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-semibold text-sm hover:bg-emerald-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <CheckCircle2 size={15} />
        {loading ? "Setting up…" : "Accept & Pay First Installment"}
      </button>
      {error && <p className="text-red-400 text-xs text-center mt-3">{error}</p>}
    </div>
  )
}
