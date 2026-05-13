"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Shield, ArrowRight, Loader2 } from "lucide-react"

export default function TenantLoginPage() {
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/tenant/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "Something went wrong.")
        setLoading(false)
        return
      }
      router.push("/tenant/verify")
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield size={16} className="text-blue-400" />
            <span className="text-white font-bold text-lg">RentSentry</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Tenant portal</h1>
          <p className="text-[#6b7280] text-sm">Enter the phone number on your lease to get a verification code.</p>
        </div>

        <form onSubmit={handle} className="space-y-4">
          <div>
            <label className="block text-[#4b5563] text-xs uppercase tracking-wide mb-2">Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              autoFocus
              required
              className="w-full bg-[#111827] border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder-[#374151] text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !phone.trim()}
            className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold py-3.5 px-6 rounded-2xl transition-colors text-sm"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            {loading ? "Sending code…" : "Send verification code"}
          </button>
        </form>

        <p className="text-center text-[#374151] text-xs mt-6">
          We&apos;ll send a 6-digit code to your phone. Standard messaging rates apply.
        </p>
      </div>
    </main>
  )
}
