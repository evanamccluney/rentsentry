"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Pencil, X } from "lucide-react"

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
]

interface Props {
  propertyId: string
  propertyName: string
  propertyAddress?: string | null
  propertyState?: string | null
}

export default function EditPropertyButton({ propertyId, propertyName, propertyAddress, propertyState }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(propertyName)
  const [address, setAddress] = useState(propertyAddress ?? "")
  const [state, setState] = useState(propertyState ?? "")

  async function handleSave() {
    if (!name.trim()) { toast.error("Property name is required."); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("properties")
      .update({ name: name.trim(), address: address.trim() || null, state: state || null })
      .eq("id", propertyId)

    if (error) {
      toast.error("Failed to update property.")
    } else {
      toast.success("Property updated.")
      setOpen(false)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[#4b5563] hover:text-white transition-colors"
        title="Edit property"
      >
        <Pencil size={13} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <h2 className="text-white font-semibold text-sm">Edit Property</h2>
              <button onClick={() => setOpen(false)} className="text-[#4b5563] hover:text-white transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[#6b7280] text-xs mb-1.5">Property Name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="block text-[#6b7280] text-xs mb-1.5">Address</label>
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="1420 Sunset Blvd, Los Angeles, CA"
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="block text-[#6b7280] text-xs mb-1.5">State</label>
                <select
                  value={state}
                  onChange={e => setState(e.target.value)}
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
                >
                  <option value="">Select state…</option>
                  {US_STATES.map(([abbr, label]) => (
                    <option key={abbr} value={abbr}>{label}</option>
                  ))}
                </select>
                {state && (
                  <p className="text-[#4b5563] text-xs mt-1.5">
                    Used for eviction timeline estimates on tenant detail pages.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50">
                {loading ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
