"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Shield } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<"login" | "forgot">("login")
  const [resetSent, setResetSent] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push("/dashboard")
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setResetSent(true)
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Shield size={20} className="text-[#6366f1]" />
          <span className="font-heading text-white font-bold text-xl tracking-tight">RentSentry</span>
        </div>

        {mode === "login" && (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white">Welcome back</h1>
              <p className="text-[#52525b] text-sm mt-1">Sign in to your account</p>
            </div>

            <form onSubmit={handleLogin} className="bg-[#111113] border border-[#27272a] rounded-xl p-6 space-y-4">
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[#71717a] text-sm">Password</label>
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setError("") }}
                    className="text-[#818cf8] text-xs hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#09090b] border border-[#27272a] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#6366f1]/50 placeholder:text-[#3f3f46]"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? "Signing in…" : "Sign In →"}
              </button>
            </form>

            <p className="text-center text-[#52525b] text-sm mt-4">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-[#818cf8] hover:underline">Sign up free</Link>
            </p>
          </>
        )}

        {mode === "forgot" && !resetSent && (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white">Reset password</h1>
              <p className="text-[#52525b] text-sm mt-1">We&apos;ll send a reset link to your email</p>
            </div>

            <form onSubmit={handleForgotPassword} className="bg-[#111113] border border-[#27272a] rounded-xl p-6 space-y-4">
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
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? "Sending…" : "Send Reset Link →"}
              </button>
            </form>

            <p className="text-center text-[#52525b] text-sm mt-4">
              <button onClick={() => { setMode("login"); setError("") }} className="text-[#818cf8] hover:underline">
                Back to sign in
              </button>
            </p>
          </>
        )}

        {mode === "forgot" && resetSent && (
          <div className="bg-[#111113] border border-[#27272a] rounded-xl p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Shield size={20} className="text-emerald-400" />
            </div>
            <h2 className="text-white font-semibold mb-2">Check your email</h2>
            <p className="text-[#52525b] text-sm mb-5">
              We sent a password reset link to <span className="text-[#a1a1aa]">{email}</span>
            </p>
            <button
              onClick={() => { setMode("login"); setResetSent(false); setError("") }}
              className="text-[#818cf8] text-sm hover:underline"
            >
              Back to sign in
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
