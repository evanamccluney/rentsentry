"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
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
  stripe_account_id, stripe_connect_at, stripe_charges_enabled,
  escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day,
  cfk_review_day, attorney_review_day, repeat_offender_accelerator_days,
  pre_due_risk_outreach_enabled, pre_due_risk_review_days_before_due,
  require_attorney_before_notice, payment_plan_before_notice, custom_escalation_notes,
  timezone, notification_email, default_rent_due_day, pm_alert_triggers
`

const PROFILE_SELECT_WITHOUT_ATTORNEY = `
  auto_mode, auto_payment_plan_offers, pm_phone, pm_alerts_enabled, late_fee_percent, late_fee_day, pm_display_name,
  plaid_item_id, plaid_connected_at,
  stripe_account_id, stripe_connect_at, stripe_charges_enabled,
  escalation_preset, reminder_day, payment_plan_day, pay_or_quit_day,
  cfk_review_day, attorney_review_day, repeat_offender_accelerator_days,
  pre_due_risk_outreach_enabled, pre_due_risk_review_days_before_due,
  require_attorney_before_notice, payment_plan_before_notice, custom_escalation_notes,
  timezone, notification_email, default_rent_due_day, pm_alert_triggers
`

function isMissingAttorneyColumn(error?: { message?: string } | null) {
  return !!error?.message && error.message.includes("attorney_") && error.message.includes("schema cache")
}

interface ProfileSettingsRow extends Record<string, unknown> {
  auto_mode?: boolean | null
  auto_payment_plan_offers?: boolean | null
  timezone?: string | null
  notification_email?: string | null
  default_rent_due_day?: number | null
  pm_alert_triggers?: unknown
  pm_phone?: string | null
  pm_alerts_enabled?: boolean | null
  late_fee_percent?: number | string | null
  late_fee_day?: number | null
  pm_display_name?: string | null
  attorney_name?: string | null
  attorney_email?: string | null
  attorney_phone?: string | null
  plaid_item_id?: string | null
  plaid_connected_at?: string | null
  stripe_account_id?: string | null
  stripe_connect_at?: string | null
  stripe_charges_enabled?: boolean | null
}

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

function SettingsPageInner() {
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
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoModeSaving, setAutoModeSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [savedSettingsKey, setSavedSettingsKey] = useState<string | null>(null)
  const skipUnsavedPromptRef = useRef(false)
  const searchParams = useSearchParams()

  const ordered = useMemo(
    () => rules.paymentPlanDay <= rules.payOrQuitDay && rules.payOrQuitDay <= rules.cfkReviewDay && rules.cfkReviewDay <= rules.attorneyReviewDay,
    [rules]
  )

  const settingsKey = useMemo(() => JSON.stringify({
    autoPaymentPlanOffers,
    timezone,
    notificationEmail,
    defaultRentDueDay,
    pmAlertTriggers,
    pmPhone,
    pmAlertsEnabled,
    lateFeePercent,
    lateFeeDay,
    pmDisplayName,
    rules,
    attorneyName,
    attorneyEmail,
    attorneyPhone,
  }), [
    autoPaymentPlanOffers,
    timezone,
    notificationEmail,
    defaultRentDueDay,
    pmAlertTriggers,
    pmPhone,
    pmAlertsEnabled,
    lateFeePercent,
    lateFeeDay,
    pmDisplayName,
    rules,
    attorneyName,
    attorneyEmail,
    attorneyPhone,
  ])

  const hasUnsavedChanges = loaded && savedSettingsKey !== null && savedSettingsKey !== settingsKey

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const profileResult = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", user.id).single()
      let data = profileResult.data as ProfileSettingsRow | null
      let error = profileResult.error
      if (isMissingAttorneyColumn(error)) {
        const fallback = await supabase.from("profiles").select(PROFILE_SELECT_WITHOUT_ATTORNEY).eq("id", user.id).single()
        data = fallback.data as ProfileSettingsRow | null
        error = fallback.error
      }
      if (error) console.error("Settings profile load error:", error.message)

      if (data) {
        const loadedRules = toRules(data)
        const loadedSettings = {
          autoPaymentPlanOffers: data.auto_payment_plan_offers ?? true,
          timezone: data.timezone ?? "America/New_York",
          notificationEmail: data.notification_email ?? "",
          defaultRentDueDay: data.default_rent_due_day ?? 1,
          pmAlertTriggers: Array.isArray(data.pm_alert_triggers) ? data.pm_alert_triggers : ["pay_or_quit", "legal", "installment_missed", "autopay_declined"],
          pmPhone: data.pm_phone ?? "",
          pmAlertsEnabled: data.pm_alerts_enabled ?? false,
          lateFeePercent: String(data.late_fee_percent ?? 5),
          lateFeeDay: data.late_fee_day ?? 5,
          pmDisplayName: data.pm_display_name ?? "",
          rules: loadedRules,
          attorneyName: data.attorney_name ?? "",
          attorneyEmail: data.attorney_email ?? "",
          attorneyPhone: data.attorney_phone ?? "",
        }

        setAutoMode(data.auto_mode ?? false)
        setAutoPaymentPlanOffers(loadedSettings.autoPaymentPlanOffers)
        setTimezone(loadedSettings.timezone)
        setNotificationEmail(loadedSettings.notificationEmail)
        setDefaultRentDueDay(loadedSettings.defaultRentDueDay)
        setPmAlertTriggers(loadedSettings.pmAlertTriggers)
        setPmPhone(loadedSettings.pmPhone)
        setPmAlertsEnabled(loadedSettings.pmAlertsEnabled)
        setLateFeePercent(loadedSettings.lateFeePercent)
        setLateFeeDay(loadedSettings.lateFeeDay)
        setPmDisplayName(loadedSettings.pmDisplayName)
        setAttorneyName(loadedSettings.attorneyName)
        setAttorneyEmail(loadedSettings.attorneyEmail)
        setAttorneyPhone(loadedSettings.attorneyPhone)
        setPlaidConnected(!!data.plaid_item_id)
        setPlaidConnectedAt(data.plaid_connected_at ?? null)
        setStripeConnected(!!data.stripe_account_id)
        setStripeConnectAt(data.stripe_connect_at ?? null)
        setStripeChargesEnabled(data.stripe_charges_enabled ?? false)
        setRules(loadedRules)
        setSavedSettingsKey(JSON.stringify(loadedSettings))
      } else {
        setSavedSettingsKey(JSON.stringify({
          autoPaymentPlanOffers: true,
          timezone: "America/New_York",
          notificationEmail: "",
          defaultRentDueDay: 1,
          pmAlertTriggers: ["pay_or_quit", "legal", "installment_missed", "autopay_declined"],
          pmPhone: "",
          pmAlertsEnabled: false,
          lateFeePercent: "5",
          lateFeeDay: 5,
          pmDisplayName: "",
          rules: rulesForPreset("professional"),
          attorneyName: "",
          attorneyEmail: "",
          attorneyPhone: "",
        }))
      }

      // When returning from Stripe Connect onboarding, fetch live status from Stripe
      if (searchParams.get("connect") === "success") {
        try {
          const session = await supabase.auth.getSession()
          const res = await fetch("/api/billing/connect/status", {
            headers: { Authorization: `Bearer ${session.data.session?.access_token}` },
          })
          const status = await res.json()
          if (status.connected) {
            setStripeConnected(true)
            setStripeChargesEnabled(status.chargesEnabled)
            if (status.chargesEnabled) {
              toast.success("Stripe account verified and active!")
            } else {
              toast("Stripe connected — waiting for Stripe to verify your account. This usually takes a few minutes.")
            }
          }
        } catch {
          // non-critical
        }
      }

      setLoaded(true)
    }
    load()
  }, [searchParams])

  function updateRules(patch: Partial<EscalationRules>) {
    setRules(current => normalizeEscalationRules({ ...current, preset: "custom", ...patch }))
  }

  function applyPreset(preset: EscalationPreset) {
    setRules(preset === "custom" ? normalizeEscalationRules({ ...rules, preset: "custom" }) : rulesForPreset(preset))
  }

  async function toggleAutoMode() {
    if (autoModeSaving) return

    const nextAutoMode = !autoMode
    setAutoMode(nextAutoMode)
    setAutoModeSaving(true)

    try {
      const res = await fetch("/api/profile/auto-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextAutoMode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not update auto mode.")

      setAutoMode(data.auto_mode ?? nextAutoMode)
    } catch (error) {
      setAutoMode(!nextAutoMode)
      toast.error(error instanceof Error ? error.message : "Could not update auto mode.")
    } finally {
      setAutoModeSaving(false)
    }
  }

  const save = useCallback(async (options: { silent?: boolean } = {}) => {
    if (pmAlertsEnabled && !pmPhone.trim()) {
      toast.error("Enter your phone number to enable PM alerts.")
      return false
    }
    const fee = parseFloat(lateFeePercent)
    if (isNaN(fee) || fee < 0 || fee > 50) {
      toast.error("Late fee must be between 0% and 50%.")
      return false
    }
    if (!ordered) {
      toast.error("Escalation days must stay in order: plan, notice, CFK, attorney.")
      return false
    }

    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return false }
    const payload = {
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
    }
    const { error } = await supabase.from("profiles").upsert(payload)
    if (error) {
      if (isMissingAttorneyColumn(error)) {
        const payloadWithoutAttorney: Record<string, unknown> = { ...payload }
        delete payloadWithoutAttorney.attorney_name
        delete payloadWithoutAttorney.attorney_email
        delete payloadWithoutAttorney.attorney_phone
        const retry = await supabase.from("profiles").upsert(payloadWithoutAttorney)
        if (!retry.error) {
          setSavedSettingsKey(settingsKey)
          if (!options.silent) toast.warning("Settings saved. Attorney contact fields need the latest database migration before they can save.")
          setSaving(false)
          return true
        }
      }

      toast.error(error.message)
      setSaving(false)
      return false
    }

    setSavedSettingsKey(settingsKey)
    if (!options.silent) toast.success("Settings saved.")
    setSaving(false)
    return true
  }, [
    pmAlertsEnabled,
    pmPhone,
    lateFeePercent,
    ordered,
    autoMode,
    autoPaymentPlanOffers,
    timezone,
    notificationEmail,
    defaultRentDueDay,
    pmAlertTriggers,
    lateFeeDay,
    pmDisplayName,
    attorneyName,
    attorneyEmail,
    attorneyPhone,
    rules,
    settingsKey,
  ])

  useEffect(() => {
    if (!hasUnsavedChanges) return

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (skipUnsavedPromptRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }

    function onDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest("a[href]")
      if (!(link instanceof HTMLAnchorElement) || link.target) return

      const url = new URL(link.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      event.preventDefault()
      void save({ silent: true }).then(saved => {
        if (saved) {
          skipUnsavedPromptRef.current = true
          window.location.href = link.href
        }
      })
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onDocumentClick, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onDocumentClick, true)
    }
  }, [hasUnsavedChanges, save])

  function discardChanges() {
    if (!savedSettingsKey) return
    const saved = JSON.parse(savedSettingsKey)
    setAutoPaymentPlanOffers(saved.autoPaymentPlanOffers)
    setTimezone(saved.timezone)
    setNotificationEmail(saved.notificationEmail)
    setDefaultRentDueDay(saved.defaultRentDueDay)
    setPmAlertTriggers(saved.pmAlertTriggers)
    setPmPhone(saved.pmPhone)
    setPmAlertsEnabled(saved.pmAlertsEnabled)
    setLateFeePercent(saved.lateFeePercent)
    setLateFeeDay(saved.lateFeeDay)
    setPmDisplayName(saved.pmDisplayName)
    setRules(saved.rules)
    setAttorneyName(saved.attorneyName)
    setAttorneyEmail(saved.attorneyEmail)
    setAttorneyPhone(saved.attorneyPhone)
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={`max-w-3xl ${hasUnsavedChanges ? "pb-24" : ""}`}>
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
        <p className="text-[#374151] text-xs mt-2">e.g. &quot;5% kicks in after 5 days&quot; — automated reminders will tell tenants to pay before Day {lateFeeDay} to avoid the fee.</p>
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
          <button
            type="button"
            onClick={toggleAutoMode}
            disabled={autoModeSaving}
            aria-pressed={autoMode}
            aria-label="Toggle auto mode"
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${autoMode ? "bg-emerald-500" : "bg-white/10"}`}
          >
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
          Connect your rental income account and RentSentry will automatically detect payments. High-confidence matches are recorded instantly — low-confidence matches send you a quick SMS to confirm. Tenants don&apos;t need to do anything differently.
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
        <StripeConnect connected={stripeConnected} connectedAt={stripeConnectAt} chargesEnabled={stripeChargesEnabled} />
      </div>

      <button
        onClick={() => void save()}
        disabled={saving || !ordered}
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {hasUnsavedChanges && (
        <div className="fixed bottom-0 left-56 right-0 z-40 border-t border-white/10 bg-[#09090b]/95 backdrop-blur px-6 py-3">
          <div className="max-w-3xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-white text-sm font-semibold">Unsaved settings changes</div>
              <div className="text-[#6b7280] text-xs">Changes auto-save when you leave this page, or you can save them now.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discardChanges}
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-[#9ca3af] hover:text-white hover:bg-white/10 text-sm font-medium transition-colors"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !ordered}
                className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { Suspense } from "react"
export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  )
}
