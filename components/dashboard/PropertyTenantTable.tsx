"use client"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import TenantActions from "@/components/dashboard/TenantActions"
import { Search } from "lucide-react"

const RISK_COLORS: Record<string, string> = {
  green: "bg-green-500 text-black",
  yellow: "bg-yellow-400 text-black",
  red: "bg-red-500 text-white",
}
const RISK_LABELS: Record<string, string> = {
  green: "Low Risk",
  yellow: "At Risk",
  red: "High Risk",
}
const RISK_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2 }

interface Tenant {
  id: string
  unit: string
  name: string
  email: string
  phone: string
  rent_amount: number
  balance_due: number
  risk_score: string
  risk_reasons: string[]
}

export default function PropertyTenantTable({ tenants }: { tenants: Tenant[] }) {
  const [search, setSearch] = useState("")
  const [riskFilter, setRiskFilter] = useState("")

  let filtered = [...tenants].sort((a, b) => RISK_ORDER[a.risk_score] - RISK_ORDER[b.risk_score])

  if (riskFilter) filtered = filtered.filter(t => t.risk_score === riskFilter)
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.unit?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q)
    )
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b5563]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, unit, email…"
            className="w-full bg-[#0a0e1a] border border-[#1e2d45] text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-[#60a5fa]"
          />
        </div>
        <select
          value={riskFilter}
          onChange={e => setRiskFilter(e.target.value)}
          className="bg-[#0a0e1a] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#60a5fa]"
        >
          <option value="">All Risk Levels</option>
          <option value="red">High Risk</option>
          <option value="yellow">At Risk</option>
          <option value="green">Low Risk</option>
        </select>
        <span className="text-[#9ca3af] text-sm ml-auto">{filtered.length} tenant{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#131929] border border-[#1e2d45] rounded-xl p-12 text-center">
          <p className="text-[#9ca3af] text-sm">No tenants match these filters.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1e2d45] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0d1220] text-[#9ca3af] text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Risk</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-left">Tenant</th>
                <th className="px-4 py-3 text-left">Rent</th>
                <th className="px-4 py-3 text-left">Balance Due</th>
                <th className="px-4 py-3 text-left">Flags</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-t border-[#1e2d45] hover:bg-[#131929]">
                  <td className="px-4 py-3">
                    <Badge className={`${RISK_COLORS[t.risk_score]} text-xs`}>
                      {RISK_LABELS[t.risk_score]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-white font-mono text-xs">{t.unit}</td>
                  <td className="px-4 py-3 text-white">{t.name}</td>
                  <td className="px-4 py-3 text-white">${t.rent_amount?.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {t.balance_due > 0
                      ? <span className="text-red-400 font-semibold">${t.balance_due?.toLocaleString()}</span>
                      : <span className="text-[#9ca3af]">$0</span>}
                  </td>
                  <td className="px-4 py-3 text-[#9ca3af] text-xs max-w-xs">
                    {(t.risk_reasons as string[])?.slice(0, 2).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <TenantActions tenantId={t.id} riskScore={t.risk_score} email={t.email} name={t.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
