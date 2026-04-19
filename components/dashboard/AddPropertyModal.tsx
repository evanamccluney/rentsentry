"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

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

export default function AddPropertyModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [state, setState] = useState("")

  async function handleCreate() {
    if (!name.trim()) { toast.error("Property name is required."); return }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error("Not authenticated."); setLoading(false); return }

    const { error } = await supabase.from("properties").insert({
      name: name.trim(),
      address: address.trim() || null,
      state: state || null,
      user_id: user.id,
      total_units: 0,
    })

    if (error) {
      toast.error("Failed to create property.")
    } else {
      toast.success(`${name} created.`)
      setOpen(false)
      setName("")
      setAddress("")
      setState("")
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
      >
        <Plus size={15} />
        Add Property
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#131929] border-[#1e2d45] text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Property</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div>
              <label className="text-[#9ca3af] text-sm mb-1.5 block">Property Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="e.g. Sunset Apartments"
                className="w-full bg-[#0a0e1a] border border-[#1e2d45] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#60a5fa]"
              />
            </div>
            <div>
              <label className="text-[#9ca3af] text-sm mb-1.5 block">Address (optional)</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="1420 Sunset Blvd, Los Angeles, CA"
                className="w-full bg-[#0a0e1a] border border-[#1e2d45] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#60a5fa]"
              />
            </div>
            <div>
              <label className="text-[#9ca3af] text-sm mb-1.5 block">State (optional)</label>
              <select
                value={state}
                onChange={e => setState(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-[#1e2d45] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#60a5fa]"
              >
                <option value="">Select state…</option>
                {US_STATES.map(([abbr, label]) => (
                  <option key={abbr} value={abbr}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                onClick={handleCreate}
                disabled={loading}
                className="bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold flex-1"
              >
                {loading ? "Creating…" : "Create Property"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                className="border-[#1e2d45] text-white hover:bg-[#1e2d45]"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
