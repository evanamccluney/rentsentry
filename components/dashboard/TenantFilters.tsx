"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

interface Props {
  properties: { id: string; name: string }[]
}

export default function TenantFilters({ properties }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  function update(key: string, value: string) {
    const p = new URLSearchParams(params.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    router.push(`/dashboard/tenants?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b5563]" />
        <input
          type="text"
          placeholder="Search tenant or unit…"
          defaultValue={params.get("search") || ""}
          onChange={e => update("search", e.target.value)}
          className="bg-[#131929] border border-[#1e2d45] text-white text-sm rounded-lg pl-8 pr-3 py-2 w-52 placeholder:text-[#4b5563] focus:outline-none focus:border-[#60a5fa]"
        />
      </div>

      {/* Property filter */}
      <select
        value={params.get("property") || ""}
        onChange={e => update("property", e.target.value)}
        className="bg-[#131929] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#60a5fa]"
      >
        <option value="">All Properties</option>
        {properties.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {/* Risk filter */}
      <select
        value={params.get("risk") || ""}
        onChange={e => update("risk", e.target.value)}
        className="bg-[#131929] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#60a5fa]"
      >
        <option value="">All Risk Levels</option>
        <option value="red">High Risk</option>
        <option value="yellow">At Risk</option>
        <option value="green">Low Risk</option>
      </select>

      {/* Clear filters */}
      {(params.get("property") || params.get("risk") || params.get("search")) && (
        <button
          onClick={() => router.push("/dashboard/tenants")}
          className="text-[#60a5fa] hover:underline text-sm"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
