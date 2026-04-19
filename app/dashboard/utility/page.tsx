import { createClient } from "@/lib/supabase/server"
import { Zap, CheckCircle2 } from "lucide-react"

export default async function UtilityAuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: tenants } = await supabase
    .from("tenants")
    .select("*, properties(name)")
    .eq("user_id", user!.id)
    .eq("utility_billed", false)
    .not("move_in_date", "is", null)
    .order("move_in_date", { ascending: true })

  const { data: audits } = await supabase
    .from("utility_audits")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })

  const totalLeakage = audits?.reduce((sum, a) => sum + (a.total_leakage || 0), 0) ?? 0

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Utility Audit</h1>
        <p className="text-[#6b7280] text-sm mt-1">Identify units where you may still be paying utilities after tenant move-in</p>
      </div>

      {totalLeakage > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 mb-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <Zap size={18} className="text-red-400" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Estimated Utility Leakage</div>
            <div className="text-red-400 text-2xl font-bold tabular-nums">${totalLeakage.toLocaleString()}<span className="text-base font-medium">/mo</span></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenants not yet utility-billed */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <h2 className="text-white font-semibold text-sm mb-1">Tenants Without Utility Billing</h2>
          <p className="text-[#4b5563] text-xs mb-4 leading-relaxed">These tenants have moved in but utility billing has not been confirmed.</p>

          {!tenants || tenants.length === 0 ? (
            <div className="flex items-center gap-2 text-[#4b5563] text-sm py-2">
              <CheckCircle2 size={15} className="text-emerald-500" />
              <span className="text-emerald-400">No utility gaps detected.</span>
              <span className="text-[#4b5563]">Upload a rent roll to begin analysis.</span>
            </div>
          ) : (
            <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
              {tenants.map(t => (
                <div key={t.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="text-white text-sm font-medium">{t.name}</div>
                    <div className="text-[#4b5563] text-xs mt-0.5">
                      Unit {t.unit} · Moved in {t.move_in_date || "unknown"}
                    </div>
                    {(t as { properties?: { name?: string } }).properties?.name && (
                      <div className="text-[#374151] text-xs">{(t as { properties?: { name?: string } }).properties?.name}</div>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 shrink-0">
                    Not Billed
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit log */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <h2 className="text-white font-semibold text-sm mb-1">Audit Log</h2>
          <p className="text-[#4b5563] text-xs mb-4 leading-relaxed">Resolved and open utility leakage cases.</p>

          {!audits || audits.length === 0 ? (
            <p className="text-[#4b5563] text-sm">No audit records yet.</p>
          ) : (
            <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
              {audits.map(a => (
                <div key={a.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="text-white text-sm font-medium">{a.tenant_name || "Unknown"}</div>
                    <div className="text-[#4b5563] text-xs mt-0.5">Unit {a.unit} · ~${a.estimated_monthly_cost}/mo</div>
                    <div className="text-[#374151] text-xs">Total leakage: ${a.total_leakage?.toFixed(0)}</div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg shrink-0 ${
                    a.status === "resolved"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-yellow-400/10 text-yellow-400 border border-yellow-400/20"
                  }`}>
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
