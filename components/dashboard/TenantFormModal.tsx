"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { toast } from "sonner"
import { normalizePhone } from "@/lib/phone"

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
  delinquency_start_date: string
  intake_action: string
  days_late_avg: string
  late_payment_count: string
  previous_delinquency: boolean
}

const EMPTY: TenantData = {
  name: "", email: "", phone: "", unit: "", property_id: "",
  rent_amount: "", balance_due: "0", rent_due_day: "1",
  payment_method: "unknown", card_expiry: "", lease_start: "",
  lease_end: "", last_payment_date: "",
  delinquency_start_date: "", intake_action: "manual_review",
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
  const [form, setForm] = useState<TenantData>(() => {
    const sanitized = Object.fromEntries(
      Object.entries(initial ?? {}).map(([k, v]) => [k, v === null ? "" : v])
    )
    return { ...EMPTY, ...sanitized }
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const hasExistingBalance = (parseFloat(form.balance_due) || 0) > 0

  const balanceHint = (() => {
    if (!hasExistingBalance || mode !== "add" || !form.last_payment_date) return null
    const lastPay = new Date(form.last_payment_date + "T00:00:00")
    if (isNaN(lastPay.getTime())) return null
    const monthsSinceLastPayment = Math.round((Date.now() - lastPay.getTime()) / (30.44 * 86_400_000))
    if (monthsSinceLastPayment < 2) return null
    const rentAmount = parseFloat(form.rent_amount) || 0
    const balanceDue = parseFloat(form.balance_due) || 0
    const monthsEntered = rentAmount > 0 ? balanceDue / rentAmount : 0
    if (monthsSinceLastPayment <= Math.ceil(monthsEntered)) return null
    return { monthsSinceLastPayment, monthsEntered: Math.round(monthsEntered * 10) / 10 }
  })()

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    const res = await fetch(`/api/tenants/${initial!.id!}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "deleted" }),
    })
    if (!res.ok) { toast.error("Failed to delete tenant."); setSaving(false); return }
    toast.success("Tenant removed.")
    setSaving(false)
    onClose()
    router.refresh()
  }

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
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: (normalizePhone(form.phone) ?? form.phone.trim()) || null,
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
        delinquency_start_date: form.delinquency_start_date || null,
        intake_action: hasExistingBalance ? form.intake_action : null,
        days_late_avg: parseFloat(form.days_late_avg) || 0,
        late_payment_count: parseInt(form.late_payment_count) || 0,
        previous_delinquency: form.previous_delinquency,
        source: "manual",
        status: "active",
      }

      const abort = new AbortController()
      timeout = setTimeout(() => abort.abort(), 15000)
      let success = false

      try {
        if (mode === "add") {
          const res = await fetch("/api/tenants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: abort.signal,
          })
          if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: "Failed to add tenant" }))
            toast.error(error ?? "Failed to add tenant")
            return
          }
          toast.success(`${form.name} added.`)
          success = true
        } else {
          const res = await fetch(`/api/tenants/${initial!.id!}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: abort.signal,
          })
          if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: "Update failed" }))
            toast.error(error ?? "Update failed")
            return
          }
          const saved = await res.json().catch(() => null)
          const enteredBalance = parseFloat(form.balance_due) || 0
          const savedBalance = saved?.balance_due != null ? Number(saved.balance_due) : null
          if (savedBalance !== null && Math.abs(savedBalance - enteredBalance) > 0.01) {
            toast.success(`Updated — balance saved as $${savedBalance.toLocaleString()} (adjusted from $${enteredBalance.toLocaleString()}).`)
          } else {
            toast.success("Tenant updated.")
          }
          success = true
        }
      } catch (err) {
        console.error("handleSubmit fetch error:", err)
        const isTimeout = err instanceof Error && err.name === "AbortError"
        toast.error(isTimeout ? "Request timed out — please try again." : "Network error. Please try again.")
      } finally {
        clearTimeout(timeout)
      }

      if (success) {
        onClose()
        router.refresh()
      }
    } catch (err) {
      console.error("handleSubmit error:", err)
      toast.error("An unexpected error occurred.")
    } finally {
      setSaving(false)
    }
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
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Lease Start" value={form.lease_start} onChange={v => set("lease_start", v)} type="date" />
                  <Field label="Lease End" value={form.lease_end} onChange={v => set("lease_end", v)} type="date" />
                </div>
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
                {hasExistingBalance && mode === "add" && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                    <div className="text-amber-300 text-sm font-semibold mb-1">Existing balance review</div>
                    <p className="text-[#6b7280] text-xs leading-relaxed mb-3">
                      This tenant will be added to review before Auto Mode contacts them.
                    </p>
                    <Field label="Delinquency Start Date" value={form.delinquency_start_date} onChange={v => set("delinquency_start_date", v)} type="date" />
                    {balanceHint && (
                      <div className="mt-2 text-xs text-amber-200/80 bg-amber-500/[0.06] rounded-lg px-3 py-2 border border-amber-500/15 leading-relaxed">
                        Last payment was <strong>{balanceHint.monthsSinceLastPayment} months</strong> ago but you entered <strong>{balanceHint.monthsEntered} month{balanceHint.monthsEntered !== 1 ? "s" : ""}</strong> of balance — they may owe more. Double-check the balance amount before saving.
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                      {[
                        { value: "manual_review", label: "Review first", desc: "Default. No tenant auto-text until approved." },
                        { value: "no_contact", label: "No contact yet", desc: "Track balance, keep automation blocked." },
                      ].map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => set("intake_action", option.value)}
                          className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                            form.intake_action === option.value
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                              : "border-white/10 bg-white/[0.02] text-[#6b7280] hover:text-[#9ca3af]"
                          }`}
                        >
                          <div className="text-xs font-semibold">{option.label}</div>
                          <div className="text-[10px] opacity-75 mt-0.5 leading-snug">{option.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
            {mode === "edit" ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className={`py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${confirmDelete ? "bg-red-500 hover:bg-red-600 text-white" : "bg-white/5 hover:bg-white/10 text-red-400"}`}
              >
                {confirmDelete ? "Confirm delete" : "Delete"}
              </button>
            ) : null}
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
