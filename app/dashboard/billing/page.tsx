import { createClient } from "@/lib/supabase/server"
import BillingButtons from "@/components/dashboard/BillingButtons"
import { CheckCircle2, Clock, AlertTriangle, ShieldCheck, Sparkles } from "lucide-react"
import { recommendPlan, PLAN_NAMES, PLAN_PRICES } from "@/lib/plan-limits"

const FEATURES = [
  { label: "Automated SMS rent reminders",        desc: "Tenants get reminders on your schedule — you do nothing" },
  { label: "AI chatbot for tenant replies",        desc: "Responds to texts, negotiates plans, sends payment links 24/7" },
  { label: "Stripe payment links via SMS",         desc: "Tenants pay directly from a text — no app, no login" },
  { label: "Payment plan negotiation",            desc: "AI structures a split-payment offer and sends it automatically" },
  { label: "PM quick-reply commands",             desc: "Reply LINK, PLAN, or SNOOZE to any alert from your phone" },
  { label: "Eviction prevention workflow",         desc: "7-tier escalation from reminder to attorney handoff — automated" },
  { label: "Eviction vs Cash for Keys math",       desc: "State-based cost breakdown so you pick the cheaper option" },
  { label: "Attorney handoff emails",              desc: "Pre-filled case summary sent to your attorney automatically" },
  { label: "Tenant portal and payment history",   desc: "Tenants can view balances, payment plans, and recent payments" },
  { label: "Delivery failure alerts",             desc: "Failed SMS delivery is logged and can alert the property manager" },
]

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

  const [{ data: subscription }, { count: tenantCount }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", user!.id).single(),
    supabase.from("tenants").select("id", { count: "exact", head: true }).eq("user_id", user!.id).eq("status", "active"),
  ])

  const hasActiveSub = subscription?.status === "active"
  const unitCount = tenantCount ?? 0
  const suggested = recommendPlan(unitCount)
  const trial = trialStatus(user!.created_at)
  const currentStatus = subscription?.status || (trial.active ? "trial" : "expired")
  const currentPlan = subscription?.metadata?.plan ?? null

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    active:    { label: "Active",        color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    trial:     { label: "Free Trial",    color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
    past_due:  { label: "Past Due",      color: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/20" },
    cancelled: { label: "Cancelled",     color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
    expired:   { label: "Trial Expired", color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
    inactive:  { label: "Inactive",      color: "text-[#6b7280]",   bg: "bg-white/5 border-white/10" },
  }
  const status = statusConfig[currentStatus] ?? statusConfig.inactive

  const planLabels: Record<string, string> = {
    starter: "Starter · $29/mo",
    pro: "Pro · $59/mo",
    portfolio: "Portfolio · $99/mo",
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-[#6b7280] text-sm mt-1">Manage your RentSentry subscription</p>
      </div>

      {params.success === "true" && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span className="text-emerald-400 text-sm font-medium">Subscription activated. Welcome to RentSentry.</span>
        </div>
      )}

      {!hasActiveSub && !trial.active && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <span className="text-red-400 text-sm font-medium">Your 30-day trial has expired. Choose a plan below to restore full access.</span>
        </div>
      )}

      {/* Status strip */}
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
              <div className="text-white text-sm font-semibold">{planLabels[currentPlan ?? ""] ?? "Active"}</div>
              <div className="text-[#4b5563] text-xs mt-1">All features included</div>
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
              <div className="text-[#4b5563] text-xs mt-1">Choose a plan below</div>
            </>
          )}
        </div>

        <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
          <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Trial</div>
          <div className="text-white text-sm font-semibold">30 days free</div>
          <div className="text-[#4b5563] text-xs mt-1">No credit card required</div>
        </div>
      </div>

      {/* Positioning statement */}
      <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
        <ShieldCheck size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[#9ca3af] text-sm leading-relaxed">
          One prevented eviction saves $5,000–$10,000. RentSentry pays for itself the first time a tenant who would have ghosted responds to a text instead.
        </p>
      </div>

      {/* Plan selector or manage */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-6">
        <div className="mb-5">
          <h2 className="text-white font-semibold text-sm">
            {hasActiveSub ? "Your plan" : "Choose a plan"}
          </h2>
          <p className="text-[#6b7280] text-xs mt-1">
            All plans include every feature. Tiers are based on unit count only.
          </p>
        </div>

        {!hasActiveSub && unitCount > 0 && (
          <div className="flex items-center gap-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 mb-5">
            <Sparkles size={14} className="text-blue-400 shrink-0" />
            <p className="text-blue-300 text-xs">
              You have <strong>{unitCount} unit{unitCount !== 1 ? "s" : ""}</strong> — we recommend{" "}
              <strong>{PLAN_NAMES[suggested]} ({PLAN_PRICES[suggested]})</strong> for your portfolio size.
            </p>
          </div>
        )}

        <BillingButtons status={currentStatus} currentPlan={currentPlan} suggestedPlan={suggested} trialActive={trial.active} />

        {!hasActiveSub && (
          <p className="text-[#4b5563] text-xs mt-4">
            30-day free trial on any plan · No credit card required · Cancel anytime
          </p>
        )}
      </div>

      {/* What's included */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
        <h2 className="text-white font-semibold text-sm mb-5">Everything included in every plan</h2>
        <div className="space-y-4">
          {FEATURES.map(f => (
            <div key={f.label} className="flex items-start gap-3">
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mt-0.5 shrink-0">
                <CheckCircle2 size={10} className="text-emerald-400" />
              </div>
              <div>
                <div className="text-white text-sm font-medium">{f.label}</div>
                <div className="text-[#6b7280] text-xs mt-0.5 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 pt-4 border-t border-white/5">
          <p className="text-[#374151] text-xs">One prevented eviction pays for 5+ years of RentSentry at any tier.</p>
        </div>
      </div>
    </div>
  )
}
