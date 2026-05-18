import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Upload, Building2, Users, AlertTriangle, DollarSign, ArrowRight } from "lucide-react"
import DeletePropertyButton from "@/components/dashboard/DeletePropertyButton"
import { Badge } from "@/components/ui/badge"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PropertyDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single()

  if (!property) notFound()

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, unit, name, email, phone, rent_amount, balance_due, risk_score, risk_reasons")
    .eq("property_id", id)
    .eq("status", "active")
    .order("unit")

  const all = tenants || []
  const green = all.filter(t => t.risk_score === "green").length
  const yellow = all.filter(t => t.risk_score === "yellow").length
  const red = all.filter(t => t.risk_score === "red").length
  const totalRent = all.reduce((s, t) => s + (t.rent_amount || 0), 0)
  const totalDue = all.reduce((s, t) => s + (t.balance_due || 0), 0)
  const riskLevel = red > 0 ? "red" : yellow > 0 ? "yellow" : "green"

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-start gap-4">
          <Link
            href="/dashboard/properties"
            className="mt-1 text-[#9ca3af] hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{property.name}</h1>
              {riskLevel === "red" && <Badge className="bg-red-500 text-white text-xs">High Risk</Badge>}
              {riskLevel === "yellow" && <Badge className="bg-yellow-400 text-black text-xs">At Risk</Badge>}
              {riskLevel === "green" && all.length > 0 && <Badge className="bg-green-500 text-black text-xs">Healthy</Badge>}
            </div>
            {property.address && (
              <p className="text-[#9ca3af] text-sm mt-0.5">{property.address}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/properties/${id}/upload`}
            className="flex items-center gap-2 bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <Upload size={15} />
            Upload Rent Roll
          </Link>
          <DeletePropertyButton propertyId={id} propertyName={property.name} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#131929] border border-[#1e2d45] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[#9ca3af] text-xs mb-1">
            <Users size={12} />
            Active Tenants
          </div>
          <div className="text-2xl font-bold text-white">{all.length}</div>
        </div>
        <div className="bg-[#131929] border border-[#1e2d45] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[#9ca3af] text-xs mb-1">
            <DollarSign size={12} />
            Monthly Rent
          </div>
          <div className="text-2xl font-bold text-white">${totalRent.toLocaleString()}</div>
        </div>
        <div className="bg-[#131929] border border-[#1e2d45] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[#9ca3af] text-xs mb-1">
            <AlertTriangle size={12} />
            Balance Due
          </div>
          <div className={`text-2xl font-bold ${totalDue > 0 ? "text-red-400" : "text-green-400"}`}>
            ${totalDue.toLocaleString()}
          </div>
        </div>
        <div className="bg-[#131929] border border-[#1e2d45] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[#9ca3af] text-xs mb-1">
            <Building2 size={12} />
            Risk Breakdown
          </div>
          {all.length > 0 ? (
            <div>
              <div className="flex w-full h-2 rounded-full overflow-hidden bg-[#1e2d45] mt-2 mb-1">
                {green > 0 && <div className="bg-green-500 h-2" style={{ width: `${(green / all.length) * 100}%` }} />}
                {yellow > 0 && <div className="bg-yellow-400 h-2" style={{ width: `${(yellow / all.length) * 100}%` }} />}
                {red > 0 && <div className="bg-red-500 h-2" style={{ width: `${(red / all.length) * 100}%` }} />}
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-green-400">{green} low</span>
                <span className="text-yellow-400">{yellow} mid</span>
                <span className="text-red-400">{red} high</span>
              </div>
            </div>
          ) : (
            <div className="text-[#4b5563] text-sm mt-1">No tenants</div>
          )}
        </div>
      </div>

      {/* Tenants */}
      {all.length === 0 ? (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-16 text-center">
          <Upload className="w-10 h-10 text-[#4b5563] mx-auto mb-3" />
          <h2 className="text-white font-semibold mb-1">No tenants yet</h2>
          <p className="text-[#9ca3af] text-sm mb-5">Upload a rent roll to populate this property and start risk scoring.</p>
          <Link
            href={`/dashboard/upload`}
            className="inline-flex items-center gap-2 bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
          >
            <Upload size={14} />
            Upload Rent Roll
          </Link>
        </div>
      ) : (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-semibold text-sm">{all.length} Active Tenant{all.length !== 1 ? "s" : ""}</h2>
              <p className="text-[#4b5563] text-xs mt-0.5">
                {red > 0 && <span className="text-red-400">{red} high risk · </span>}
                {yellow > 0 && <span className="text-yellow-400">{yellow} at risk · </span>}
                {green > 0 && <span className="text-emerald-400">{green} healthy</span>}
              </p>
            </div>
            <Link
              href={`/dashboard/tenants`}
              className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              View & Manage <ArrowRight size={13} />
            </Link>
          </div>

          {/* Top 5 at-risk tenants */}
          <div className="space-y-2">
            {all
              .filter(t => t.risk_score !== "green")
              .slice(0, 5)
              .map(t => (
                <Link
                  key={t.id}
                  href={`/dashboard/tenants/${t.id}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${t.risk_score === "red" ? "bg-red-500" : "bg-yellow-400"}`} />
                    <div className="min-w-0">
                      <span className="text-white text-sm font-medium">{t.name}</span>
                      <span className="text-[#4b5563] text-xs ml-2">Unit {t.unit}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {t.balance_due > 0 && (
                      <span className="text-red-400 text-xs font-semibold">${t.balance_due.toLocaleString()}</span>
                    )}
                    <ArrowRight size={12} className="text-[#374151] group-hover:text-[#6b7280] transition-colors" />
                  </div>
                </Link>
              ))}
            {all.filter(t => t.risk_score !== "green").length === 0 && (
              <p className="text-[#4b5563] text-sm px-3 py-2">All tenants in good standing — no action required.</p>
            )}
            {all.filter(t => t.risk_score !== "green").length > 5 && (
              <p className="text-[#374151] text-xs px-3 pt-1">
                +{all.filter(t => t.risk_score !== "green").length - 5} more —{" "}
                <Link href="/dashboard/tenants" className="text-blue-400 hover:underline">view all</Link>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
