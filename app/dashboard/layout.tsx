import { createClient } from "@/lib/supabase/server"
import { getCachedProfile, getCachedSubscription } from "@/lib/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import Link from "next/link"
import Sidebar from "@/components/dashboard/Sidebar"
import AIChat from "@/components/dashboard/AIChat"
import AutomationStatusBar from "@/components/dashboard/AutomationStatusBar"
import { AlertTriangle, Clock } from "lucide-react"

function trialStatus(createdAt: string, metaEndsAt?: string) {
  const trialEndsAt = metaEndsAt
    ? new Date(metaEndsAt)
    : new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
  const daysLeft = Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return { daysLeft, trialEndsAt, active: daysLeft > 0 }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [profile, subscription] = await Promise.all([
    getCachedProfile(user.id),
    getCachedSubscription(user.id),
  ])

  if (!profile?.onboarded) redirect("/onboarding")

  const headersList = await headers()
  const pathname = headersList.get("x-pathname") ?? ""
  const isOnBillingPage = pathname === "/dashboard/billing"

  const hasActiveSub = subscription?.status === "active"
  const accessRevoked = user.user_metadata?.access_revoked === true
  const trial = trialStatus(user.created_at, user.user_metadata?.trial_ends_at)

  // Trial expired + no subscription + not already on billing = show gate
  const showGate = !hasActiveSub && (!trial.active || accessRevoked) && !isOnBillingPage

  // Trial active + no subscription = show countdown banner
  const showBanner = !hasActiveSub && trial.active

  const bannerColor = trial.daysLeft <= 3
    ? "bg-red-500/10 border-red-500/20 text-red-400"
    : trial.daysLeft <= 7
    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
    : "bg-blue-500/10 border-blue-500/20 text-blue-400"

  return (
    <div className="flex h-screen bg-[#0a0e1a] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AutomationStatusBar />

        {showBanner && (
          <div className={`flex items-center justify-between px-6 py-2.5 border-b text-xs font-medium ${bannerColor}`}>
            <div className="flex items-center gap-2">
              <Clock size={13} />
              {trial.daysLeft === 1
                ? "Your free trial expires tomorrow."
                : `${trial.daysLeft} days left in your free trial.`}
              {trial.daysLeft <= 7 && " Add a card to keep access."}
            </div>
            <Link
              href="/dashboard/billing"
              className="underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Upgrade now →
            </Link>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-8">
          {showGate ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-10 max-w-md">
                <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
                  <AlertTriangle size={20} className="text-red-400" />
                </div>
                <h2 className="text-white text-xl font-bold mb-2">Your trial has ended</h2>
                <p className="text-[#6b7280] text-sm leading-relaxed mb-6">
                  Your 30-day free trial expired. Subscribe to keep access to your dashboard, risk scoring, automated reminders, and all your tenant data.
                </p>
                <div className="text-[#9ca3af] text-sm mb-6">
                  <span className="text-white font-bold text-2xl">$49</span>
                  <span className="text-[#6b7280]"> / month · cancel anytime</span>
                </div>
                <Link
                  href="/dashboard/billing"
                  className="block w-full py-3 rounded-xl bg-[#60a5fa] text-black font-semibold text-sm hover:bg-[#3b82f6] transition-colors text-center"
                >
                  Subscribe to continue →
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
