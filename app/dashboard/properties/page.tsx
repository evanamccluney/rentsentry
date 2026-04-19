import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Building2, Users } from "lucide-react"
import DeletePropertyButton from "@/components/dashboard/DeletePropertyButton"
import EditPropertyButton from "@/components/dashboard/EditPropertyButton"
import AddPropertyModal from "@/components/dashboard/AddPropertyModal"
import ImportPropertiesButton from "@/components/dashboard/ImportPropertiesButton"

export default async function PropertiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .eq("user_id", user!.id)
    .order("name")

  const propertyIds = (properties || []).map(p => p.id)

  const { data: tenantCounts } = await supabase
    .from("tenants")
    .select("property_id")
    .in("property_id", propertyIds.length ? propertyIds : ["none"])
    .eq("status", "active")

  function getTenantCount(propertyId: string) {
    return (tenantCounts || []).filter(t => t.property_id === propertyId).length
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Properties</h1>
          <p className="text-[#6b7280] text-sm mt-1">Manage your portfolio</p>
        </div>
        <div className="flex items-center gap-3">
          <ImportPropertiesButton />
          <AddPropertyModal />
        </div>
      </div>

      {!properties || properties.length === 0 ? (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-16 text-center">
          <Building2 className="w-10 h-10 text-[#4b5563] mx-auto mb-3" />
          <h2 className="text-white font-semibold mb-1">No properties yet</h2>
          <p className="text-[#6b7280] text-sm mb-5">Add properties first, then upload a rent roll for each one.</p>
          <div className="flex items-center gap-3 justify-center">
            <ImportPropertiesButton />
            <AddPropertyModal />
          </div>
        </div>
      ) : (
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#4b5563] text-xs uppercase tracking-wide border-b border-white/5">
                <th className="px-5 py-3 text-left">Property</th>
                <th className="px-5 py-3 text-left">Address</th>
                <th className="px-5 py-3 text-left">State</th>
                <th className="px-5 py-3 text-left">Tenants</th>
                <th className="px-5 py-3 text-left">Added</th>
                <th className="px-5 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property, i) => {
                const count = getTenantCount(property.id)
                return (
                  <tr
                    key={property.id}
                    className={`border-t border-white/5 hover:bg-white/[0.02] transition-colors ${i === 0 ? "border-t-0" : ""}`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                          <Building2 size={15} className="text-blue-400" />
                        </div>
                        <span className="text-white font-medium">{property.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#6b7280] text-xs max-w-[200px] truncate">
                      {property.address || <span className="text-[#374151]">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      {property.state
                        ? <span className="text-white text-xs font-mono bg-white/5 px-2 py-0.5 rounded">{property.state}</span>
                        : <span className="text-[#374151] text-xs">Not set</span>
                      }
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-[#6b7280] text-xs">
                        <Users size={12} />
                        {count > 0
                          ? <Link href={`/dashboard/tenants?property=${property.id}`} className="text-blue-400 hover:underline">{count} active</Link>
                          : <span className="text-[#374151]">No tenants</span>
                        }
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#4b5563] text-xs">
                      {new Date(property.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 justify-end">
                        <Link
                          href={`/dashboard/upload?property=${property.id}`}
                          className="text-[#4b5563] hover:text-white text-xs transition-colors"
                        >
                          Upload Rent Roll
                        </Link>
                        <EditPropertyButton
                          propertyId={property.id}
                          propertyName={property.name}
                          propertyAddress={property.address}
                          propertyState={property.state}
                        />
                        <DeletePropertyButton propertyId={property.id} propertyName={property.name} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
