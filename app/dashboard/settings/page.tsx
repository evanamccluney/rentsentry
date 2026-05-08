"use client"
import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Bell, CalendarClock, DollarSign, FileText, Phone, Scale, User, Zap } from "lucide-react"
import PlaidConnect from "@/components/dashboard/PlaidConnect"
import {
  escalationRulesToProfileUpdate,
  normalizeEscalationRules,
  rulesForPreset,
  type EscalationPreset,
  type EscalationRules,
} from "@/lib/escalation-rules"

const PROFILE_SELECT = `
  auto_mode, pm_phone, pm_alerts_enabled, late_fee_percent, pm_display_name,
  attorney_name, attorney_email, attorney_phone,
  plaid_item_id, plaid_connected_at,
  escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day,
  cfk_review_day, attorney_review_day, repeat_offender_accelerator_days,
  pre_due_risk_outreach_enabled, pre_due_risk_review_days_before_due,
  require_attorney_before_notice, payment_plan_before_notice, custom_escalation_notes
`

const PRESET_OPTIONS: Array<{ value: EscalationPreset; label: string; desc: string; color: string }> = [
  {
    value: "professional",
    label: "Professional default",
    desc: "Reminder day 1, payment plan day 5, Pay or Quit day 5, CFK review day 21, attorney review day 30.",
    color: "border-red-500/40 bg-red-500/5 text-red-300",
  },
  {
    value: "balanced",
    label: "Balanced",
    desc: "Still disciplined, but gives more time before formal notice and attorney review.",
    color: "border-amber-500/40 bg-amber-500/5 text-amber-300",
  },
  {
    value: "lenient",
    label: "Lenient",
    desc: "For relationship-heavy portfolios where you intentionally tolerate longer cure windows.",
    color: "border-blue-500/40 bg-blue-500/5 text-blue-300",
  },
  {
    value: "custom",
    label: "Custom",
    desc: "Use your own day thresholds. RentSentry still uses structured numbers, not free-text math.",
    color: "border-emerald-500/40 bg-emerald-500/5 text-emerald-300",
  },
]

function toRules(data: Record<string, unknown> | null): EscalationRules {
  return normalizeEscalationRules({
    preset: data?.escalation_preset,
    reminderDay: data?.reminder_day,
    paymentPlanDay: data?.payment_plan_day,
    payOrQuitDay: data?.pay_or_quit_day,
    cfkReviewDay: data?.cfk_review_day,
    attorneyReviewDay: data?.attorney_review_day,
    preDueRiskOutreachEnabled: data?.pre_due_risk_outreach_enabled,
    preDueRiskReviewDaysBeforeDue: data?.pre_due_risk_review_days_before_due,
    repeatOffenderAcceleratorDays: data?.repeat_offender_accelerator_days,
    requireAttorneyBeforeNotice: data?.require_attorney_before_notice,
    paymentPlanBeforeNotice: data?.payment_plan_before_notice,
    customPolicyNotes: data?.custom_escalation_notes,
  })
}

function dayInput(
  label: string,
  value: number,
  onChange: (value: number) => void,
  help: string
) {
  return (
    <label className="block">
      <span className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">{label}</span>
      <input
        type="number"
        min="0"
        max="90"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
      />
      <span className="text-[#374151] text-xs mt-1 block">{help}</span>
    </label>
  )
}

export default function SettingsPage() {
  const [autoMode, setAutoMode] = useState(false)
  const [pmPhone, setPmPhone] = useState("")
  const [pmAlertsEnabled, setPmAlertsEnabled] = useState(false)
  const [lateFeePercent, setLateFeePercent] = useState("5")
  const [pmDisplayName, setPmDisplayName] = useState("")
  const [rules, setRules] = useState<EscalationRules>(() => rulesForPreset("professional"))
  const [attorneyName, setAttorneyName] = useState("")
  const [attorneyEmail, setAttorneyEmail] = useState("")
  const [attorneyPhone, setAttorneyPhone] = useState("")
  const [plaidConnected, setPlaidConnected] = useState(false)
  const [plaidConnectedAt, setPlaidConnectedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const ordered = useMemo(
    () => rules.paymentPlanDay <= rules.payOrQuitDay && rules.payOrQuitDay <= rules.cfkReviewDay && rules.cfkReviewDay <= rules.attorneyReviewDay,
    [rules]
  )

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", user.id).single()
      if (data) {
        setAutoMode(data.auto_mode ?? false)
        setPmPhone(data.pm_phone ?? "")
        setPmAlertsEnabled(data.pm_alerts_enabled ?? false)
        setLateFeePercent(String(data.late_fee_percent ?? 5))
        setPmDisplayName(data.pm_display_name ?? "")
        setAttorneyName(data.attorney_name ?? "")
        setAttorneyEmail(data.attorney_email ?? "")
        setAttorneyPhone(data.attorney_phone ?? "")
        setPlaidConnected(!!data.plaid_item_id)
        setPlaidConnectedAt(data.plaid_connected_at ?? null)
        setRules(toRules(data))
      }
      setLoaded(true)
    }
    load()
  }, [])

  function updateRules(patch: Partial<EscalationRules>) {
    setRules(current => normalizeEscalationRules({ ...current, preset: "custom", ...patch }))
  }

  function applyPreset(preset: EscalationPreset) {
    setRules(preset === "custom" ? normalizeEscalationRules({ ...rules, preset: "custom" }) : rulesForPreset(preset))
  }

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
    if (!ordered) {
      toast.error("Escalation days must stay in order: plan, notice, CFK, attorney.")
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      auto_mode: autoMode,
      pm_phone: pmPhone.trim() || null,
      pm_alerts_enabled: pmAlertsEnabled,
      late_fee_percent: fee,
      pm_display_name: pmDisplayName.trim() || null,
      attorney_name: attorneyName.trim() || null,
      attorney_email: attorneyEmail.trim() || null,
      attorney_phone: attorneyPhone.trim() || null,
      ...escalationRulesToProfileUpdate(rules),
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
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-[#6b7280] text-sm mt-1">Configure how RentSentry monitors and escalates your portfolio.</p>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <User size={15} className="text-blue-400" />
          <h2 className="text-white font-semibold text-sm">Your Info</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4">Used in legal notices and outreach.</p>
        <label className="block">
          <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Display Name</span>
          <input
            type="text"
            value={pmDisplayName}
            onChange={e => setPmDisplayName(e.target.value)}
            placeholder="e.g. John Smith / Oakview Properties"
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
          />
        </label>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Scale size={15} className="text-red-400" />
          <h2 className="text-white font-semibold text-sm">Escalation Rules</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4">
          These thresholds feed the actual recommendation engine. The default mirrors disciplined PM operations: quick grace-period follow-up, formal notice review around day 5, CFK review before a second unpaid month, and attorney review around day 30.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
          {PRESET_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => applyPreset(opt.value)}
              className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                rules.preset === opt.value
                  ? opt.color
                  : "border-white/[0.06] bg-white/[0.02] text-[#6b7280] hover:border-white/10 hover:text-[#9ca3af]"
              }`}
            >
              <div className="text-sm font-semibold mb-0.5">{opt.label}</div>
              <p className="text-xs opacity-80 leading-relaxed">{opt.desc}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="sm:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="text-white text-sm font-semibold">Pre-due risk outreach</div>
                <p className="text-[#4b5563] text-xs leading-relaxed">
                  Prompt staff before rent is due when prior payment patterns suggest risk.
                </p>
              </div>
              <button onClick={() => updateRules({ preDueRiskOutreachEnabled: !rules.preDueRiskOutreachEnabled })} className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${rules.preDueRiskOutreachEnabled ? "bg-blue-500" : "bg-white/10"}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${rules.preDueRiskOutreachEnabled ? "left-6" : "left-1"}`} />
              </button>
            </div>
            <label className="block">
              <span className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">Review at-risk residents</span>
              <input
                type="number"
                min="0"
                max="30"
                value={rules.preDueRiskReviewDaysBeforeDue}
                onChange={e => updateRules({ preDueRiskReviewDaysBeforeDue: Number(e.target.value) })}
                disabled={!rules.preDueRiskOutreachEnabled}
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 disabled:opacity-50"
              />
              <span className="text-[#374151] text-xs mt-1 block">Days before rent due when proactive review starts.</span>
            </label>
          </div>
          {dayInput("Reminder day", rules.reminderDay, value => updateRules({ reminderDay: value }), "First PM-visible reminder after rent is due.")}
          {dayInput("Payment plan day", rules.paymentPlanDay, value => updateRules({ paymentPlanDay: value }), "When a structured repayment option becomes appropriate.")}
          {dayInput("Pay or Quit day", rules.payOrQuitDay, value => updateRules({ payOrQuitDay: value }), "When formal notice review starts for a full unpaid rent cycle.")}
          {dayInput("Cash for Keys review day", rules.cfkReviewDay, value => updateRules({ cfkReviewDay: value }), "When voluntary move-out economics should be compared.")}
          {dayInput("Attorney review day", rules.attorneyReviewDay, value => updateRules({ attorneyReviewDay: value }), "When unresolved nonpayment should be ready for legal review.")}
          {dayInput("Repeat-offender acceleration", rules.repeatOffenderAcceleratorDays, value => updateRules({ repeatOffenderAcceleratorDays: value }), "How many days sooner chronic cases move to attorney review.")}
        </div>

        {!ordered && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Keep the sequence ordered: payment plan &lt;= Pay or Quit &lt;= CFK review &lt;= attorney review.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => updateRules({ requireAttorneyBeforeNotice: !rules.requireAttorneyBeforeNotice })}
            className={`text-left rounded-xl border px-4 py-3 ${rules.requireAttorneyBeforeNotice ? "border-red-500/25 bg-red-500/8 text-red-300" : "border-white/10 bg-white/[0.02] text-[#6b7280]"}`}
          >
            <div className="text-sm font-semibold">Attorney before notice</div>
            <div className="text-xs opacity-80">Flags formal notices for attorney review.</div>
          </button>
          <button
            onClick={() => updateRules({ paymentPlanBeforeNotice: !rules.paymentPlanBeforeNotice })}
            className={`text-left rounded-xl border px-4 py-3 ${rules.paymentPlanBeforeNotice ? "border-amber-500/25 bg-amber-500/8 text-amber-300" : "border-white/10 bg-white/[0.02] text-[#6b7280]"}`}
          >
            <div className="text-sm font-semibold">Plan before notice</div>
            <div className="text-xs opacity-80">Keeps a structured cure path before legal pressure.</div>
          </button>
        </div>

        <label className="block">
          <span className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">Custom policy notes</span>
          <textarea
            value={rules.customPolicyNotes}
            onChange={e => updateRules({ customPolicyNotes: e.target.value })}
            rows={3}
            placeholder="Examples: call voucher tenants before notice, exclude active hardship plans, attorney must approve all notices in CA."
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
          />
          <span className="text-[#374151] text-xs mt-1 block">Notes are shown as policy context. They do not replace the structured day thresholds above.</span>
        </label>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign size={15} className="text-amber-400" />
          <h2 className="text-white font-semibold text-sm">Late Fee</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4">Shown in tenant detail and estimates. Confirm this matches the lease and local law.</p>
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
        </div>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap size={15} className="text-blue-400" />
              <h2 className="text-white font-semibold text-sm">Auto Mode</h2>
            </div>
            <p className="text-[#4b5563] text-xs leading-relaxed max-w-md">
              Queues outreach for at-risk tenants. Legal notices still require review before sending.
            </p>
          </div>
          <button onClick={() => setAutoMode(v => !v)} className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${autoMode ? "bg-emerald-500" : "bg-white/10"}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${autoMode ? "left-6" : "left-1"}`} />
          </button>
        </div>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between gap-6 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Phone size={15} className="text-orange-400" />
              <h2 className="text-white font-semibold text-sm">PM Alerts</h2>
            </div>
            <p className="text-[#4b5563] text-xs leading-relaxed max-w-md">Text you when tenants hit critical thresholds.</p>
          </div>
          <button onClick={() => setPmAlertsEnabled(v => !v)} className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${pmAlertsEnabled ? "bg-orange-500" : "bg-white/10"}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${pmAlertsEnabled ? "left-6" : "left-1"}`} />
          </button>
        </div>

        <label className="block">
          <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Your phone number</span>
          <input
            type="tel"
            value={pmPhone}
            onChange={e => setPmPhone(e.target.value)}
            placeholder="+1 (919) 000-0000"
            className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
          />
        </label>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <h2 className="text-white font-semibold text-sm mb-4">What Gets Automated</h2>
        <div className="space-y-3">
          {[
            { icon: <Bell size={13} className="text-yellow-400" />, label: "Reminder", when: `Day ${rules.reminderDay}`, condition: "Balance appears after rent due date" },
            ...(rules.preDueRiskOutreachEnabled ? [{ icon: <Bell size={13} className="text-blue-400" />, label: "Pre-due risk outreach", when: `Day -${rules.preDueRiskReviewDaysBeforeDue}`, condition: "Prior late-payment pattern before rent is due" }] : []),
            { icon: <CalendarClock size={13} className="text-amber-400" />, label: "Payment plan", when: `Day ${rules.paymentPlanDay}`, condition: "Balance plus time pressure or late history" },
            { icon: <FileText size={13} className="text-red-300" />, label: "Pay or Quit review", when: `Day ${rules.payOrQuitDay}`, condition: "Full rent cycle unpaid" },
            { icon: <Scale size={13} className="text-red-400" />, label: "Attorney review", when: `Day ${rules.attorneyReviewDay}`, condition: "Unresolved full-cycle nonpayment" },
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

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Scale size={15} className="text-violet-400" />
          <h2 className="text-white font-semibold text-sm">Attorney Contact</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4 leading-relaxed">
          When a tenant reaches your attorney review day, RentSentry automatically sends your attorney a pre-filled summary — tenant name, balance, days past due, and full intervention history. Nothing else to do.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Attorney Name</span>
            <input
              type="text"
              value={attorneyName}
              onChange={e => setAttorneyName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
            />
          </label>
          <label className="block">
            <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Attorney Email</span>
            <input
              type="email"
              value={attorneyEmail}
              onChange={e => setAttorneyEmail(e.target.value)}
              placeholder="attorney@lawfirm.com"
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
            />
            <span className="text-[#374151] text-xs mt-1 block">RentSentry sends the handoff email to this address when the attorney review day is reached.</span>
          </label>
          <label className="block">
            <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Attorney Phone <span className="normal-case text-[#2e3a50]">(optional)</span></span>
            <input
              type="tel"
              value={attorneyPhone}
              onChange={e => setAttorneyPhone(e.target.value)}
              placeholder="+1 (919) 000-0000"
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
            />
          </label>
        </div>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign size={15} className="text-emerald-400" />
          <h2 className="text-white font-semibold text-sm">Bank Feed</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4 leading-relaxed">
          Connect your rental income account and RentSentry will automatically detect payments. High-confidence matches are recorded instantly — low-confidence matches send you a quick SMS to confirm. Tenants don't need to do anything differently.
        </p>
        <PlaidConnect
          connected={plaidConnected}
          connectedAt={plaidConnectedAt}
          onConnected={() => {
            setPlaidConnected(true)
            setPlaidConnectedAt(new Date().toISOString())
          }}
        />
      </div>

      <button
        onClick={save}
        disabled={saving || !ordered}
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  )
}
