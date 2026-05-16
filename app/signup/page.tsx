"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Shield } from "lucide-react"

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [company, setCompany] = useState("")
  const [phone, setPhone] = useState("")
  const [smsConsent, setSmsConsent] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { company_name: company } }
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          pm_display_name: company.trim() || null,
          pm_phone: smsConsent && phone.trim() ? phone.trim() : null,
          onboarded: false,
          updated_at: new Date().toISOString(),
        })
      }
      router.push("/dashboard")
    }
  }

  return (
    <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Shield size={20} className="text-[#6366f1]" />
          <span className="font-heading text-white font-bold text-xl tracking-tight">RentSentry</span>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-[#52525b] text-sm mt-1">30-day free trial · No credit card required</p>
        </div>

        <form onSubmit={handleSignup} className="bg-[#111113] border border-[#27272a] rounded-xl p-6 space-y-4">
          <div>
            <label className="text-[#71717a] text-sm mb-1.5 block">Company Name</label>
            <input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Acme Property Management"
              required
              className="w-full bg-[#09090b] border border-[#27272a] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#6366f1]/50 placeholder:text-[#3f3f46]"
            />
          </div>
          <div>
            <label className="text-[#71717a] text-sm mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="w-full bg-[#09090b] border border-[#27272a] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#6366f1]/50 placeholder:text-[#3f3f46]"
            />
          </div>
          <div>
            <label className="text-[#71717a] text-sm mb-1.5 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              className="w-full bg-[#09090b] border border-[#27272a] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#6366f1]/50 placeholder:text-[#3f3f46]"
            />
          </div>

          <div className="pt-1 border-t border-[#27272a]">
            <label className="text-[#71717a] text-sm mb-1.5 block">
              Phone Number <span className="text-[#3f3f46] font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 (919) 000-0000"
              className="w-full bg-[#09090b] border border-[#27272a] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#6366f1]/50 placeholder:text-[#3f3f46]"
            />

            <label className="flex items-start gap-3 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={e => setSmsConsent(e.target.checked)}
                className="mt-0.5 shrink-0 accent-[#6366f1]"
              />
              <span className="text-[#52525b] text-xs leading-relaxed">
                I agree to receive recurring SMS notifications from RentSentry about rent reminders, payment confirmations, and account alerts. SMS consent is optional and not required to create an account. Message frequency varies. Msg &amp; data rates may apply.{" "}
                <Link href="/terms" className="text-[#818cf8] hover:underline">Terms</Link>
                {" "}·{" "}
                <Link href="/privacy" className="text-[#818cf8] hover:underline">Privacy</Link>.
                {" "}Mobile numbers are not shared with third parties. Reply STOP to unsubscribe.
              </span>
            </label>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? "Creating account…" : "Create Account →"}
          </button>
        </form>

        <p className="text-center text-[#52525b] text-sm mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-[#818cf8] hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
