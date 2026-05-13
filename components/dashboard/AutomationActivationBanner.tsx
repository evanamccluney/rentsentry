"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Zap, ArrowRight, Check } from "lucide-react"
import Link from "next/link"

export default function AutomationActivationBanner() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function enable() {
    setLoading(true)
    try {
      const res = await fetch("/api/profile/auto-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      })
      if (!res.ok) throw new Error()
      setDone(true)
      setTimeout(() => router.refresh(), 800)
    } catch {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4 mb-6">
        <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <Check size={14} className="text-emerald-400" />
        </div>
        <p className="text-emerald-400 text-sm font-medium">Automation is on — RentSentry will now monitor your tenants and send alerts automatically.</p>
      </div>
    )
  }

  return (
    <div className="bg-[#0d1117] border border-blue-500/20 rounded-2xl px-6 py-5 mb-6 relative overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Zap size={16} className="text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm mb-1">Automation is off — your tenants aren&apos;t being monitored</p>
            <p className="text-[#6b7280] text-xs leading-relaxed">
              Turn it on and RentSentry will send proactive reminders before rent is due, follow up automatically when tenants are late, and alert you when something needs your attention — all based on each tenant&apos;s payment history.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
              {[
                "Pre-due reminders for at-risk tenants",
                "Automatic follow-ups when rent is late",
                "PM alerts at your escalation thresholds",
              ].map(item => (
                <span key={item} className="flex items-center gap-1.5 text-[#4b5563] text-[11px]">
                  <span className="w-1 h-1 rounded-full bg-blue-500/60 shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 sm:flex-col sm:items-end lg:flex-row lg:items-center">
          <button
            onClick={enable}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors whitespace-nowrap"
          >
            <Zap size={13} />
            {loading ? "Enabling…" : "Turn on automation"}
          </button>
          <Link
            href="/dashboard/settings#automation"
            className="flex items-center gap-1 text-[#4b5563] hover:text-white text-xs transition-colors whitespace-nowrap"
          >
            Review settings <ArrowRight size={11} />
          </Link>
        </div>
      </div>
    </div>
  )
}
