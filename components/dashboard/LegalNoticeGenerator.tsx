"use client"
import { useState } from "react"
import { FileText, ChevronDown, X } from "lucide-react"
import { noticeDays } from "@/lib/state-rules"

interface Props {
  tenantName: string
  unit: string
  propertyName: string | null
  propertyAddress: string | null
  propertyState: string | null
  balanceDue: number
  rentAmount: number
  lateFee: number
  pmDisplayName: string | null
  pmPhone: string | null
}

type NoticeType = "pay_or_quit" | "cure_or_quit" | "non_renewal" | "unconditional_quit"

const NOTICE_OPTIONS: { type: NoticeType; label: string; desc: string; requiresBalance?: boolean }[] = [
  { type: "pay_or_quit",        label: "Pay or Quit",           desc: "Non-payment of rent — tenant must pay or vacate", requiresBalance: true },
  { type: "cure_or_quit",       label: "Cure or Quit",          desc: "Lease violation — tenant must cure or vacate" },
  { type: "unconditional_quit", label: "Unconditional Quit",    desc: "Repeated violations — no cure option offered" },
  { type: "non_renewal",        label: "Non-Renewal of Lease",  desc: "Lease is expiring and will not be renewed" },
]

const DISCLAIMER = `NOTICE TO PROPERTY MANAGER: This notice is prepared with the assistance of RentSentry for informational purposes only and does not constitute legal advice. You are solely responsible for verifying that the notice period, service method, form, and all terms comply with applicable state and local law before serving this notice. Defective notices can result in dismissal of eviction proceedings. Consult a licensed attorney in your jurisdiction before serving.`

function fmt(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

function buildHtml(type: NoticeType, props: Props, violationNote: string): string {
  const { tenantName, unit, propertyName, propertyAddress, propertyState, balanceDue, rentAmount, lateFee, pmDisplayName, pmPhone } = props
  const days = noticeDays(propertyState)
  const today = new Date()
  const deadline = new Date(today)
  deadline.setDate(deadline.getDate() + days)
  const location = propertyAddress ?? propertyName ?? "the above-described premises"
  const stateLabel = propertyState ? ` (${propertyState})` : ""
  const rentOnlyDue = balanceDue

  const baseStyles = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:"Times New Roman",Georgia,serif; font-size:12pt; line-height:1.7; color:#1a1a1a; max-width:680px; margin:60px auto; padding:0 40px; }
h1 { font-size:16pt; font-weight:bold; text-align:center; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:32px; }
.section { margin-bottom:20px; }
.label { font-weight:bold; }
table { width:100%; border-collapse:collapse; margin:16px 0; }
td { padding:6px 8px; border:1px solid #ccc; font-size:11pt; }
td:first-child { font-weight:bold; width:40%; background:#f9f9f9; }
.total td { font-weight:bold; background:#f0f0f0; }
.body-text { margin-bottom:16px; }
.signature { margin-top:48px; }
.sig-line { border-top:1px solid #333; width:260px; margin-top:40px; padding-top:6px; font-size:10pt; color:#555; }
.disclaimer { margin-top:48px; padding-top:16px; border-top:1px solid #ccc; font-size:8pt; color:#666; font-family:Arial,sans-serif; line-height:1.5; }
.print-btn { position:fixed; top:16px; right:16px; background:#1a1a1a; color:white; border:none; padding:8px 18px; border-radius:6px; font-family:Arial,sans-serif; font-size:13px; cursor:pointer; }
@media print { .print-btn { display:none; } body { margin:0; } }`

  const header = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${baseStyles}</style></head><body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>`
  const footer = `<div class="disclaimer">${DISCLAIMER}</div><script>setTimeout(()=>window.print(),500)</script></body></html>`
  const sig = `<div class="signature"><p>Served by:</p>
<div class="sig-line">${pmDisplayName ? `<strong>${pmDisplayName}</strong><br/>` : ""}Property Manager${pmPhone ? `<br/>${pmPhone}` : ""}</div>
<div class="sig-line" style="margin-top:32px;">Date served: ______________________________</div>
<div class="sig-line" style="margin-top:32px;">Method of service: ______________________________</div></div>`

  if (type === "pay_or_quit") {
    return `${header}
<h1>Notice to Pay Rent or Quit</h1>
<div class="section">
  <p class="body-text"><span class="label">Date:</span> ${fmt(today)}</p>
  <p class="body-text"><span class="label">To:</span> ${tenantName}<br/>Unit ${unit}, ${location}${stateLabel}</p>
</div>
<div class="section">
  <p class="body-text">YOU ARE HEREBY NOTIFIED that rent is past due and unpaid. Within <strong>${days} days</strong> of service, you must either pay the rent-only amount below OR vacate the premises.</p>
  <p class="body-text">Failure to comply may result in legal proceedings for possession and other amounts permitted by law.</p>
</div>
<div class="section">
  <p class="label" style="margin-bottom:8px;">Amount Due:</p>
  <table>
    <tr><td>Monthly rent</td><td>$${rentAmount.toLocaleString("en-US",{minimumFractionDigits:2})}</td></tr>
    <tr><td>Rent-only amount claimed due</td><td>$${rentOnlyDue.toLocaleString("en-US",{minimumFractionDigits:2})}</td></tr>
    ${lateFee > 0 ? `<tr><td>Late fees excluded from this notice draft</td><td>$${lateFee.toLocaleString("en-US",{minimumFractionDigits:2})}</td></tr>` : ""}
    <tr class="total"><td>RENT AMOUNT TO CURE</td><td>$${rentOnlyDue.toLocaleString("en-US",{minimumFractionDigits:2})}</td></tr>
  </table>
</div>
<div class="section">
  <p class="body-text"><span class="label">Deadline:</span> ${fmt(deadline)} (${days} days from service${stateLabel})</p>
  <p class="body-text">This draft intentionally excludes late fees from the cure amount. Verify whether your jurisdiction allows any non-rent amounts before serving.</p>
</div>
${sig}${footer}`
  }

  if (type === "cure_or_quit") {
    return `${header}
<h1>Notice to Cure Violation or Quit</h1>
<div class="section">
  <p class="body-text"><span class="label">Date:</span> ${fmt(today)}</p>
  <p class="body-text"><span class="label">To:</span> ${tenantName}<br/>Unit ${unit}, ${location}${stateLabel}</p>
</div>
<div class="section">
  <p class="body-text">YOU ARE HEREBY NOTIFIED that you are in violation of your lease agreement for the following reason:</p>
  <p class="body-text" style="margin-left:24px; font-style:italic;">${violationNote || "[Describe the lease violation here]"}</p>
  <p class="body-text">Within <strong>${days} days</strong> of service, you must either <strong>cure the violation described above</strong> OR <strong>vacate and surrender possession</strong> of the premises.</p>
  <p class="body-text">Failure to cure or vacate within the time stated will result in legal proceedings to recover possession of the premises, as well as all costs and attorney fees permitted by law.</p>
</div>
<div class="section">
  <p class="body-text"><span class="label">Cure deadline:</span> ${fmt(deadline)} (${days} days from service${stateLabel})</p>
</div>
${sig}${footer}`
  }

  if (type === "unconditional_quit") {
    return `${header}
<h1>Unconditional Notice to Quit</h1>
<div class="section">
  <p class="body-text"><span class="label">Date:</span> ${fmt(today)}</p>
  <p class="body-text"><span class="label">To:</span> ${tenantName}<br/>Unit ${unit}, ${location}${stateLabel}</p>
</div>
<div class="section">
  <p class="body-text">YOU ARE HEREBY NOTIFIED that your tenancy at the above-described premises is TERMINATED. You are required to vacate and surrender possession of the premises within <strong>${days} days</strong> of service of this notice.</p>
  <p class="body-text">This notice is issued due to repeated or serious violations of the lease agreement, including but not limited to:</p>
  <p class="body-text" style="margin-left:24px; font-style:italic;">${violationNote || "[Describe the repeated violations here]"}</p>
  <p class="body-text"><strong>No opportunity to cure is offered.</strong> Failure to vacate by the deadline will result in immediate legal proceedings for unlawful detainer, as well as all costs, damages, and attorney fees permitted by law.</p>
</div>
<div class="section">
  <p class="body-text"><span class="label">Vacate by:</span> ${fmt(deadline)} (${days} days from service${stateLabel})</p>
</div>
${sig}${footer}`
  }

  // non_renewal
  const nonRenewalDays = propertyState && ["CA","OR","WA","NJ","NY","MA"].includes(propertyState.toUpperCase()) ? 60 : 30
  const nonRenewalDeadline = new Date(today)
  nonRenewalDeadline.setDate(nonRenewalDeadline.getDate() + nonRenewalDays)
  return `${header}
<h1>Notice of Non-Renewal of Lease</h1>
<div class="section">
  <p class="body-text"><span class="label">Date:</span> ${fmt(today)}</p>
  <p class="body-text"><span class="label">To:</span> ${tenantName}<br/>Unit ${unit}, ${location}${stateLabel}</p>
</div>
<div class="section">
  <p class="body-text">YOU ARE HEREBY NOTIFIED that your lease agreement for the above-referenced premises will <strong>NOT be renewed</strong> upon its expiration.</p>
  <p class="body-text">You are required to vacate and surrender full possession of the premises, along with all keys and access devices, no later than <strong>${fmt(nonRenewalDeadline)}</strong>.</p>
  <p class="body-text">The unit must be left in the same condition as received, normal wear and tear excepted. All personal property must be removed by the vacate date.</p>
  <p class="body-text">Failure to vacate by the date specified may result in legal proceedings for possession, as well as holdover rent, costs, and attorney fees.</p>
</div>
<div class="section">
  <p class="body-text"><span class="label">Vacate by:</span> ${fmt(nonRenewalDeadline)} (${nonRenewalDays} days${stateLabel})</p>
</div>
${sig}${footer}`
}

export default function LegalNoticeGenerator(props: Props) {
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<NoticeType | null>(null)
  const [violation, setViolation] = useState("")

  function generate() {
    if (!selectedType) return
    const html = buildHtml(selectedType, props, violation)
    const win = window.open("", "_blank", "width=820,height=960")
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  const needsViolation = selectedType === "cure_or_quit" || selectedType === "unconditional_quit"

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-orange-400 transition-colors"
      >
        <FileText size={12} />
        Legal Notices
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-[#111827] border border-white/10 rounded-2xl shadow-2xl z-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white text-xs font-semibold">Generate Legal Notice</span>
            <button onClick={() => setOpen(false)} className="text-[#4b5563] hover:text-white transition-colors">
              <X size={13} />
            </button>
          </div>

          <div className="space-y-1.5 mb-3">
            {NOTICE_OPTIONS.map(opt => {
              const disabled = opt.requiresBalance && props.balanceDue <= 0
              return (
                <button
                  key={opt.type}
                  onClick={() => !disabled && setSelectedType(opt.type)}
                  disabled={disabled}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                    selectedType === opt.type
                      ? "bg-blue-500/10 border-blue-500/25 text-blue-300"
                      : disabled
                      ? "border-white/5 text-[#374151] cursor-not-allowed"
                      : "border-white/[0.06] bg-white/[0.02] text-[#9ca3af] hover:text-white hover:bg-white/5"
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-70">{opt.desc}{disabled ? " — no balance due" : ""}</div>
                </button>
              )
            })}
          </div>

          {needsViolation && (
            <div className="mb-3">
              <label className="text-[#4b5563] text-[10px] uppercase tracking-wide block mb-1.5">Describe the violation</label>
              <textarea
                value={violation}
                onChange={e => setViolation(e.target.value)}
                placeholder="e.g. Unauthorized occupant, noise complaints..."
                rows={2}
                className="w-full bg-[#0d1117] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-[#374151] resize-none focus:outline-none focus:border-white/20"
              />
            </div>
          )}

          <button
            onClick={generate}
            disabled={!selectedType || (needsViolation && !violation.trim())}
            className="w-full py-2 rounded-xl text-xs font-semibold text-white bg-orange-500/80 hover:bg-orange-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate & Print
          </button>

          <p className="text-[#2e3a50] text-[10px] mt-2 leading-relaxed">
            Verify state-specific requirements before serving. Consult your attorney.
          </p>
        </div>
      )}
    </div>
  )
}
