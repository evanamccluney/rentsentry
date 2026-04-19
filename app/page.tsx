import Link from "next/link"
import {
  ArrowRight, CheckCircle2, Zap, FileText, MessageSquare,
  Lightbulb, Shield, TrendingUp, AlertTriangle, DollarSign,
} from "lucide-react"

// ── Mini UI previews ──────────────────────────────────────────────────────────

function TenantRowPreview({
  name, unit, balance, tier, badge, badgeColor, dot,
}: {
  name: string; unit: string; balance: string; tier: string
  badge: string; badgeColor: string; dot: string
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <div>
          <div className="text-white text-sm font-medium">{name}</div>
          <div className="text-[#4b5563] text-xs">Unit {unit}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {balance && <span className="text-red-400 text-xs font-semibold">{balance}</span>}
        <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeColor}`}>{badge}</span>
      </div>
    </div>
  )
}

function DashboardPreview() {
  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/40">
      {/* Stat row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Monthly Rent", value: "$18,400", color: "text-white" },
          { label: "Outstanding", value: "$3,250", color: "text-red-400" },
          { label: "Collection Rate", value: "82%", color: "text-yellow-400" },
        ].map(s => (
          <div key={s.label} className="bg-[#111827] rounded-xl p-3 border border-white/[0.06]">
            <div className="text-[#4b5563] text-xs mb-1">{s.label}</div>
            <div className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {/* Tenant list */}
      <div className="space-y-2">
        <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Needs Action</div>
        <TenantRowPreview name="Marcus Johnson" unit="4B" balance="$2,600" tier="pay_or_quit" badge="Pay or Quit" badgeColor="bg-red-500/10 text-red-400 border-red-500/20" dot="bg-red-400" />
        <TenantRowPreview name="Sandra Williams" unit="2A" balance="$1,300" tier="cash_for_keys" badge="Cash for Keys" badgeColor="bg-orange-500/10 text-orange-400 border-orange-500/20" dot="bg-orange-500" />
        <TenantRowPreview name="Kevin Durant" unit="7C" balance="$650" tier="reminder" badge="Reminder Sent" badgeColor="bg-yellow-400/10 text-yellow-400 border-yellow-400/20" dot="bg-yellow-400" />
      </div>
    </div>
  )
}

function AIPreview() {
  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center">
          <Lightbulb size={13} className="text-amber-400" />
        </div>
        <div>
          <div className="text-white text-sm font-semibold">AI Advisor — Marcus Johnson</div>
          <div className="text-[#4b5563] text-xs">$2,600 overdue · 2 months · 61 days past due</div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex justify-end">
          <div className="bg-blue-500/20 text-white text-xs rounded-2xl rounded-br-sm px-3 py-2 max-w-[80%]">
            Marcus said he needs 2 more weeks
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <Lightbulb size={9} className="text-amber-400" />
          </div>
          <div className="bg-white/[0.05] border border-white/[0.06] text-[#d1d5db] text-xs rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%]">
            At $2,600 and 61 days overdue, "2 more weeks" is not acceptable. Send Pay or Quit today — you're within GA's 3-day notice window. Want me to draft the SMS?
          </div>
        </div>
        <div className="bg-[#111827] border border-amber-500/20 rounded-xl p-2.5">
          <div className="text-amber-400 text-xs font-medium mb-1.5">📱 Suggested SMS</div>
          <div className="text-[#9ca3af] text-xs">Marcus, your balance of $2,600 is critically overdue. A Pay or Quit notice is being issued today. Contact me immediately to resolve this.</div>
        </div>
      </div>
    </div>
  )
}

function PayOrQuitPreview() {
  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={14} className="text-blue-400" />
        <span className="text-white text-sm font-semibold">Pay or Quit Notice — GA</span>
        <span className="ml-auto text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">State-Specific</span>
      </div>
      <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 space-y-2 mb-3">
        {[
          { label: "Tenant", value: "Marcus Johnson — Unit 4B" },
          { label: "Amount Owed", value: "$2,600.00" },
          { label: "Pay By", value: "April 22, 2026 (3-day notice)" },
          { label: "State Law", value: "GA § 44-7-50" },
        ].map(r => (
          <div key={r.label} className="flex justify-between text-xs">
            <span className="text-[#4b5563]">{r.label}</span>
            <span className="text-white font-medium">{r.value}</span>
          </div>
        ))}
      </div>
      <button className="w-full bg-blue-500/15 border border-blue-500/20 text-blue-400 text-xs font-semibold py-2 rounded-xl flex items-center justify-center gap-1.5">
        Download PDF Notice <ArrowRight size={11} />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0a0e1a] text-white">

      {/* Nav */}
      <nav className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-blue-400" />
            <span className="font-bold text-white text-lg">RentSentry</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-[#6b7280] hover:text-white text-sm transition-colors">
              Sign In
            </Link>
            <Link
              href="/signup"
              className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-20 pb-16 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-sm text-blue-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Built for independent landlords
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
            Most landlords lose<br />
            <span className="text-blue-400">2–3 months of rent</span><br />
            before they know what to do.
          </h1>

          <p className="text-[#9ca3af] text-xl leading-relaxed mb-10 max-w-2xl mx-auto">
            RentSentry tells you exactly what to do the moment a tenant goes late —
            automated SMS, state-specific legal notices, and an AI advisor that knows
            every detail of your tenant's history.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Link
              href="/signup"
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors flex items-center justify-center gap-2"
            >
              Start Free — No Credit Card <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="border border-white/10 hover:border-white/20 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors"
            >
              Sign In
            </Link>
          </div>

          <p className="text-[#4b5563] text-sm">Free for 3 months · No setup fees · Cancel anytime</p>
        </div>
      </section>

      {/* Dashboard preview */}
      <section className="px-6 pb-20">
        <div className="max-w-2xl mx-auto">
          <DashboardPreview />
        </div>
      </section>

      {/* Problem */}
      <section className="px-6 py-16 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">The problem every landlord knows</h2>
          <p className="text-[#9ca3af] text-lg">Rent is late. You wait. You text. They don't respond. Weeks pass. Now you're two months in and Googling "how to evict a tenant."</p>
        </div>

        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: <AlertTriangle size={18} className="text-red-400" />,
              title: "You find out too late",
              desc: "By the time most landlords act, the tenant is already 30-60 days behind. That's $1,200–$2,400 gone.",
            },
            {
              icon: <MessageSquare size={18} className="text-orange-400" />,
              title: "You don't know what to say",
              desc: "Too soft and they ignore you. Too aggressive and you violate tenant rights. The right message matters.",
            },
            {
              icon: <FileText size={18} className="text-yellow-400" />,
              title: "Legal notices are confusing",
              desc: "Every state has different rules. Wrong notice, wrong timeline — your eviction gets thrown out and you start over.",
            },
          ].map(item => (
            <div key={item.title} className="bg-[#111827] border border-white/[0.08] rounded-2xl p-5">
              <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center mb-4">
                {item.icon}
              </div>
              <div className="text-white font-semibold mb-2">{item.title}</div>
              <div className="text-[#6b7280] text-sm leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-4">Everything you need to get paid</h2>
            <p className="text-[#9ca3af] text-lg">RentSentry handles the escalation so you don't have to guess.</p>
          </div>

          {/* Feature 1 — Risk engine */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-20">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/15 rounded-lg px-3 py-1 text-blue-400 text-xs font-medium mb-4">
                <TrendingUp size={12} /> Risk Engine
              </div>
              <h3 className="text-2xl font-bold mb-3">Know exactly who needs attention today</h3>
              <p className="text-[#9ca3af] leading-relaxed mb-5">
                Every tenant is automatically scored and assigned a tier — from Healthy to Pay or Quit to Eviction.
                You open the dashboard and immediately know who to deal with. No guessing.
              </p>
              <ul className="space-y-2.5">
                {[
                  "7 risk tiers from Healthy to Legal",
                  "Scores update automatically after every CSV upload",
                  "Sorts by urgency — most critical tenants first",
                ].map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-[#d1d5db]">
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <DashboardPreview />
          </div>

          {/* Feature 2 — AI advisor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-20">
            <AIPreview />
            <div>
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/15 rounded-lg px-3 py-1 text-amber-400 text-xs font-medium mb-4">
                <Lightbulb size={12} /> AI Advisor
              </div>
              <h3 className="text-2xl font-bold mb-3">AI that knows your tenant's full history</h3>
              <p className="text-[#9ca3af] leading-relaxed mb-5">
                Tell the AI what the tenant said. It knows their balance, how many months they're behind,
                your state's laws, and every message you've sent. It tells you exactly what to do — and
                drafts the SMS for you to review and send.
              </p>
              <ul className="space-y-2.5">
                {[
                  "Knows balance, days overdue, state law, full history",
                  "Tells you when to escalate vs. negotiate",
                  "Drafts the exact SMS to send — you edit before sending",
                ].map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-[#d1d5db]">
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Feature 3 — Pay or Quit */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-20">
            <div>
              <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/15 rounded-lg px-3 py-1 text-red-400 text-xs font-medium mb-4">
                <FileText size={12} /> Legal Notices
              </div>
              <h3 className="text-2xl font-bold mb-3">State-specific Pay or Quit in one click</h3>
              <p className="text-[#9ca3af] leading-relaxed mb-5">
                All 50 states. The right notice, the right timeline, the right legal citation.
                Enter your name, download the PDF. Most tenants pay within 7 days of receiving it.
              </p>
              <ul className="space-y-2.5">
                {[
                  "All 50 states + DC with correct legal citations",
                  "Auto-fills tenant name, unit, balance, deadline",
                  "Professionally formatted, court-admissible PDF",
                ].map(item => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-[#d1d5db]">
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <PayOrQuitPreview />
          </div>

          {/* Feature 4 — Auto SMS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: <Zap size={16} className="text-blue-400" />,
                title: "Automated SMS",
                desc: "Reminders, warnings, and escalations sent automatically on your schedule.",
                color: "bg-blue-500/10 border-blue-500/15",
              },
              {
                icon: <DollarSign size={16} className="text-emerald-400" />,
                title: "Payment Plans",
                desc: "Offer split-payment deals to tenants who can't pay all at once.",
                color: "bg-emerald-500/10 border-emerald-500/15",
              },
              {
                icon: <MessageSquare size={16} className="text-amber-400" />,
                title: "Cash for Keys",
                desc: "Pre-written offers to exit problem tenants faster than eviction.",
                color: "bg-amber-500/10 border-amber-500/15",
              },
              {
                icon: <Shield size={16} className="text-purple-400" />,
                title: "Auto Mode",
                desc: "Turn on auto mode and let RentSentry handle escalations hands-free.",
                color: "bg-purple-500/10 border-purple-500/15",
              },
            ].map(f => (
              <div key={f.title} className="bg-[#111827] border border-white/[0.08] rounded-2xl p-5">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-4 ${f.color}`}>
                  {f.icon}
                </div>
                <div className="text-white font-semibold text-sm mb-1.5">{f.title}</div>
                <div className="text-[#6b7280] text-xs leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-3">Up and running in 5 minutes</h2>
          <p className="text-[#9ca3af] mb-12">No complicated setup. No integrations required to get started.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                title: "Upload your rent roll",
                desc: "Drop in a CSV with your tenants. Name, unit, rent amount, balance due. That's all you need.",
              },
              {
                step: "2",
                title: "RentSentry scores everyone",
                desc: "Every tenant gets a risk tier instantly. You see exactly who needs attention today.",
              },
              {
                step: "3",
                title: "Take action in one click",
                desc: "Send SMS, download Pay or Quit notices, ask the AI what to do. Everything from one screen.",
              },
            ].map(s => (
              <div key={s.step} className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-400 font-bold text-lg flex items-center justify-center mb-4">
                  {s.step}
                </div>
                <div className="text-white font-semibold mb-2">{s.title}</div>
                <div className="text-[#6b7280] text-sm leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 py-16 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Simple pricing</h2>
            <p className="text-[#9ca3af]">One month of unpaid rent costs more than a year of RentSentry.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { units: "1–5 units", price: "$25", popular: false },
              { units: "6–15 units", price: "$49", popular: true },
              { units: "16–30 units", price: "$79", popular: false },
              { units: "30+ units", price: "$129", popular: false },
            ].map(tier => (
              <div
                key={tier.units}
                className={`rounded-2xl p-5 border relative ${
                  tier.popular
                    ? "bg-blue-500/10 border-blue-500/30"
                    : "bg-[#111827] border-white/[0.08]"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="text-[#6b7280] text-sm mb-2">{tier.units}</div>
                <div className="text-3xl font-bold text-white mb-1">{tier.price}</div>
                <div className="text-[#4b5563] text-xs mb-4">per month</div>
                <Link
                  href="/signup"
                  className={`block text-center text-sm font-semibold py-2 rounded-xl transition-colors ${
                    tier.popular
                      ? "bg-blue-500 hover:bg-blue-600 text-white"
                      : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                  }`}
                >
                  Start Free
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-3">
            {[
              "Free for 3 months",
              "All features included",
              "No credit card required",
              "Cancel anytime",
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-[#6b7280]">
                <CheckCircle2 size={13} className="text-emerald-400" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-20 border-t border-white/[0.06]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">
            Stop losing money to<br />tenants who won't pay.
          </h2>
          <p className="text-[#9ca3af] text-lg mb-8">
            Join landlords who know exactly what to do when rent is late —
            before it becomes an eviction.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold px-10 py-4 rounded-xl text-base transition-colors"
          >
            Get Started Free <ArrowRight size={16} />
          </Link>
          <p className="text-[#4b5563] text-sm mt-4">Free for 3 months. No credit card.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-blue-400" />
            <span className="text-white font-semibold">RentSentry</span>
          </div>
          <div className="flex items-center gap-6 text-[#4b5563] text-sm">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
          </div>
          <div className="text-[#4b5563] text-xs">© 2026 RentSentry. All rights reserved.</div>
        </div>
      </footer>

    </main>
  )
}
