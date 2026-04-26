"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Zap, Bell, Scale, HandCoins, CalendarClock, FileText, Phone, User, DollarSign } from "lucide-react"

const ESCALATION_OPTIONS = [
  {
    value: "aggressive",
    label: "Aggressive",
    desc: "Alert on days 1, 3, 7, 15, 30 — ideal for high-turnover or high-risk portfolios",
    color: "border-red-500/40 bg-red-500/5 text-red-300",
    dot: "bg-red-500",
  },
  {
    value: "moderate",
    label: "Moderate",
    desc: "Alert on days 1, 5, 10, 20, 35 — balanced default for most portfolios",
    color: "border-amber-500/40 bg-amber-500/5 text-amber-300",
    dot: "bg-amber-500",
  },
  {
    value: "lenient",
    label: "Lenient",
    desc: "Alert on days 1, 10, 20, 45 — for long-term tenants with established trust",
    color: "border-blue-500/40 bg-blue-500/5 text-blue-300",
    dot: "bg-blue-500",
  },
]

export default function SettingsPage() {
  const [autoMode, setAutoMode] = useState(false)
  const [pmPhone, setPmPhone] = useState("")
  const [pmAlertsEnabled, setPmAlertsEnabled] = useState(false)
  const [escalationStyle, setEscalationStyle] = useState("moderate")
  const [lateFeePercent, setLateFeePercent] = useState("5")
  const [pmDisplayName, setPmDisplayName] = useState("")
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("profiles")
        .select("auto_mode, pm_phone, pm_alerts_enabled, escalation_style, late_fee_percent, pm_display_name")
        .eq("id", user.id)
        .single()
      if (data) {
        setAutoMode(data.auto_mode ?? false)
        setPmPhone(data.pm_phone ?? "")
        setPmAlertsEnabled(data.pm_alerts_enabled ?? false)
        setEscalationStyle(data.escalation_style ?? "moderate")
        setLateFeePercent(String(data.late_fee_percent ?? 5))
        setPmDisplayName(data.pm_display_name ?? "")
      }
      setLoaded(true)
    }
    load()
  }, [])

  async function save() {
    if (pmAlertsEnabled && !pmPhone.trim()) {
      toast.error("Enter your phone number to enable PM alerts.")
      return
    }
    const fee = parseFloat(lateFeePercent)
    if (isNaN(fee) || fee < 0 || fee > 50) {
      toast.error("Late fee must be between 0% and 50%.")
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        auto_mode: autoMode,
        pm_phone: pmPhone.trim() || null,
        pm_alerts_enabled: pmAlertsEnabled,
        escalation_style: escalationStyle,
        late_fee_percent: fee,
        pm_display_name: pmDisplayName.trim() || null,
        updated_at: new Date().toISOString(),
      })
    if (error) toast.error(error.message)
    else toast.success("Settings saved.")
    setSaving(false)
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-[#6b7280] text-sm mt-1">Configure how RentSentry monitors and acts on your portfolio.</p>
      </div>

      {/* PM Identity */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <User size={15} className="text-blue-400" />
          <h2 className="text-white font-semibold text-sm">Your Info</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4">Used in legal notices and outreach — tenants see this name.</p>
        <div>
          <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Display Name</label>
          <input
            type="text"
            value={pmDisplayName}
            onChange={e => setPmDisplayName(e.target.value)}
            placeholder="e.g. John Smith / Oakview Properties"
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
          />
        </div>
      </div>

      {/* Late Fee */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign size={15} className="text-amber-400" />
          <h2 className="text-white font-semibold text-sm">Late Fee</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4">
          Applied when rent is more than 5 days past due. Shown on the tenant detail page and in cost comparisons.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={lateFeePercent}
            onChange={e => setLateFeePercent(e.target.value)}
            className="w-24 bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 text-center"
          />
          <span className="text-[#6b7280] text-sm">% of monthly rent</span>
          {lateFeePercent && !isNaN(parseFloat(lateFeePercent)) && (
            <span className="text-[#4b5563] text-xs ml-auto">
              e.g. $1,500 rent → <span className="text-white">${Math.round(1500 * parseFloat(lateFeePercent) / 100)} late fee</span>
            </span>
          )}
        </div>
      </div>

      {/* Escalation Style */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Scale size={15} className="text-red-400" />
          <h2 className="text-white font-semibold text-sm">Escalation Style</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4">
          Controls how quickly RentSentry alerts you as tenants fall behind. The days shown are when you receive a PM alert — not when SMS is sent to tenants.
        </p>
        <div className="space-y-2">
          {ESCALATION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setEscalationStyle(opt.value)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                escalationStyle === opt.value
                  ? opt.color
                  : "border-white/[0.06] bg-white/[0.02] text-[#6b7280] hover:border-white/10 hover:text-[#9ca3af]"
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${escalationStyle === opt.value ? opt.dot : "bg-[#374151]"}`} />
                <span className="text-sm font-semibold">{opt.label}</span>
              </div>
              <p className="text-xs ml-4 opacity-80">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Auto Mode */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap size={15} className="text-blue-400" />
              <h2 className="text-white font-semibold text-sm">Auto Mode</h2>
            </div>
            <p className="text-[#4b5563] text-xs leading-relaxed max-w-md">
              When on, RentSentry automatically schedules outreach for at-risk tenants
              before the 1st of each month. All actions still require your approval before sending —
              auto mode only changes whether actions are <span className="text-[#9ca3af]">queued</span> or left as <span className="text-[#9ca3af]">needs review</span>.
            </p>
          </div>
          <button
            onClick={() => setAutoMode(v => !v)}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${autoMode ? "bg-emerald-500" : "bg-white/10"}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${autoMode ? "left-6" : "left-1"}`} />
          </button>
        </div>
        <div className={`mt-4 px-3 py-2 rounded-lg text-xs ${autoMode ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-white/5 border border-white/5 text-[#4b5563]"}`}>
          {autoMode
            ? "Auto Mode ON — tenants with risk signals are queued for scheduled outreach"
            : "Auto Mode OFF — system scores and flags tenants but takes no scheduled action"}
        </div>
      </div>

      {/* PM Alerts */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between gap-6 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Phone size={15} className="text-orange-400" />
              <h2 className="text-white font-semibold text-sm">PM Alerts</h2>
            </div>
            <p className="text-[#4b5563] text-xs leading-relaxed max-w-md">
              RentSentry texts you directly when tenants hit critical thresholds — so you
              don't have to log in to know something needs attention.
            </p>
          </div>
          <button
            onClick={() => setPmAlertsEnabled(v => !v)}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${pmAlertsEnabled ? "bg-orange-500" : "bg-white/10"}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${pmAlertsEnabled ? "left-6" : "left-1"}`} />
          </button>
        </div>

        <div className="mb-4">
          <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Your phone number</label>
          <input
            type="tel"
            value={pmPhone}
            onChange={e => setPmPhone(e.target.value)}
            placeholder="+1 (919) 000-0000"
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
          />
        </div>

        <div className="space-y-2.5">
          {[
            { when: "Day 3", what: "X tenants are newly late — review needed", dot: "bg-yellow-400" },
            { when: "Day 10", what: "Tenant X is 10 days delinquent — action required", dot: "bg-red-500" },
            { when: "5 days before 1st", what: "X tenants have a balance with rent due soon", dot: "bg-orange-400" },
          ].map(({ when, what, dot }) => (
            <div key={when} className="flex items-start gap-2.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${dot}`} />
              <div>
                <span className="text-[#9ca3af] text-xs font-medium">{when}</span>
                <span className="text-[#4b5563] text-xs"> — {what}</span>
              </div>
            </div>
          ))}
        </div>

        {pmAlertsEnabled && (
          <div className="mt-4 px-3 py-2 rounded-lg text-xs bg-orange-500/10 border border-orange-500/20 text-orange-400">
            Alerts ON — you will receive SMS at the thresholds above
          </div>
        )}
      </div>

      {/* What auto mode does */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <h2 className="text-white font-semibold text-sm mb-4">What gets automated</h2>
        <div className="space-y-3">
          {[
            { icon: <Bell size={13} className="text-yellow-400" />, label: "Proactive rent reminder", when: "3 days before the 1st", condition: "Tenant has 2+ late payments or averages 3+ days late" },
            { icon: <Bell size={13} className="text-blue-400" />, label: "Payment method alert", when: "7 days before the 1st", condition: "No payment method on file" },
            { icon: <CalendarClock size={13} className="text-amber-400" />, label: "Payment plan offer", when: "On approval", condition: "Balance due + late payment history" },
            { icon: <HandCoins size={13} className="text-orange-400" />, label: "Cash for Keys offer", when: "On approval", condition: "1+ month outstanding" },
            { icon: <FileText size={13} className="text-red-300" />, label: "Pay or Quit notice", when: "On approval — attorney review recommended", condition: "Chronic history + outstanding balance" },
            { icon: <Scale size={13} className="text-red-400" />, label: "Eviction packet", when: "On approval — attorney required", condition: "2–3+ months outstanding" },
          ].map(({ icon, label, when, condition }) => (
            <div key={label} className="flex gap-3">
              <div className="mt-0.5 shrink-0">{icon}</div>
              <div>
                <div className="text-white text-xs font-medium">{label}</div>
                <div className="text-[#4b5563] text-xs">{condition}</div>
                <div className="text-[#374151] text-xs mt-0.5 font-mono">{when}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* State per property note */}
      <div className="bg-[#111827] border border-white/5 rounded-2xl p-5 mb-6">
        <p className="text-[#4b5563] text-xs leading-relaxed">
          <span className="text-white font-medium">Eviction timelines are set per property.</span>{" "}
          Go to Properties → Edit to set the state for each property.
          This gives accurate cost comparison estimates on the tenant detail page.
        </p>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  )
}
