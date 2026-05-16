import { createClient } from "@/lib/supabase/server"
import { getCachedProfile, getCachedSubscription } from "@/lib/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import Link from "next/link"
import Sidebar from "@/components/dashboard/Sidebar"
import AIChat from "@/components/dashboard/AIChat"
import AutomationStatusBar from "@/components/dashboard/AutomationStatusBar"
import OnboardingPrompt from "@/components/dashboard/OnboardingPrompt"
import { AlertTriangle } from "lucide-react"

function trialStatus(createdAt: string, metaEndsAt?: string) {
  const trialEndsAt = metaEndsAt
    ? new Date(metaEndsAt)
    : new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
  const daysLeft = Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return { daysLeft, active: daysLeft > 0 }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [, subscription] = await Promise.all([
    getCachedProfile(user.id),
    getCachedSubscription(user.id),
  ])

  const isOnboarded = true

  const headersList = await headers()
  const pathname = headersList.get("x-pathname") ?? ""
  const isOnBillingPage = pathname === "/dashboard/billing"

  const hasActiveSub = subscription?.status === "active"
  const accessRevoked = user.user_metadata?.access_revoked === true
  const trial = trialStatus(user.created_at, user.user_metadata?.trial_ends_at)

  const showGate = !hasActiveSub && (!trial.active || accessRevoked) && !isOnBillingPage
  const showBanner = !hasActiveSub && trial.active

  const urgent = trial.daysLeft <= 3

  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Automation bar — only shown when auto mode is on */}
        <AutomationStatusBar />

        {/* Trial banner — single, slim, unobtrusive */}
        {showBanner && (
          <div className={`flex items-center justify-between px-5 py-2 border-b text-xs ${
            urgent
              ? "bg-red-500/[0.06] border-red-500/[0.15] text-red-400"
              : "bg-[#111113] border-[#27272a] text-[#71717a]"
          }`}>
            <span>
              {urgent
                ? `${trial.daysLeft} day${trial.daysLeft !== 1 ? "s" : ""} left in your trial — add a card to keep access.`
                : `${trial.daysLeft} days left in your free trial.`}
            </span>
            <Link
              href="/dashboard/billing"
              className={`font-medium hover:opacity-80 transition-opacity ${urgent ? "text-red-400" : "text-[#6366f1]"}`}
            >
              Upgrade →
            </Link>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {!isOnboarded ? (
            <OnboardingPrompt />
          ) : showGate ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="bg-[#111113] border border-[#27272a] rounded-xl p-10 max-w-md">
                <div className="w-11 h-11 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
                  <AlertTriangle size={18} className="text-red-400" />
                </div>
                <h2 className="font-heading text-white text-xl font-bold tracking-tight mb-2">Your trial has ended</h2>
                <p className="text-[#71717a] text-sm leading-relaxed mb-6">
                  Your 30-day free trial expired. Subscribe to keep access to your dashboard, risk scoring, automated reminders, and all your tenant data.
                </p>
                <Link
                  href="/dashboard/billing"
                  className="block w-full py-2.5 rounded-lg bg-[#6366f1] hover:bg-[#818cf8] text-white font-semibold text-sm transition-colors text-center"
                >
                  Choose a plan →
                </Link>
              </div>
            </div>
          ) : children}
        </main>
      </div>
      <AIChat />
    </div>
  )
}
