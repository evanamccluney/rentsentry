"use client"
import { useState, useRef } from "react"
import { toast } from "sonner"
import { Phone, FileText, MessageSquare, Send, X, DollarSign } from "lucide-react"

interface Props {
  tenant: {
    id: string
    name: string
    phone: string | null
    email: string | null
    tier: string
    balance_due: number
    rent_amount: number
    days_past_due: number
    days_late_avg: number
    late_payment_count: number
    previous_delinquency: boolean
    card_expiry?: string | null
    payment_method?: string | null
    reasons: string[]
    late_fee: number
    requires_attorney: boolean
    property_name?: string | null
    action_type: string
    recommended_action: string
  }
}

type ModalType = "call" | "plan" | "sms" | "payment" | null

function buildSnapshot(tenant: Props["tenant"], actionType: string) {
  return {
    tier: tenant.tier,
    balance_due: tenant.balance_due,
    rent_amount: tenant.rent_amount,
    days_past_due: tenant.days_past_due,
    days_late_avg: tenant.days_late_avg,
    late_payment_count: tenant.late_payment_count,
    previous_delinquency: tenant.previous_delinquency,
    card_expiry: tenant.card_expiry ?? null,
    payment_method: tenant.payment_method ?? null,
    reasons: tenant.reasons,
    recommended_action: tenant.recommended_action,
    action_type: actionType,
    late_fee: tenant.late_fee,
    requires_attorney: tenant.requires_attorney,
    property_name: tenant.property_name ?? null,
    triggered_by: "user",
    scored_at: new Date().toISOString(),
  }
}

async function logAction(tenantId: string, type: string, snapshot: object, notes?: string | null, phone?: string | null, message?: string | null) {
  const res = await fetch("/api/interventions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, type, phone: phone ?? null, name: "", snapshot, notes: notes ?? null, message: message ?? null }),
  })
  return res.json()
}

export default function TenantActionsPanel({ tenant }: Props) {
  const [modal, setModal] = useState<ModalType>(null)
  const [loading, setLoading] = useState(false)

  // Call form state
  const [callOutcome, setCallOutcome] = useState<"attempted" | "completed">("completed")
  const [callNote, setCallNote] = useState("")

  // Payment plan form state
  const [planTotal, setPlanTotal] = useState("")
  const [planCount, setPlanCount] = useState(3)
  const [planStartDate, setPlanStartDate] = useState(new Date().toISOString().split("T")[0])
  const [planFrequency, setPlanFrequency] = useState<"weekly" | "biweekly" | "monthly">("monthly")
  const [planNote, setPlanNote] = useState("")

  // Custom SMS form state
  const [smsBody, setSmsBody] = useState("")

  // Record payment form state
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentNote, setPaymentNote] = useState("")

  function closeModal() {
    setModal(null)
    setCallNote("")
    setCallOutcome("completed")
    setPlanTotal("")
    setPlanCount(3)
    setPlanStartDate(new Date().toISOString().split("T")[0])
    setPlanFrequency("monthly")
    setPlanNote("")
    setSmsBody("")
    setPaymentAmount("")
    setPaymentDate(new Date().toISOString().split("T")[0])
    setPaymentNote("")
  }

  async function submitCall() {
    if (!callNote.trim()) { toast.error("Add a note about the call."); return }
    setLoading(true)
    try {
      const notes = `${callOutcome === "attempted" ? "Call attempted — no answer" : "Call completed"}. ${callNote.trim()}`
      const data = await logAction(tenant.id, "call_logged", buildSnapshot(tenant, "call_logged"), notes, null)
      if (data.ok) { toast.success("Call logged."); closeModal(); window.location.reload() }
      else toast.error(data.error || "Something went wrong.")
    } finally { setLoading(false) }
  }

  function generateSchedule(total: number, count: number, startDate: string, frequency: "weekly" | "biweekly" | "monthly") {
    const per = Math.floor((total / count) * 100) / 100
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(startDate)
      if (frequency === "weekly") d.setDate(d.getDate() + i * 7)
      else if (frequency === "biweekly") d.setDate(d.getDate() + i * 14)
      else d.setMonth(d.getMonth() + i)
      const amount = i === count - 1 ? Math.round((total - per * (count - 1)) * 100) / 100 : per
      return { amount, due_date: d.toISOString().split("T")[0] }
    })
  }

  async function submitPlan() {
    const total = parseFloat(planTotal)
    if (!total || total <= 0 || !planStartDate) { toast.error("Enter a total amount and start date."); return }
    setLoading(true)
    try {
      const installments = generateSchedule(total, planCount, planStartDate, planFrequency)
      const freqLabel = planFrequency === "biweekly" ? "every 2 weeks" : planFrequency
      const notes = `Payment plan: ${planCount} installments of ~$${installments[0].amount.toLocaleString()} ${freqLabel}, starting ${new Date(planStartDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.${planNote.trim() ? " " + planNote.trim() : ""}`
      const data = await logAction(
        tenant.id,
        "payment_plan_agreed",
        { ...buildSnapshot(tenant, "payment_plan_agreed"), installments, total_plan_amount: total, frequency: planFrequency, installment_count: planCount },
        notes,
      )
      if (data.ok) { toast.success("Payment plan recorded."); closeModal(); window.location.reload() }
      else toast.error(data.error || "Something went wrong.")
    } finally { setLoading(false) }
  }

  async function submitPayment() {
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) { toast.error("Enter a valid payment amount."); return }
    setLoading(true)
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, amount, date: paymentDate, note: paymentNote.trim() || null }),
      })
      const data = await res.json()
      if (data.ok) { toast.success(data.message || "Payment recorded."); closeModal(); window.location.reload() }
      else toast.error(data.error || "Something went wrong.")
    } finally { setLoading(false) }
  }

  async function submitSMS() {
    if (!smsBody.trim()) { toast.error("Write a message first."); return }
    if (!tenant.phone) { toast.error("No phone number on file."); return }
    setLoading(true)
    try {
      const data = await logAction(tenant.id, "custom_sms", buildSnapshot(tenant, "custom_sms"), null, tenant.phone, smsBody.trim())
      if (data.ok) { toast.success("SMS sent."); closeModal(); window.location.reload() }
      else toast.error(data.error || "Something went wrong.")
    } finally { setLoading(false) }
  }

  return (
    <>
      {/* Action buttons */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-5">
        <div className="text-[#4b5563] text-xs uppercase tracking-wide font-medium mb-3">Quick Actions</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setModal("payment")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <DollarSign size={14} />
            Record Payment
          </button>
          <button
            onClick={() => setModal("call")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-[#9ca3af] hover:text-white hover:bg-white/10 transition-colors"
          >
            <Phone size={14} />
            Log Call
          </button>
          <button
            onClick={() => setModal("plan")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-[#9ca3af] hover:text-white hover:bg-white/10 transition-colors"
          >
            <FileText size={14} />
            Payment Plan Agreed
          </button>
          <button
            onClick={() => setModal("sms")}
            disabled={!tenant.phone}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-[#9ca3af] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!tenant.phone ? "No phone number on file" : undefined}
          >
            <MessageSquare size={14} />
            Custom SMS
          </button>
        </div>
      </div>

      {/* Modals */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Log Call */}
            {modal === "call" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-white font-semibold text-base">Log Call</h3>
                    <p className="text-[#4b5563] text-xs mt-0.5">{tenant.name}</p>
                  </div>
                  <button onClick={closeModal} className="text-[#4b5563] hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Outcome</label>
                    <div className="flex gap-2">
                      {(["completed", "attempted"] as const).map(v => (
                        <button
                          key={v}
                          onClick={() => setCallOutcome(v)}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                            callOutcome === v
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                              : "bg-white/5 border-white/10 text-[#6b7280] hover:text-white"
                          }`}
                        >
                          {v === "completed" ? "Completed" : "No Answer"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Notes</label>
                    <textarea
                      value={callNote}
                      onChange={e => setCallNote(e.target.value)}
                      placeholder="What was discussed? Any commitments made?"
                      rows={3}
                      className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#374151] resize-none focus:outline-none focus:border-white/20"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={submitCall}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Phone size={13} />
                    {loading ? "Saving…" : "Save Call Log"}
                  </button>
                </div>
              </div>
            )}

            {/* Payment Plan */}
            {modal === "plan" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-white font-semibold text-base">Payment Plan</h3>
                    <p className="text-[#4b5563] text-xs mt-0.5">{tenant.name} · Balance ${tenant.balance_due.toLocaleString()}</p>
                  </div>
                  <button onClick={closeModal} className="text-[#4b5563] hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Total + installments */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Total Amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b5563] text-sm">$</span>
                        <input
                          type="number"
                          value={planTotal}
                          onChange={e => setPlanTotal(e.target.value)}
                          placeholder={tenant.balance_due > 0 ? String(tenant.balance_due) : "0"}
                          autoFocus
                          className="w-full bg-[#0d1117] border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white placeholder-[#374151] focus:outline-none focus:border-white/20"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">First Payment</label>
                      <input
                        type="date"
                        value={planStartDate}
                        onChange={e => setPlanStartDate(e.target.value)}
                        className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20"
                      />
                    </div>
                  </div>

                  {/* Installment count */}
                  <div>
                    <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Installments</label>
                    <div className="flex gap-2">
                      {[2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => setPlanCount(n)}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                            planCount === n
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                              : "bg-white/5 border-white/10 text-[#6b7280] hover:text-white"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Frequency</label>
                    <div className="flex gap-2">
                      {(["weekly", "biweekly", "monthly"] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setPlanFrequency(f)}
                          className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                            planFrequency === f
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                              : "bg-white/5 border-white/10 text-[#6b7280] hover:text-white"
                          }`}
                        >
                          {f === "biweekly" ? "Every 2 wks" : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Schedule preview */}
                  {planTotal && parseFloat(planTotal) > 0 && (
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                      <p className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Schedule Preview</p>
                      <div className="space-y-1.5">
                        {generateSchedule(parseFloat(planTotal), planCount, planStartDate, planFrequency).map((inst, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-[#6b7280]">Installment {i + 1} — {new Date(inst.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                            <span className="text-white font-semibold">${inst.amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Notes <span className="text-[#2e3a50] normal-case">(optional)</span></label>
                    <textarea
                      value={planNote}
                      onChange={e => setPlanNote(e.target.value)}
                      placeholder="Special conditions, verbal agreements, etc."
                      rows={2}
                      className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#374151] resize-none focus:outline-none focus:border-white/20"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={submitPlan}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <FileText size={13} />
                    {loading ? "Saving…" : "Record Agreement"}
                  </button>
                </div>
              </div>
            )}

            {/* Record Payment */}
            {modal === "payment" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-white font-semibold text-base">Record Payment</h3>
                    <p className="text-[#4b5563] text-xs mt-0.5">
                      {tenant.name} · Balance ${tenant.balance_due.toLocaleString()}
                    </p>
                  </div>
                  <button onClick={closeModal} className="text-[#4b5563] hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Amount Paid</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4b5563] text-sm">$</span>
                        <input
                          type="number"
                          value={paymentAmount}
                          onChange={e => setPaymentAmount(e.target.value)}
                          placeholder={tenant.balance_due > 0 ? String(tenant.balance_due) : String(tenant.rent_amount)}
                          min={0}
                          step="0.01"
                          autoFocus
                          className="w-full bg-[#0d1117] border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-sm text-white placeholder-[#374151] focus:outline-none focus:border-white/20"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Payment Date</label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={e => setPaymentDate(e.target.value)}
                        className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20"
                      />
                    </div>
                  </div>

                  {tenant.balance_due > 0 && paymentAmount && parseFloat(paymentAmount) >= tenant.balance_due && (
                    <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                      This will clear the outstanding balance.
                    </div>
                  )}

                  <div>
                    <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Note <span className="normal-case text-[#2e3a50]">(optional)</span></label>
                    <input
                      type="text"
                      value={paymentNote}
                      onChange={e => setPaymentNote(e.target.value)}
                      placeholder="e.g. Check #1042, Zelle transfer, etc."
                      className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#374151] focus:outline-none focus:border-white/20"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={submitPayment}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <DollarSign size={13} />
                    {loading ? "Saving…" : "Record Payment"}
                  </button>
                </div>
              </div>
            )}

            {/* Custom SMS */}
            {modal === "sms" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-white font-semibold text-base">Send Custom SMS</h3>
                    <p className="text-[#4b5563] text-xs mt-0.5">{tenant.phone ?? "No phone on file"}</p>
                  </div>
                  <button onClick={closeModal} className="text-[#4b5563] hover:text-white transition-colors">
                    <X size={16} />
                  </button>
                </div>

                <div>
                  <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Message</label>
                  <textarea
                    value={smsBody}
                    onChange={e => setSmsBody(e.target.value)}
                    placeholder={`Hi ${tenant.name}, …`}
                    rows={4}
                    maxLength={320}
                    className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#374151] resize-none focus:outline-none focus:border-white/20"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[#2e3a50] text-[10px]">{smsBody.length > 160 ? "2 segments" : "1 segment"}</span>
                    <span className={`text-[10px] ${smsBody.length > 300 ? "text-orange-400" : "text-[#2e3a50]"}`}>{smsBody.length}/320</span>
                  </div>
                </div>

                <p className="text-[#374151] text-xs mt-4 mb-5">
                  Logged to activity history regardless of delivery.
                </p>

                <div className="flex gap-3">
                  <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[#9ca3af] bg-white/5 hover:bg-white/10 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={submitSMS}
                    disabled={loading || !tenant.phone}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send size={13} />
                    {loading ? "Sending…" : "Send SMS"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
