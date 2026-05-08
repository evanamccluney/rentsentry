"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
    <main className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-[#9ca3af] text-sm mt-1">Start protecting revenue in 5 minutes</p>
        </div>

        <form onSubmit={handleSignup} className="bg-[#131929] border border-[#1e2d45] rounded-xl p-6 space-y-4">
          <div>
            <Label className="text-[#9ca3af] text-sm mb-1.5 block">Company Name</Label>
            <Input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Acme Property Management"
              required
              className="bg-[#0a0e1a] border-[#1e2d45] text-white placeholder:text-[#4b5563]"
            />
          </div>
          <div>
            <Label className="text-[#9ca3af] text-sm mb-1.5 block">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="bg-[#0a0e1a] border-[#1e2d45] text-white placeholder:text-[#4b5563]"
            />
          </div>
          <div>
            <Label className="text-[#9ca3af] text-sm mb-1.5 block">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              className="bg-[#0a0e1a] border-[#1e2d45] text-white placeholder:text-[#4b5563]"
            />
          </div>

          <div className="pt-1 border-t border-white/[0.06]">
            <Label className="text-[#9ca3af] text-sm mb-1.5 block">
              Phone Number <span className="text-[#4b5563] font-normal">(optional)</span>
            </Label>
            <Input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+1 (919) 000-0000"
              className="bg-[#0a0e1a] border-[#1e2d45] text-white placeholder:text-[#4b5563]"
            />

            <label className="flex items-start gap-3 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={e => setSmsConsent(e.target.checked)}
                className="mt-0.5 shrink-0 accent-[#60a5fa]"
              />
              <span className="text-[#6b7280] text-xs leading-relaxed">
                I agree to receive recurring SMS notifications from RentSentry about rent reminders, payment confirmations, and account alerts. SMS consent is optional and not required to create an account. Message frequency varies. Msg &amp; data rates may apply.{" "}
                <Link href="/terms" className="text-[#60a5fa] hover:underline">Terms</Link>
                {" "}·{" "}
                <Link href="/privacy" className="text-[#60a5fa] hover:underline">Privacy</Link>.
                {" "}Mobile numbers are not shared with third parties. Reply STOP to unsubscribe.
              </span>
            </label>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold"
          >
            {loading ? "Creating account…" : "Create Account"}
          </Button>
        </form>

        <p className="text-center text-[#9ca3af] text-sm mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-[#60a5fa] hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
