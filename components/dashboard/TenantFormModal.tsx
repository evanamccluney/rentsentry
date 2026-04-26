"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { X } from "lucide-react"
import { toast } from "sonner"

interface Property { id: string; name: string }

interface TenantData {
  id?: string
  name: string
  email: string
  phone: string
  unit: string
  property_id: string
  rent_amount: string
  balance_due: string
  rent_due_day: string
  payment_method: string
  card_expiry: string
  lease_start: string
  lease_end: string
  last_payment_date: string
  days_late_avg: string
  late_payment_count: string
  previous_delinquency: boolean
}

const EMPTY: TenantData = {
  name: "", email: "", phone: "", unit: "", property_id: "",
  rent_amount: "", balance_due: "0", rent_due_day: "1",
  payment_method: "unknown", card_expiry: "", lease_start: "",
  lease_end: "", last_payment_date: "",
  days_late_avg: "0", late_payment_count: "0", previous_delinquency: false,
}

interface Props {
  mode: "add" | "edit"
  properties: Property[]
  initial?: Partial<TenantData> & { id?: string }
  onClose: () => void
}

export default function TenantFormModal({ mode, properties, initial, onClose }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<TenantData>({ ...EMPTY, ...initial })
  const [saving, setSaving] = useState(false)

  function set(k: keyof TenantData, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.unit.trim() || !form.property_id) {
      toast.error("Name, unit, and property are required.")
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error("Not authenticated."); setSaving(false); return }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      unit: form.unit.trim(),
      property_id: form.property_id,
      rent_amount: parseFloat(form.rent_amount) || 0,
      balance_due: parseFloat(form.balance_due) || 0,
      rent_due_day: parseInt(form.rent_due_day) || 1,
      payment_method: form.payment_method || "unknown",
      card_expiry: form.card_expiry.trim() || null,
      lease_start: form.lease_start || null,
      lease_end: form.lease_end || null,
      last_payment_date: form.last_payment_date || null,
      days_late_avg: parseFloat(form.days_late_avg) || 0,
      late_payment_count: parseInt(form.late_payment_count) || 0,
      previous_delinquency: form.previous_delinquency,
      status: "active",
      user_id: user.id,
    }

    if (mode === "add") {
      const { error } = await supabase.from("tenants").insert(payload)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(`${form.name} added.`)
    } else {
      const { error } = await supabase.from("tenants").update(payload).eq("id", initial!.id!)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success("Tenant updated.")
    }

    setSaving(false)
    onClose()
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <h2 className="text-white font-semibold">{mode === "add" ? "Add Tenant" : "Edit Tenant"}</h2>
            <button type="button" onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Basic info */}
            <div>
              <p className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">Basic Info</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Full Name *" value={form.name} onChange={v => set("name", v)} placeholder="Jane Smith" />
                  <Field label="Unit *" value={form.unit} onChange={v => set("unit", v)} placeholder="101" />
                </div>
                <div>
                  <label className="block text-[#6b7280] text-xs mb-1.5">Property *</label>
                  <select
                    value={form.property_id}
                    onChange={e => set("property_id", e.target.value)}
                    className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
                  >
                    <option value="">Select property…</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <Field label="Email" value={form.email} onChange={v => set("email", v)} placeholder="jane@email.com" type="email" />
                <Field label="Phone" value={form.phone} onChange={v => set("phone", v)} placeholder="555-000-0000" />
              </div>
            </div>

            {/* Lease */}
            <div>
              <p className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">Lease</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lease Start" value={form.lease_start} onChange={v => set("lease_start", v)} type="date" />
                <Field label="Lease End" value={form.lease_end} onChange={v => set("lease_end", v)} type="date" />
              </div>
            </div>

            {/* Payment */}
            <div>
              <p className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">Payment</p>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Rent Amount ($)" value={form.rent_amount} onChange={v => set("rent_amount", v)} placeholder="2000" type="number" />
                  <Field label="Balance Due ($)" value={form.balance_due} onChange={v => set("balance_due", v)} placeholder="0" type="number" />
                  <Field label="Due Day of Month" value={form.rent_due_day} onChange={v => set("rent_due_day", v)} placeholder="1" type="number" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#6b7280] text-xs mb-1.5">Payment Method</label>
                    <select
                      value={form.payment_method}
                      onChange={e => set("payment_method", e.target.value)}
                      className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
                    >
                      <option value="unknown">Unknown</option>
                      <option value="card">Card</option>
                      <option value="ach">ACH</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                  <Field label="Card Expiry (MM/YY)" value={form.card_expiry} onChange={v => set("card_expiry", v)} placeholder="08/26" />
                </div>
                <Field label="Last Payment Date" value={form.last_payment_date} onChange={v => set("last_payment_date", v)} type="date" />
              </div>
            </div>

            {/* History */}
            <div>
              <p className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">Payment History</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Avg Days Late" value={form.days_late_avg} onChange={v => set("days_late_avg", v)} placeholder="0" type="number" />
                  <Field label="Late Payment Count" value={form.late_payment_count} onChange={v => set("late_payment_count", v)} placeholder="0" type="number" />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.previous_delinquency}
                    onChange={e => set("previous_delinquency", e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  <span className="text-[#9ca3af] text-sm">Prior eviction or delinquency on record</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-3 p-6 pt-0">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50">
              {saving ? "Saving…" : mode === "add" ? "Add Tenant" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-[#6b7280] text-xs mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20"
      />
    </div>
  )
}
