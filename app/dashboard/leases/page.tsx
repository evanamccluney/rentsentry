import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { CalendarDays, AlertTriangle, Clock, CheckCircle2 } from "lucide-react"

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

type Tenant = {
  id: string
  name: string
  unit: string
  rent_amount: number | null
  lease_start: string | null
  lease_end: string | null
  properties: { name: string } | null
  days: number
}

function TenantRow({ t }: { t: Tenant }) {
  const badge =
    t.days <= 0
      ? { label: "Expired", cls: "bg-red-500/15 text-red-400" }
      : t.days <= 30
        ? { label: `${t.days}d left`, cls: "bg-red-500/15 text-red-400" }
        : t.days <= 60
          ? { label: `${t.days}d left`, cls: "bg-orange-500/15 text-orange-400" }
          : t.days <= 90
            ? { label: `${t.days}d left`, cls: "bg-yellow-500/15 text-yellow-400" }
            : { label: `${t.days}d left`, cls: "bg-white/[0.05] text-[#6b7280]" }

  return (
    <Link
      href={`/dashboard/tenants/${t.id}`}
      className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors border-b border-white/[0.04] last:border-0"
    >
      <div className="min-w-0">
        <div className="text-white text-sm font-medium">{t.name}</div>
        <div className="text-[#4b5563] text-xs mt-0.5">
          Unit {t.unit}{t.properties?.name ? ` · ${t.properties.name}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-6 shrink-0 ml-4">
        <div className="text-right hidden sm:block">
          <div className="text-[#6b7280] text-xs">{formatDate(t.lease_end!)}</div>
          {t.lease_start && (
            <div className="text-[#374151] text-[10px]">from {formatDate(t.lease_start)}</div>
          )}
        </div>
        <div className="text-[#4b5563] text-xs hidden md:block tabular-nums">
          ${(t.rent_amount ?? 0).toLocaleString()}/mo
        </div>
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
    </Link>
  )
}

export default async function LeasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: rawTenants } = await supabase
    .from("tenants")
    .select("id, name, unit, rent_amount, lease_start, lease_end, properties(name)")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .not("lease_end", "is", null)
    .order("lease_end", { ascending: true })

  const { data: allTenants } = await supabase
    .from("tenants")
    .select("id")
    .eq("user_id", user!.id)
    .eq("status", "active")

  const tenants: Tenant[] = (rawTenants || []).map(t => ({
    ...t,
    properties: (t.properties as { name: string } | null),
    days: daysUntil(t.lease_end!),
  }))

  const noLeaseCount = (allTenants?.length ?? 0) - tenants.length

  const expired  = tenants.filter(t => t.days <= 0)
  const urgent   = tenants.filter(t => t.days > 0  && t.days <= 30)
  const soon     = tenants.filter(t => t.days > 30 && t.days <= 60)
  const upcoming = tenants.filter(t => t.days > 60 && t.days <= 90)
  const future   = tenants.filter(t => t.days > 90)

  const sections = [
    {
      title: "Expired",
      items: expired,
      icon: <AlertTriangle size={14} className="text-red-400" />,
      headerColor: "text-red-300",
      show: expired.length > 0,
    },
    {
      title: "Next 30 Days",
      items: urgent,
      icon: <AlertTriangle size={14} className="text-orange-400" />,
      headerColor: "text-orange-300",
      show: true,
    },
    {
      title: "31–60 Days",
      items: soon,
      icon: <Clock size={14} className="text-yellow-400" />,
      headerColor: "text-yellow-300",
      show: true,
    },
    {
      title: "61–90 Days",
      items: upcoming,
      icon: <Clock size={14} className="text-[#6b7280]" />,
      headerColor: "text-[#9ca3af]",
      show: upcoming.length > 0,
    },
    {
      title: "Beyond 90 Days",
      items: future,
      icon: <CheckCircle2 size={14} className="text-emerald-400" />,
      headerColor: "text-emerald-300",
      show: future.length > 0,
    },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Lease Renewals</h1>
        <p className="text-[#6b7280] text-sm mt-1">
          {tenants.length} leases on file
          {noLeaseCount > 0 && <span className="text-[#374151]"> · {noLeaseCount} tenants without a lease end date</span>}
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Expired", count: expired.length, color: expired.length > 0 ? "text-red-400" : "text-[#4b5563]" },
          { label: "Next 30 days", count: urgent.length, color: urgent.length > 0 ? "text-orange-400" : "text-[#4b5563]" },
          { label: "31–60 days", count: soon.length, color: soon.length > 0 ? "text-yellow-400" : "text-[#4b5563]" },
          { label: "61–90 days", count: upcoming.length, color: upcoming.length > 0 ? "text-[#9ca3af]" : "text-[#4b5563]" },
        ].map(({ label, count, color }) => (
          <div key={label} className="bg-[#111827] border border-white/10 rounded-2xl p-4 text-center">
            <div className={`text-3xl font-bold tabular-nums ${color}`}>{count}</div>
            <div className="text-[#4b5563] text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {tenants.length === 0 ? (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-14 text-center">
          <CalendarDays size={28} className="text-[#374151] mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">No lease end dates on file</p>
          <p className="text-[#4b5563] text-sm max-w-xs mx-auto">
            Add lease end dates to your tenants to track renewals here. You can update them from any tenant&apos;s detail page or via the AI chat.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.filter(s => s.show).map(s => (
            <div key={s.title} className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
                {s.icon}
                <span className={`text-sm font-semibold ${s.headerColor}`}>{s.title}</span>
                <span className="text-[#374151] text-xs">({s.items.length})</span>
              </div>
              {s.items.length === 0
                ? <div className="px-5 py-4 text-[#374151] text-sm">None in this window.</div>
                : s.items.map(t => <TenantRow key={t.id} t={t} />)
              }
            </div>
          ))}
        </div>
      )}

      {noLeaseCount > 0 && (
        <p className="text-[#2e3a50] text-xs mt-5 text-center">
          {noLeaseCount} active tenant{noLeaseCount > 1 ? "s are" : " is"} missing a lease end date — update them from the tenant detail page or ask the AI to set it.
        </p>
      )}
    </div>
  )
}
