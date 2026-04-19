import { createClient } from "@/lib/supabase/server"
import BillingButtons from "@/components/dashboard/BillingButtons"
import { CheckCircle2 } from "lucide-react"

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

  const { count: unitCount } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user!.id)
    .eq("status", "active")

  const units = unitCount || 0
  const monthlyTotal = units * 4
  const currentStatus = subscription?.status || "inactive"

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    active:   { label: "Active",   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    past_due: { label: "Past Due", color: "text-yellow-400",  bg: "bg-yellow-400/10 border-yellow-400/20" },
    cancelled:{ label: "Cancelled",color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
    inactive: { label: "Inactive", color: "text-[#6b7280]",   bg: "bg-white/5 border-white/10" },
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

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
          <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Status</div>
          <span className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded-lg border ${status.bg} ${status.color}`}>
            {status.label}
          </span>
        </div>
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
          <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Active Units</div>
          <div className="text-2xl font-bold text-white tabular-nums">{units}</div>
          <div className="text-[#4b5563] text-xs mt-1">$4.00 per unit</div>
        </div>
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
          <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Monthly Total</div>
          <div className="text-2xl font-bold text-white tabular-nums">${monthlyTotal.toLocaleString()}</div>
          <div className="text-[#4b5563] text-xs mt-1">Billed monthly</div>
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-white font-semibold text-sm mb-5">What&apos;s included</h2>
        <div className="space-y-4">
          {[
            { label: "Risk Scoring Engine",         desc: "Proactive 7-tier scoring before rent is due" },
            { label: "Phase 1 — Predictive Alerts", desc: "Card expiry warnings, proactive reminders sent before the 1st" },
            { label: "Phase 2 — PM Decision Support", desc: "Daily alerts with escalation context — you decide, we never auto-send legal" },
            { label: "Eviction Cost Comparison",    desc: "State-based Eviction vs Cash for Keys estimates on Day 10+" },
            { label: "Utility Leakage Detection",   desc: "Cross-reference rent roll to find silent utility costs" },
            { label: "Daily Cron Automation",        desc: "Phase 1 + Phase 2 run automatically every morning" },
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

        <div className="mt-6 pt-5 border-t border-white/5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-bold text-white">$4</span>
            <span className="text-[#6b7280] text-sm">/ unit / month</span>
          </div>
          <p className="text-[#4b5563] text-sm mt-1">
            {units > 0
              ? `Your portfolio: ${units} units = $${monthlyTotal}/month`
              : "Upload a rent roll to calculate your price."}
          </p>
        </div>
      </div>

      <BillingButtons status={currentStatus} />
    </div>
  )
}
