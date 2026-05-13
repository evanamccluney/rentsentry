"use client"
import { ExternalLink, FileText, CheckCircle2, Circle, Package } from "lucide-react"

interface Props {
  tenantId: string
  tenantName: string
  tier: string
  balanceDue: number
  daysPastDue: number
  hasInterventions: boolean
  hasPayments: boolean
  hasLegalNotice: boolean
}

export default function CollectionsHandoff({
  tenantId, tenantName, tier, balanceDue, daysPastDue,
  hasInterventions, hasPayments, hasLegalNotice,
}: Props) {
  if (!["legal", "pay_or_quit"].includes(tier)) return null
  if (balanceDue <= 0) return null

  const readyItems = [
    { label: "Communication history",  done: hasInterventions },
    { label: "Payment history",        done: hasPayments },
    { label: "Legal notice on file",   done: hasLegalNotice },
  ]
  const readyCount = readyItems.filter(i => i.done).length
  const isReady = readyCount >= 2

  return (
    <div className="bg-[#111827] border border-red-500/20 rounded-2xl p-5 mb-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
          <Package size={14} className="text-red-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Case Escalation Pathway</h3>
          <p className="text-[#6b7280] text-xs mt-0.5">
            {daysPastDue}d past due · ${balanceDue.toLocaleString()} owed · {isReady ? "Case file is ready to share" : "Prepare your case file before escalating"}
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {readyItems.map(({ label, done }) => (
          <div key={label} className="flex items-center gap-2.5">
            {done
              ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
              : <Circle size={14} className="text-[#374151] shrink-0" />}
            <span className={`text-xs ${done ? "text-[#9ca3af]" : "text-[#4b5563]"}`}>{label}</span>
            {!done && <span className="text-[10px] text-[#374151] ml-auto">Incomplete</span>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <a
          href={`/api/tenants/${tenantId}/court-report`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-[#9ca3af] hover:text-white hover:bg-white/10 transition-colors"
        >
          <FileText size={13} />
          Export Case File for Attorney
          <ExternalLink size={11} className="ml-auto" />
        </a>

        <div className="flex flex-col gap-1.5">
          <div className="px-3 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">Next steps</div>
            <ul className="space-y-1">
              {tier === "legal" ? [
                "Share case file with eviction attorney",
                "File Unlawful Detainer if no response",
                "Consider Cash for Keys as alternative",
              ] : [
                "Serve Pay or Quit notice (generate above)",
                "Document service method + date",
                "Escalate to attorney if no cure by deadline",
              ].map((step, i) => (
                <li key={i} className="text-[#6b7280] text-[10px] flex items-start gap-1.5">
                  <span className="mt-1 w-1 h-1 rounded-full bg-[#374151] shrink-0" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p className="text-[#2e3a50] text-[10px] mt-3 leading-relaxed">
        RentSentry never auto-files evictions. All legal actions require your review and an attorney sign-off. Every document generated is yours to share directly with counsel.
      </p>
    </div>
  )
}
