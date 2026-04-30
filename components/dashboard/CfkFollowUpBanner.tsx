"use client"
import { AlertTriangle, ExternalLink } from "lucide-react"

const STATE_FILING: Record<string, { court: string; fee: string; timeline: string; url?: string }> = {
  CA: { court: "Superior Court (Limited Jurisdiction)", fee: "$240–$435", timeline: "4–10 weeks uncontested", url: "https://www.courts.ca.gov/selfhelp-eviction.htm" },
  TX: { court: "Justice of the Peace Court", fee: "$46–$100", timeline: "3–6 weeks", url: "https://www.txcourts.gov/programs-services/tenant-landlord/" },
  FL: { court: "County Court", fee: "$185–$400", timeline: "3–5 weeks", url: "https://www.flcourts.gov/Resources-Services/Court-Improvement/Family-Courts/Family-Law-Self-Help-Information/Landlord-Tenant" },
  NY: { court: "Housing Court (NYC) or County Court", fee: "$45–$95", timeline: "6–14 weeks", url: "https://www.nycourts.gov/courts/nyc/housing/" },
  GA: { court: "Magistrate Court", fee: "$60–$100", timeline: "2–4 weeks", url: "https://georgiacourts.gov/courts/magistrate-court/" },
  AZ: { court: "Justice Court", fee: "$35–$80", timeline: "2–4 weeks", url: "https://www.azcourts.gov/selfservicecenter/Landlord-Tenant" },
  NC: { court: "Small Claims / District Court", fee: "$96–$150", timeline: "3–5 weeks", url: "https://www.nccourts.gov/help-topics/housing/evictions" },
  OH: { court: "Municipal or County Court", fee: "$100–$200", timeline: "3–5 weeks" },
  IL: { court: "Circuit Court", fee: "$60–$250", timeline: "4–8 weeks" },
  PA: { court: "Magisterial District Court", fee: "$75–$150", timeline: "3–5 weeks" },
  WA: { court: "District or Superior Court", fee: "$45–$240", timeline: "3–6 weeks" },
  CO: { court: "County Court", fee: "$85–$200", timeline: "3–6 weeks" },
  NV: { court: "Justice Court", fee: "$70–$200", timeline: "2–4 weeks", url: "https://www.clarkcountycourts.us/self-help/" },
  TN: { court: "General Sessions Court", fee: "$50–$120", timeline: "2–4 weeks" },
  VA: { court: "General District Court", fee: "$51–$100", timeline: "2–4 weeks" },
}

const FALLBACK = { court: "Local County or District Court", fee: "$50–$300 (varies by state)", timeline: "3–8 weeks", url: undefined as string | undefined }

interface Props {
  daysSinceCfk: number
  tenantName: string
  state: string | null
}

export default function CfkFollowUpBanner({ daysSinceCfk, tenantName, state }: Props) {
  const filing = (state ? STATE_FILING[state.toUpperCase()] : null) ?? FALLBACK

  return (
    <div className="bg-red-500/5 border border-red-500/25 rounded-2xl p-5 mb-5">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-red-300 font-semibold text-sm">Cash for Keys Ignored — File for Eviction</h2>
          <p className="text-[#9ca3af] text-xs mt-0.5">
            Your offer to {tenantName} went unanswered for {daysSinceCfk} days. The voluntary window is closed — the next step is filing for eviction.
          </p>
        </div>
      </div>

      <div className="bg-[#0d1117] border border-white/5 rounded-xl p-4 mb-4">
        <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">
          {state ? `${state} — Where & How to File` : "How to File (General)"}
        </div>
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-4">
            <span className="text-[#6b7280] text-xs">Court</span>
            <span className="text-white text-xs text-right">{filing.court}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-[#6b7280] text-xs">Filing fee</span>
            <span className="text-white text-xs">{filing.fee}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-[#6b7280] text-xs">Typical timeline</span>
            <span className="text-white text-xs">{filing.timeline}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {[
          "Serve the 3-day Pay or Quit notice if not already done (required before filing in most states)",
          "Bring the signed lease, payment history, and any prior notices to court",
          "After judgment, sheriff enforces if tenant still won't leave",
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-[#9ca3af]">
            <span className="w-4 h-4 rounded-full bg-red-500/15 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">{i + 1}</span>
            {step}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {filing.url && (
          <a
            href={filing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[#60a5fa] hover:text-blue-300 transition-colors"
          >
            <ExternalLink size={12} />
            {state} Court Self-Help
          </a>
        )}
        <p className="text-[#374151] text-xs">
          Consult a local eviction attorney — timelines and forms vary by county.
        </p>
      </div>
    </div>
  )
}
