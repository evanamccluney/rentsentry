"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { CheckCircle, ArrowRight, Building2, User, Upload } from "lucide-react"

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

type Step = 1 | 2 | 3

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function checkAlreadyOnboarded() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", user.id)
        .single()
      if (profile?.onboarded) { router.push("/dashboard"); return }
      // If they already created a property, skip step 2
      const { data: props } = await supabase
        .from("properties")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
      if (props && props.length > 0) setStep(3)
    }
    checkAlreadyOnboarded()
  }, [])

  // Step 1 fields
  const [displayName, setDisplayName] = useState("")
  const [pmPhone, setPmPhone] = useState("")

  // Step 2 fields
  const [propertyName, setPropertyName] = useState("")
  const [propertyAddress, setPropertyAddress] = useState("")
  const [propertyState, setPropertyState] = useState("")

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
    { n: 3, label: "Upload" },
  ]

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-white text-2xl font-bold tracking-tight">RentSentry</h1>
          <p className="text-[#4b5563] text-sm mt-1">Let's get your portfolio set up</p>
        </div>

        {/* Step indicators */}
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
                {step > s.n
                  ? <CheckCircle size={11} />
                  : <span className="w-4 text-center">{s.n}</span>
                }
                {s.label}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-6 h-px ${step > s.n ? "bg-emerald-500/30" : "bg-white/10"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 — Your Info */}
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
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. John Smith"
                  autoFocus
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="block text-[#6b7280] text-xs uppercase tracking-wide mb-1.5">Phone Number <span className="normal-case text-[#374151]">(for PM alerts)</span></label>
                <input
                  type="tel"
                  value={pmPhone}
                  onChange={e => setPmPhone(e.target.value)}
                  placeholder="+1 (919) 000-0000"
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20"
                />
                <p className="text-[#374151] text-xs mt-1.5">Optional — you can add this later in Settings</p>
              </div>
            </div>

            <button
              onClick={completeStep1}
              disabled={loading}
              className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Continue <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Step 2 — First Property */}
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
                <input
                  type="text"
                  value={propertyName}
                  onChange={e => setPropertyName(e.target.value)}
                  placeholder="e.g. Oakview Apartments"
                  autoFocus
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="block text-[#6b7280] text-xs uppercase tracking-wide mb-1.5">Address <span className="normal-case text-[#374151]">(optional)</span></label>
                <input
                  type="text"
                  value={propertyAddress}
                  onChange={e => setPropertyAddress(e.target.value)}
                  placeholder="1420 Sunset Blvd, Raleigh, NC"
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="block text-[#6b7280] text-xs uppercase tracking-wide mb-1.5">State <span className="normal-case text-[#374151]">(used for eviction timelines)</span></label>
                <select
                  value={propertyState}
                  onChange={e => setPropertyState(e.target.value)}
                  className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-white/20"
                >
                  <option value="">Select state…</option>
                  {US_STATES.map(([abbr, label]) => (
                    <option key={abbr} value={abbr}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={completeStep2}
              disabled={loading}
              className="w-full mt-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? "Creating…" : <><span>Continue</span> <ArrowRight size={14} /></>}
            </button>
          </div>
        )}

        {/* Step 3 — Upload */}
        {step === 3 && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-7">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold">You're set up</h2>
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

            <button
              onClick={goToUpload}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 mb-3"
            >
              <Upload size={14} />
              Upload Rent Roll Now
            </button>
            <button
              onClick={goToDashboard}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-[#6b7280] hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
            >
              Skip — I'll do this later
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
