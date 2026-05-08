"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { CheckCircle, ArrowRight, Building2, User, Upload, Scale, Bell } from "lucide-react"
import {
  escalationRulesToProfileUpdate,
  normalizeEscalationRules,
  rulesForPreset,
  type EscalationPreset,
  type EscalationRules,
} from "@/lib/escalation-rules"

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

type Step = 1 | 2 | 3 | 4

export default function OnboardingClient({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)

  // Step 1 fields
  const [displayName, setDisplayName] = useState("")
  const [pmPhone, setPmPhone] = useState("")

  // Step 2 fields
  const [propertyName, setPropertyName] = useState("")
  const [propertyAddress, setPropertyAddress] = useState("")
  const [propertyState, setPropertyState] = useState("")
  const [rules, setRules] = useState<EscalationRules>(() => rulesForPreset("professional"))

  function applyPreset(preset: EscalationPreset) {
    setRules(preset === "custom" ? normalizeEscalationRules({ ...rules, preset: "custom" }) : rulesForPreset(preset))
  }

  function updateRule(patch: Partial<EscalationRules>) {
    setRules(current => normalizeEscalationRules({ ...current, preset: "custom", ...patch }))
  }

  async function completeStep1() {
    if (!displayName.trim()) { toast.error("Enter your name."); return }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error("Not authenticated."); setLoading(false); return }
    await supabase.from("profiles").upsert({
      id: user.id,
      pm_display_name: displayName.trim(),
      pm_phone: pmPhone.trim() || null,
      onboarded: false,
      updated_at: new Date().toISOString(),
    })
    setLoading(false)
    setStep(2)
  }

  async function completeStep2() {
    if (!propertyName.trim()) { toast.error("Enter a property name."); return }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error("Not authenticated."); setLoading(false); return }
    const { error } = await supabase.from("properties").insert({
      user_id: user.id,
      name: propertyName.trim(),
      address: propertyAddress.trim() || null,
      state: propertyState || null,
    })
    if (error) { toast.error("Could not create property."); setLoading(false); return }
    setLoading(false)
    setStep(3)
  }

  async function completeStep3() {
    if (rules.paymentPlanDay > rules.payOrQuitDay || rules.payOrQuitDay > rules.cfkReviewDay || rules.cfkReviewDay > rules.attorneyReviewDay) {
      toast.error("Keep escalation days in order.")
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error("Not authenticated."); setLoading(false); return }
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      ...escalationRulesToProfileUpdate(rules),
      updated_at: new Date().toISOString(),
    })
    if (error) { toast.error("Could not save escalation rules."); setLoading(false); return }
    setLoading(false)
    setStep(4)
  }

  async function markOnboarded() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from("profiles").upsert({
        id: user.id,
        onboarded: true,
        updated_at: new Date().toISOString(),
      })
    }
  }

  async function goToDashboard() {
    await markOnboarded()
    router.push("/dashboard")
  }

  async function goToUpload() {
    await markOnboarded()
    router.push("/dashboard/upload")
  }

  const steps = [
    { n: 1, label: "Your Info" },
    { n: 2, label: "First Property" },
    { n: 3, label: "Discipline" },
    { n: 4, label: "Upload" },
  ]

  return (
    <div className={embedded ? "w-full" : "min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6 py-12"}>
      <div className={embedded ? "w-full max-w-lg mx-auto" : "w-full max-w-lg"}>
        <div className="text-center mb-8">
          <h1 className="text-white text-2xl font-bold tracking-tight">RentSentry</h1>
          <p className="text-[#4b5563] text-sm mt-1">Let&apos;s get your portfolio set up</p>
        </div>
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                step === s.n
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : step > s.n
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  : "bg-white/5 text-[#4b5563] border border-white/5"
              }`}>
                {step > s.n ? <CheckCircle size={11} /> : <span className="w-4 text-center">{s.n}</span>}
                {s.label}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-6 h-px ${step > s.n ? "bg-emerald-500/30" : "bg-white/10"}`} />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <User size={16} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold">About you</h2>
                <p className="text-[#4b5563] text-xs">This shows up in notices and outreach</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[#6b7280] text-xs uppercase tracking-wide mb-1.5">Your Name *</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. John Smith" autoFocus className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="block text-[#6b7280] text-xs uppercase tracking-wide mb-1.5">Phone Number <span className="normal-case text-[#374151]">(for PM alerts)</span></label>
                <input type="tel" value={pmPhone} onChange={e => setPmPhone(e.target.value)} placeholder="+1 (919) 000-0000" className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20" />
                <p className="text-[#374151] text-xs mt-1.5">Optional — you can add this later in Settings</p>
              </div>
            </div>

            <button onClick={completeStep1} disabled={loading} className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              Continue <ArrowRight size={14} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Building2 size={16} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold">Add your first property</h2>
                <p className="text-[#4b5563] text-xs">You can add more later — start with one</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[#6b7280] text-xs uppercase tracking-wide mb-1.5">Property Name *</label>
                <input type="text" value={propertyName} onChange={e => setPropertyName(e.target.value)} placeholder="e.g. Oakview Apartments" autoFocus className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="block text-[#6b7280] text-xs uppercase tracking-wide mb-1.5">Address <span className="normal-case text-[#374151]">(optional)</span></label>
                <input type="text" value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="1420 Sunset Blvd, Raleigh, NC" className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="block text-[#6b7280] text-xs uppercase tracking-wide mb-1.5">State <span className="normal-case text-[#374151]">(used for eviction timelines)</span></label>
                <select value={propertyState} onChange={e => setPropertyState(e.target.value)} className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20">
                  <option value="">Select state…</option>
                  {US_STATES.map(([abbr, label]) => <option key={abbr} value={abbr}>{label}</option>)}
                </select>
              </div>
            </div>

            <button onClick={completeStep2} disabled={loading} className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? "Creating…" : <><span>Continue</span> <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                <Scale size={16} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold">Set collection discipline</h2>
                <p className="text-[#4b5563] text-xs">
                  Set your baseline review points before and after rent is due.
                </p>
              </div>
            </div>
            <div className="space-y-2 mb-5">
              {[
                { value: "professional" as const, label: "Professional default", desc: "Reminder day 1, payment plan review day 5, Pay or Quit review day 5, CFK review day 21, attorney review day 30." },
                { value: "balanced" as const, label: "Balanced", desc: "A little more time before formal notice and legal review." },
                { value: "lenient" as const, label: "Lenient", desc: "Longer cure window for relationship-heavy portfolios." },
              ].map(opt => (
                <button key={opt.value} onClick={() => applyPreset(opt.value)} className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${rules.preset === opt.value ? "border-blue-500/40 bg-blue-500/10 text-blue-300" : "border-white/[0.06] bg-white/[0.02] text-[#6b7280] hover:text-[#9ca3af]"}`}>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-xs opacity-80">{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-[#6b7280] text-xs uppercase tracking-wide mb-3">Before rent is late</div>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex gap-3">
                  <Bell size={15} className="text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-white text-sm font-semibold">Early risk reminders</div>
                    <p className="text-[#4b5563] text-xs leading-relaxed">
                      Reach out before rent is due when a resident has a history of paying late.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateRule({ preDueRiskOutreachEnabled: !rules.preDueRiskOutreachEnabled })}
                  className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${rules.preDueRiskOutreachEnabled ? "bg-blue-500" : "bg-white/10"}`}
                  aria-label="Toggle pre-due risk outreach"
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${rules.preDueRiskOutreachEnabled ? "left-6" : "left-1"}`} />
                </button>
              </div>
              <div className="text-[#374151] text-xs">
                RentSentry chooses the timing automatically. You can fine-tune it later in Settings.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="block">
                <span className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">Reminder day</span>
                <input type="number" min="0" max="90" value={rules.reminderDay} onChange={e => updateRule({ reminderDay: Number(e.target.value) })} className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20" />
                <span className="text-[#374151] text-xs mt-1 block">Example: 1 means 1 day after rent due.</span>
              </label>
              {[
                ["Payment plan review day", "paymentPlanDay", "Days after rent due when a structured repayment offer becomes appropriate."],
                ["Pay or Quit review day", "payOrQuitDay", "Days after rent due when formal notice review begins."],
                ["CFK review day", "cfkReviewDay", "Days after rent due when Cash for Keys should be compared."],
                ["Attorney review day", "attorneyReviewDay", "Days after rent due when legal review should be ready."],
              ].map(([label, key]) => (
                <label key={key} className="block">
                  <span className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">{label}</span>
                  <input type="number" min="0" max="90" value={rules[key as keyof Pick<EscalationRules, "paymentPlanDay" | "payOrQuitDay" | "cfkReviewDay" | "attorneyReviewDay">] as number} onChange={e => updateRule({ [key]: Number(e.target.value) } as Partial<EscalationRules>)} className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20" />
                  <span className="text-[#374151] text-xs mt-1 block">
                    {(key === "paymentPlanDay" && "Example: 5 means 5 days after rent due.") ||
                      (key === "payOrQuitDay" && "Example: 14 means 14 days after rent due.") ||
                      (key === "cfkReviewDay" && "Example: 21 means 21 days after rent due.") ||
                      "Example: 30 means 30 days after rent due."}
                  </span>
                </label>
              ))}
            </div>
            <label className="block mb-5">
              <span className="text-[#6b7280] text-xs uppercase tracking-wide block mb-1.5">Policy notes</span>
              <textarea rows={3} value={rules.customPolicyNotes} onChange={e => updateRule({ customPolicyNotes: e.target.value })} placeholder="Optional: attorney approval rules, voucher tenant exceptions, hardship-plan handling." className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20" />
              <span className="text-[#374151] text-xs mt-1 block">
                These dates are baseline review points. Resident history, active payment plans, assistance, legal holds, small balances, and local requirements may adjust or pause escalation.
              </span>
            </label>
            <button onClick={completeStep3} disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? "Saving..." : <><span>Continue</span> <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-7">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold">You&apos;re set up</h2>
                <p className="text-[#4b5563] text-xs">One last thing — upload your rent roll</p>
              </div>
            </div>

            <p className="text-[#6b7280] text-sm leading-relaxed mt-4 mb-6">
              Upload a CSV export from AppFolio, Buildium, Yardi, or any PM software.
              RentSentry will automatically score every tenant for risk and flag anyone
              who needs attention — takes about 30 seconds.
            </p>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 mb-6 space-y-2">
              {[
                "Risk score for every tenant",
                "Flags late payers, expiring cards, and balance issues",
                "AI advisor loaded with your full portfolio",
              ].map(item => (
                <div key={item} className="flex items-center gap-2 text-[#9ca3af] text-sm">
                  <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                  {item}
                </div>
              ))}
            </div>

            <button onClick={goToUpload} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 mb-3">
              <Upload size={14} />
              Upload Rent Roll Now
            </button>
            <button onClick={goToDashboard} className="w-full py-2.5 rounded-xl text-sm font-semibold text-[#6b7280] hover:text-white bg-white/5 hover:bg-white/10 transition-colors">
              Skip — I&apos;ll do this later
            </button>
          </div>
        )}

        <p className="text-center text-[#2e3a50] text-xs mt-6">
          You can change any of this in Settings at any time
        </p>
      </div>
    </div>
  )
}
