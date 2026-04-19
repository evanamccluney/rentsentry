"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Zap, Bell, Scale, HandCoins, CalendarClock, FileText, Phone } from "lucide-react"

export default function SettingsPage() {
  const [autoMode, setAutoMode] = useState(false)
  const [pmPhone, setPmPhone] = useState("")
  const [pmAlertsEnabled, setPmAlertsEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("profiles")
        .select("auto_mode, pm_phone, pm_alerts_enabled")
        .eq("id", user.id)
        .single()
      if (data) {
        setAutoMode(data.auto_mode ?? false)
        setPmPhone(data.pm_phone ?? "")
        setPmAlertsEnabled(data.pm_alerts_enabled ?? false)
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
            {
              icon: <Bell size={13} className="text-yellow-400" />,
              label: "Proactive rent reminder",
              when: "3 days before the 1st",
              condition: "Tenant has 2+ late payments or averages 3+ days late",
            },
            {
              icon: <Bell size={13} className="text-blue-400" />,
              label: "Payment method alert",
              when: "7 days before the 1st",
              condition: "No payment method on file",
            },
            {
              icon: <CalendarClock size={13} className="text-amber-400" />,
              label: "Payment plan offer",
              when: "On approval",
              condition: "Balance due + late payment history",
            },
            {
              icon: <HandCoins size={13} className="text-orange-400" />,
              label: "Cash for Keys offer",
              when: "On approval",
              condition: "1+ month outstanding",
            },
            {
              icon: <FileText size={13} className="text-red-300" />,
              label: "Pay or Quit notice",
              when: "On approval — attorney review recommended",
              condition: "Chronic history + outstanding balance",
            },
            {
              icon: <Scale size={13} className="text-red-400" />,
              label: "Eviction packet",
              when: "On approval — attorney required",
              condition: "2–3+ months outstanding",
            },
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

      {/* State per property */}
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
