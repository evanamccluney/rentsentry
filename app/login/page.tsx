"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

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

  return (
    <main className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Sign in to RentSentry</h1>
          <p className="text-[#9ca3af] text-sm mt-1">Protect your portfolio revenue</p>
        </div>

        <form onSubmit={handleLogin} className="bg-[#131929] border border-[#1e2d45] rounded-xl p-6 space-y-4">
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
              className="bg-[#0a0e1a] border-[#1e2d45] text-white placeholder:text-[#4b5563]"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold"
          >
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <p className="text-center text-[#9ca3af] text-sm mt-4">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[#60a5fa] hover:underline">Sign up</Link>
        </p>
      </div>
    </main>
  )
}
