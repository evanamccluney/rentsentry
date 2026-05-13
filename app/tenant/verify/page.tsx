"use client"
import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Shield, ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"

export default function TenantVerifyPage() {
  const [digits, setDigits] = useState(["", "", "", "", "", ""])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()

  function getRef(i: number) {
    return (el: HTMLInputElement | null) => { inputsRef.current[i] = el }
  }
  function focusAt(i: number) { inputsRef.current[i]?.focus() }

  function handleDigit(i: number, val: string) {
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      const next = val.split("")
      setDigits(next)
      focusAt(5)
      submit(next.join(""))
      return
    }
    const digit = val.replace(/\D/g, "").slice(-1)
    const next = [...digits]
    next[i] = digit
    setDigits(next)
    if (digit && i < 5) focusAt(i + 1)
    if (next.every(d => d !== "")) submit(next.join(""))
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[i] && i > 0) focusAt(i - 1)
  }

  async function submit(code: string) {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/tenant/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Invalid code.")
        setLoading(false)
        setDigits(["", "", "", "", "", ""])
        focusAt(0)
        return
      }
      router.push("/tenant/portal")
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
          <h1 className="text-2xl font-bold text-white mb-2">Check your phone</h1>
          <p className="text-[#6b7280] text-sm">Enter the 6-digit code we just sent you. It expires in 10 minutes.</p>
        </div>

        <div className="flex gap-2 justify-center mb-6">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={getRef(i)}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={d}
              autoFocus={i === 0}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className="w-11 h-14 text-center text-xl font-bold text-white bg-[#111827] border border-white/10 rounded-xl focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-[#6b7280] text-sm mb-4">
            <Loader2 size={14} className="animate-spin" />
            Verifying…
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs text-center mb-4">{error}</p>
        )}

        <Link
          href="/tenant/login"
          className="flex items-center justify-center gap-1.5 text-[#4b5563] hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={13} />
          Use a different number
        </Link>
      </div>
    </main>
  )
}
