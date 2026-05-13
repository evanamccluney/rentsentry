"use client"
import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Bell, CalendarClock, DollarSign, FileText, Phone, Scale, User, Zap } from "lucide-react"
import PlaidConnect from "@/components/dashboard/PlaidConnect"
import StripeConnect from "@/components/dashboard/StripeConnect"
import {
  escalationRulesToProfileUpdate,
  normalizeEscalationRules,
  rulesForPreset,
  type EscalationPreset,
  type EscalationRules,
} from "@/lib/escalation-rules"

const PROFILE_SELECT = `
  auto_mode, auto_payment_plan_offers, pm_phone, pm_alerts_enabled, late_fee_percent, late_fee_day, pm_display_name,
  attorney_name, attorney_email, attorney_phone,
  plaid_item_id, plaid_connected_at,
  stripe_account_id, stripe_connect_at,
  escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day,
  cfk_review_day, attorney_review_day, repeat_offender_accelerator_days,
  pre_due_risk_outreach_enabled, pre_due_risk_review_days_before_due,
  require_attorney_before_notice, payment_plan_before_notice, custom_escalation_notes,
  timezone, notification_email, default_rent_due_day, pm_alert_triggers
`

const US_TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET) — New York, Miami, Atlanta" },
  { value: "America/Chicago",     label: "Central (CT) — Chicago, Dallas, Houston" },
  { value: "America/Denver",      label: "Mountain (MT) — Denver, Phoenix" },
  { value: "America/Los_Angeles", label: "Pacific (PT) — Los Angeles, Seattle" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)" },
]

const PM_ALERT_OPTIONS: { key: string; label: string; desc: string }[] = [
  { key: "pay_or_quit",       label: "Tenant hits Pay or Quit",        desc: "Full rent cycle unpaid — formal notice now appropriate" },
  { key: "legal",             label: "Tenant hits Legal tier",          desc: "2+ months owed or 30+ days past due" },
  { key: "installment_missed",label: "Installment payment missed",      desc: "Tenant on a payment plan misses a due installment" },
  { key: "autopay_declined",  label: "Autopay payment declined",        desc: "Stripe or ACH payment fails for any tenant" },
  { key: "tenant_response",   label: "Tenant replies to SMS",           desc: "Tenant responds to an automated or manual message" },
]

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
  const [autoPaymentPlanOffers, setAutoPaymentPlanOffers] = useState(true)
  const [timezone, setTimezone] = useState("America/New_York")
  const [notificationEmail, setNotificationEmail] = useState("")
  const [defaultRentDueDay, setDefaultRentDueDay] = useState(1)
  const [pmAlertTriggers, setPmAlertTriggers] = useState<string[]>(["pay_or_quit", "legal", "installment_missed", "autopay_declined"])
  const [pmPhone, setPmPhone] = useState("")
  const [pmAlertsEnabled, setPmAlertsEnabled] = useState(false)
  const [lateFeePercent, setLateFeePercent] = useState("5")
  const [lateFeeDay, setLateFeeDay] = useState(5)
  const [pmDisplayName, setPmDisplayName] = useState("")
  const [rules, setRules] = useState<EscalationRules>(() => rulesForPreset("professional"))
  const [attorneyName, setAttorneyName] = useState("")
  const [attorneyEmail, setAttorneyEmail] = useState("")
  const [attorneyPhone, setAttorneyPhone] = useState("")
  const [plaidConnected, setPlaidConnected] = useState(false)
  const [plaidConnectedAt, setPlaidConnectedAt] = useState<string | null>(null)
  const [stripeConnected, setStripeConnected] = useState(false)
  const [stripeConnectAt, setStripeConnectAt] = useState<string | null>(null)
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
        setAutoPaymentPlanOffers(data.auto_payment_plan_offers ?? true)
        setTimezone(data.timezone ?? "America/New_York")
        setNotificationEmail(data.notification_email ?? "")
        setDefaultRentDueDay(data.default_rent_due_day ?? 1)
        setPmAlertTriggers(Array.isArray(data.pm_alert_triggers) ? data.pm_alert_triggers : ["pay_or_quit", "legal", "installment_missed", "autopay_declined"])
        setPmPhone(data.pm_phone ?? "")
        setPmAlertsEnabled(data.pm_alerts_enabled ?? false)
        setLateFeePercent(String(data.late_fee_percent ?? 5))
        setLateFeeDay(data.late_fee_day ?? 5)
        setPmDisplayName(data.pm_display_name ?? "")
        setAttorneyName(data.attorney_name ?? "")
        setAttorneyEmail(data.attorney_email ?? "")
        setAttorneyPhone(data.attorney_phone ?? "")
        setPlaidConnected(!!data.plaid_item_id)
        setPlaidConnectedAt(data.plaid_connected_at ?? null)
        setStripeConnected(!!data.stripe_account_id)
        setStripeConnectAt(data.stripe_connect_at ?? null)
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
      auto_payment_plan_offers: autoPaymentPlanOffers,
      timezone,
      notification_email: notificationEmail.trim() || null,
      default_rent_due_day: Math.min(28, Math.max(1, defaultRentDueDay)),
      pm_alert_triggers: pmAlertTriggers,
      pm_phone: pmPhone.trim() || null,
      pm_alerts_enabled: pmAlertsEnabled,
      late_fee_percent: fee,
      late_fee_day: Math.min(30, Math.max(0, lateFeeDay)),
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
        <p className="text-[#4b5563] text-xs mb-4">Must match your lease. These values are used in automated outreach timing and tenant-facing copy.</p>
        <div className="flex flex-wrap items-center gap-5">
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
          <div className="flex items-center gap-3">
            <span className="text-[#6b7280] text-sm">kicks in after</span>
            <input
              type="number"
              min="0"
              max="30"
              value={lateFeeDay}
              onChange={e => setLateFeeDay(Number(e.target.value))}
              className="w-20 bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 text-center"
            />
            <span className="text-[#6b7280] text-sm">days past due</span>
          </div>
        </div>
        <p className="text-[#374151] text-xs mt-2">e.g. "5% kicks in after 5 days" — automated reminders will tell tenants to pay before Day {lateFeeDay} to avoid the fee.</p>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between gap-6 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap size={15} className="text-blue-400" />
              <h2 className="text-white font-semibold text-sm">Auto Mode</h2>
            </div>
            <p className="text-[#4b5563] text-xs leading-relaxed max-w-md">
              Master switch for all automated tenant outreach — reminders, alerts, and offers. Legal notices always require your review.
            </p>
          </div>
          <button onClick={() => setAutoMode(v => !v)} className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${autoMode ? "bg-emerald-500" : "bg-white/10"}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${autoMode ? "left-6" : "left-1"}`} />
          </button>
        </div>

        <div className={`rounded-xl border p-4 transition-opacity ${autoMode ? "opacity-100" : "opacity-40 pointer-events-none"}`} style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <CalendarClock size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-white text-sm font-semibold">Auto-send payment plan offers</div>
                <p className="text-[#4b5563] text-xs leading-relaxed mt-0.5">
                  3–7 days before rent is due, text at-risk tenants a split-pay offer with a Stripe payment link. Prevents missed payments before they happen.
                </p>
                <p className={`text-xs mt-1.5 ${autoPaymentPlanOffers ? "text-amber-400/70" : "text-[#374151]"}`}>
                  {autoPaymentPlanOffers
                    ? "Offers send automatically — logged in tenant activity."
                    : "You'll see suggestions in the dashboard and send them yourself."}
                </p>
              </div>
            </div>
            <button
              onClick={() => setAutoPaymentPlanOffers(v => !v)}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${autoPaymentPlanOffers ? "bg-amber-500" : "bg-white/10"}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${autoPaymentPlanOffers ? "left-6" : "left-1"}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between gap-6 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Phone size={15} className="text-orange-400" />
              <h2 className="text-white font-semibold text-sm">PM Alerts</h2>
            </div>
            <p className="text-[#4b5563] text-xs leading-relaxed max-w-md">Text or email you when specific events happen. You pick exactly what fires an alert.</p>
          </div>
          <button onClick={() => setPmAlertsEnabled(v => !v)} className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${pmAlertsEnabled ? "bg-orange-500" : "bg-white/10"}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${pmAlertsEnabled ? "left-6" : "left-1"}`} />
          </button>
        </div>

        <div className={`space-y-4 transition-opacity ${pmAlertsEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Phone (SMS alerts)</span>
              <input
                type="tel"
                value={pmPhone}
                onChange={e => setPmPhone(e.target.value)}
                placeholder="+1 (919) 000-0000"
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
              />
            </label>
            <label className="block">
              <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Email (fallback if no phone)</span>
              <input
                type="email"
                value={notificationEmail}
                onChange={e => setNotificationEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20 placeholder:text-[#374151]"
              />
            </label>
          </div>

          <div>
            <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-2">Alert me when</span>
            <div className="space-y-2">
              {PM_ALERT_OPTIONS.map(opt => {
                const active = pmAlertTriggers.includes(opt.key)
                return (
                  <button
                    key={opt.key}
                    onClick={() => setPmAlertTriggers(v => active ? v.filter(k => k !== opt.key) : [...v, opt.key])}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors flex items-start gap-3 ${
                      active
                        ? "border-orange-500/25 bg-orange-500/8 text-orange-300"
                        : "border-white/[0.06] bg-white/[0.02] text-[#4b5563] hover:text-[#6b7280]"
                    }`}
                  >
                    <span className={`mt-0.5 w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${active ? "bg-orange-500 border-orange-500" : "border-white/20"}`}>
                      {active && <span className="w-1.5 h-1.5 rounded-sm bg-white" />}
                    </span>
                    <div>
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div className="text-[10px] opacity-70 mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Bell size={15} className="text-blue-400" />
          <h2 className="text-white font-semibold text-sm">Automation Timing</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4">Your daily outreach runs at 8am in your timezone. Set this so reminders land at the right time for your tenants.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Your timezone</span>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
            >
              {US_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <span className="text-[#374151] text-xs mt-1 block">
              Outreach fires at 8am {US_TIMEZONES.find(t => t.value === timezone)?.label.split(" — ")[0] ?? timezone}.
            </span>
          </label>
          <label className="block">
            <span className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">Default rent due day</span>
            <input
              type="number"
              min="1"
              max="28"
              value={defaultRentDueDay}
              onChange={e => setDefaultRentDueDay(Number(e.target.value))}
              className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
            />
            <span className="text-[#374151] text-xs mt-1 block">
              Used when importing tenants that don&apos;t have a due day in the CSV. Day 1–28.
            </span>
          </label>
        </div>
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

      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign size={15} className="text-blue-400" />
          <h2 className="text-white font-semibold text-sm">Payment Collection</h2>
        </div>
        <p className="text-[#4b5563] text-xs mb-4 leading-relaxed">
          Connect Stripe to send tenants a secure payment link when they{"'"}re late. Money goes directly to your account. A 0.5% platform fee is deducted — tenants pay nothing extra.
        </p>
        <StripeConnect connected={stripeConnected} connectedAt={stripeConnectAt} />
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
