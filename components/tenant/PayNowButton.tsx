"use client"
import { useState } from "react"
import { ArrowRight, Loader2 } from "lucide-react"

export default function PayNowButton({ type = "full", label }: { type?: "full" | "plan"; label: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/tenant/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Something went wrong."); setLoading(false); return }
      if (data.url) window.location.href = data.url
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold py-3.5 px-6 rounded-2xl transition-colors text-sm"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
        {loading ? "Redirecting…" : label}
      </button>
      {error && <p className="text-red-400 text-xs mt-2 text-center">{error}</p>}
    </div>
  )
}
