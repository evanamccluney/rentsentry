"use client"
import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import OnboardingClient from "@/app/onboarding/OnboardingClient"

export default function OnboardingPrompt() {
  const [started, setStarted] = useState(false)

  if (started) {
    return <OnboardingClient embedded />
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-10 max-w-md">
        <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle size={20} className="text-blue-400" />
        </div>
        <h2 className="text-white text-xl font-bold mb-2">Finish onboarding</h2>
        <p className="text-[#6b7280] text-sm leading-relaxed mb-6">
          Set up your first property and rules to unlock the dashboard.
        </p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="block w-full py-3 rounded-xl bg-[#60a5fa] text-black font-semibold text-sm hover:bg-[#3b82f6] transition-colors text-center"
        >
          Continue setup
        </button>
      </div>
    </div>
  )
}
