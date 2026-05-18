"use server"
import { createClient } from "@/lib/supabase/server"
import { getCachedProfile, getCachedSubscription } from "@/lib/cache"
import { redirect } from "next/navigation"
import Link from "next/link"
import Sidebar from "@/components/dashboard/Sidebar"
import BottomNav from "@/components/dashboard/BottomNav"
import AIChat from "@/components/dashboard/AIChat"
import AutomationStatusBar from "@/components/dashboard/AutomationStatusBar"

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

  const hasActiveSub = subscription?.status === "active"
  const trial = trialStatus(user.created_at, user.user_metadata?.trial_ends_at)
  const showBanner = !hasActiveSub && trial.active
  const urgent = trial.daysLeft <= 3

  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AutomationStatusBar />
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
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 pb-24 lg:pb-8">
          {children}
        </main>
      </div>
      <AIChat />
      <BottomNav />
    </div>
  )
}
