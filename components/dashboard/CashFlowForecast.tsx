interface Tenant {
  rent_amount: number
  balance_due: number
  tier: string
}

interface Props {
  tenants: Tenant[]
  monthLabel: string
}

export default function CashFlowForecast({ tenants, monthLabel }: Props) {
  if (tenants.length === 0) return null

  const expected = tenants.reduce((s, t) => s + (t.rent_amount || 0), 0)

  let confirmed = 0
  let inPlan = 0
  let atRisk = 0

  for (const t of tenants) {
    const rent = t.rent_amount || 0
    const bal = t.balance_due || 0

    if (bal <= 0) {
      confirmed += rent
    } else if (t.tier === "payment_plan") {
      inPlan += rent
    } else if (["legal", "pay_or_quit", "cash_for_keys"].includes(t.tier)) {
      atRisk += rent
    } else {
      // reminder / watch with balance — likely to resolve
      inPlan += rent * 0.7
      atRisk += rent * 0.3
    }
  }

  const projLow = Math.round(confirmed + inPlan * 0.4)
  const projHigh = Math.round(confirmed + inPlan + atRisk * 0.25)
  const confirmedPct = expected > 0 ? (confirmed / expected) * 100 : 0
  const planPct = expected > 0 ? (inPlan / expected) * 100 : 0
  const atRiskPct = expected > 0 ? (atRisk / expected) * 100 : 0
  const shortfallRisk = projHigh < expected * 0.88

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-sm">Cash Flow Forecast</h2>
        <span className="text-[#4b5563] text-xs">{monthLabel}</span>
      </div>

      {/* Stacked progress bar */}
      <div className="flex h-2 rounded-full overflow-hidden mb-4 gap-px bg-white/5">
        {confirmedPct > 0 && (
          <div className="bg-emerald-500 rounded-l-full" style={{ width: `${confirmedPct}%` }} title="Confirmed paid" />
        )}
        {planPct > 0 && (
          <div className="bg-amber-500" style={{ width: `${planPct}%` }} title="In recovery / payment plan" />
        )}
        {atRiskPct > 0 && (
          <div className="bg-red-500 rounded-r-full" style={{ width: `${atRiskPct}%` }} title="High risk" />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {[
          { label: "Expected", value: `$${expected.toLocaleString()}`, color: "text-white" },
          { label: "Confirmed", value: `$${Math.round(confirmed).toLocaleString()}`, color: "text-emerald-400" },
          { label: "In Recovery", value: `$${Math.round(inPlan).toLocaleString()}`, color: "text-amber-400" },
          { label: "High Risk", value: `$${Math.round(atRisk).toLocaleString()}`, color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3">
            <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">{label}</div>
            <div className={`font-bold tabular-nums text-sm ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${shortfallRisk ? "bg-orange-500/8 border-orange-500/20" : "bg-white/[0.02] border-white/[0.05]"}`}>
        <span className="text-[#4b5563]">Projected collection range</span>
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold tabular-nums">
            ${projLow.toLocaleString()} – ${projHigh.toLocaleString()}
          </span>
          {shortfallRisk && (
            <span className="text-orange-400 font-medium">Shortfall likely</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3">
        {[
          { dot: "bg-emerald-500", label: "Confirmed paid" },
          { dot: "bg-amber-500", label: "In recovery" },
          { dot: "bg-red-500", label: "High risk" },
        ].map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            <span className="text-[#4b5563] text-[10px]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
