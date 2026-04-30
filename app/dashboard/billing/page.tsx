import { createClient } from "@/lib/supabase/server"
import BillingButtons from "@/components/dashboard/BillingButtons"
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react"

function trialStatus(createdAt: string) {
  const trialEndsAt = new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
  const daysLeft = Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return { daysLeft, trialEndsAt, active: daysLeft > 0 }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const params = await searchParams

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user!.id)
    .single()

  const hasActiveSub = subscription?.status === "active"
  const trial = trialStatus(user!.created_at)
  const currentStatus = subscription?.status || (trial.active ? "trial" : "expired")

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    active:   { label: "Active",        color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    trial:    { label: "Free Trial",    color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
    past_due: { label: "Past Due",      color: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/20" },
    cancelled:{ label: "Cancelled",     color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
    expired:  { label: "Trial Expired", color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
    inactive: { label: "Inactive",      color: "text-[#6b7280]",   bg: "bg-white/5 border-white/10" },
  }
  const status = statusConfig[currentStatus] ?? statusConfig.inactive

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-[#6b7280] text-sm mt-1">Manage your RentSentry subscription</p>
      </div>

      {params.success === "true" && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span className="text-emerald-400 text-sm font-medium">Subscription activated. Welcome to RentSentry.</span>
        </div>
      )}

      {/* Trial expired warning */}
      {!hasActiveSub && !trial.active && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <span className="text-red-400 text-sm font-medium">Your 30-day trial has expired. Subscribe below to restore full access.</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
          <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Status</div>
          <span className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded-lg border ${status.bg} ${status.color}`}>
            {status.label}
          </span>
        </div>

        <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
          <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">
            {hasActiveSub ? "Plan" : "Trial"}
          </div>
          {hasActiveSub ? (
            <>
              <div className="text-white text-sm font-semibold">$49 / month</div>
              <div className="text-[#4b5563] text-xs mt-1">Unlimited tenants</div>
            </>
          ) : trial.active ? (
            <>
              <div className="flex items-center gap-1.5">
                <Clock size={13} className={trial.daysLeft <= 3 ? "text-red-400" : trial.daysLeft <= 7 ? "text-amber-400" : "text-blue-400"} />
                <div className={`text-sm font-semibold ${trial.daysLeft <= 3 ? "text-red-400" : trial.daysLeft <= 7 ? "text-amber-400" : "text-white"}`}>
                  {trial.daysLeft} day{trial.daysLeft !== 1 ? "s" : ""} left
                </div>
              </div>
              <div className="text-[#4b5563] text-xs mt-1">
                Expires {trial.trialEndsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </>
          ) : (
            <>
              <div className="text-red-400 text-sm font-semibold">Expired</div>
              <div className="text-[#4b5563] text-xs mt-1">Subscribe to restore</div>
            </>
          )}
        </div>

        <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
          <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Price</div>
          <div className="text-2xl font-bold text-white tabular-nums">$49</div>
          <div className="text-[#4b5563] text-xs mt-1">per month · cancel anytime</div>
        </div>
      </div>

      {/* Plan details */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-white font-semibold text-sm">What&apos;s included</h2>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white">$49</span>
            <span className="text-[#6b7280] text-sm">/ month</span>
          </div>
        </div>

        <div className="space-y-4">
          {[
            { label: "Risk Scoring Engine",           desc: "7-tier proactive scoring before rent is even due" },
            { label: "Automated SMS Reminders",       desc: "Behavior-based rules fire reminders to tenants automatically" },
            { label: "PM Morning Confirmations",      desc: "Texts you daily to confirm payments — stops false SMS to tenants who already paid" },
            { label: "Predictive Alerts",             desc: "Card expiry warnings, no-payment-method alerts, proactive reminders before the 1st" },
            { label: "Eviction vs Cash for Keys",     desc: "State-based cost breakdown — know exactly which option saves you more money" },
            { label: "Payment Plan Tracker",          desc: "Log installment agreements, track payments, auto-remind on due dates" },
            { label: "Escalation Decision Support",   desc: "Clear recommended next step at every stage — you approve, we never auto-send legal notices" },
            { label: "Unlimited Tenants",             desc: "No per-unit pricing. Add as many properties as you manage." },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-3">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mt-0.5 shrink-0">
                <CheckCircle2 size={10} className="text-emerald-400" />
              </div>
              <div>
                <div className="text-white text-sm font-medium">{f.label}</div>
                <div className="text-[#4b5563] text-xs mt-0.5 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[#374151] text-xs mt-6 pt-4 border-t border-white/5">
          Flat rate. No per-unit fees, no setup costs, no contracts. Cancel any time from this page.
        </p>
      </div>

      <BillingButtons status={currentStatus} />
    </div>
  )
}
