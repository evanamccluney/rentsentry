import { createClient } from "@/lib/supabase/server"
import { getCachedSubscription } from "@/lib/cache"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"

function trialStatus(createdAt: string, metaEndsAt?: string) {
  const trialEndsAt = metaEndsAt
    ? new Date(metaEndsAt)
    : new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
  const daysLeft = Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return { daysLeft, active: daysLeft > 0 }
}

export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const subscription = await getCachedSubscription(user.id)
  const hasActiveSub = subscription?.status === "active"
  const accessRevoked = user.user_metadata?.access_revoked === true
  const trial = trialStatus(user.created_at, user.user_metadata?.trial_ends_at)
  const showGate = false && !hasActiveSub && (!trial.active || accessRevoked)

  if (!showGate) return <>{children}</>

  return (
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
  )
}
