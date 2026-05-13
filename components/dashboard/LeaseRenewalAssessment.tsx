"use client"
import { useState } from "react"
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, FileText } from "lucide-react"

interface Props {
  tenantName: string
  unit: string
  leaseEnd: string
  latePaymentCount: number
  daysLateAvg: number
  previousDelinquency: boolean
  currentBalance: number
  rentAmount: number
  pmDisplayName?: string | null
  pmPhone?: string | null
  propertyAddress?: string | null
  propertyState?: string | null
}

type Rec = "renew" | "conditional" | "non-renewal"

function computeRec(latePaymentCount: number, daysLateAvg: number, previousDelinquency: boolean, currentBalance: number, rentAmount: number): Rec {
  if (previousDelinquency || latePaymentCount >= 5) return "non-renewal"
  const monthsOwed = rentAmount > 0 ? currentBalance / rentAmount : 0
  if (monthsOwed >= 1 && latePaymentCount >= 2) return "non-renewal"
  if (latePaymentCount >= 3 || (latePaymentCount >= 2 && daysLateAvg >= 5)) return "conditional"
  return "renew"
}

function buildLetterHtml(type: "renewal" | "non-renewal", props: Props): string {
  const { tenantName, unit, leaseEnd, rentAmount, pmDisplayName, pmPhone, propertyAddress, propertyState } = props
  const today = new Date()
  const endDate = new Date(leaseEnd + "T12:00:00")
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  // Non-renewal: give 30 days or to lease end, whichever is later
  const nonRenewalDeadline = new Date(Math.max(endDate.getTime(), today.getTime() + 30 * 86400000))
  const address = propertyAddress ?? `Unit ${unit}`
  const state = propertyState ?? ""

  if (type === "renewal") {
    const newStart = new Date(endDate.getTime() + 86400000)
    const newEnd = new Date(endDate.getTime() + 366 * 86400000)
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Lease Renewal — ${tenantName}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:"Times New Roman",Georgia,serif; font-size:12pt; line-height:1.7; color:#1a1a1a; max-width:680px; margin:60px auto; padding:0 40px; }
h1 { font-size:16pt; font-weight:bold; text-align:center; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:32px; }
p { margin-bottom:14px; }
.sig-line { border-top:1px solid #333; width:260px; margin-top:48px; padding-top:6px; font-size:10pt; color:#555; }
.disclaimer { margin-top:48px; padding-top:16px; border-top:1px solid #ccc; font-size:8pt; color:#666; font-family:Arial,sans-serif; line-height:1.5; }
.print-btn { position:fixed; top:16px; right:16px; background:#1a1a1a; color:white; border:none; padding:8px 18px; border-radius:6px; font-family:Arial,sans-serif; font-size:13px; cursor:pointer; }
@media print { .print-btn { display:none; } body { margin:0; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
<h1>Lease Renewal Offer</h1>
<p><strong>Date:</strong> ${fmt(today)}</p>
<p><strong>To:</strong> ${tenantName}<br/>${address}${state ? `, ${state}` : ""}</p>
<p>Dear ${tenantName},</p>
<p>We are pleased to offer you a lease renewal for your current residence at the above address. Your current lease is set to expire on <strong>${fmt(endDate)}</strong>.</p>
<p>We would like to offer you a renewed lease term beginning <strong>${fmt(newStart)}</strong> and ending <strong>${fmt(newEnd)}</strong>, at a monthly rent of <strong>$${(rentAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong>.</p>
<p>Please indicate your intention to renew by signing and returning this letter no later than <strong>${fmt(new Date(endDate.getTime() - 30 * 86400000))}</strong>. If we do not hear from you by this date, we will assume you do not wish to renew and will begin the unit turnover process.</p>
<p>We have appreciated having you as a tenant and look forward to continuing our relationship. Please contact us with any questions.</p>
<p>Sincerely,</p>
<div class="sig-line">${pmDisplayName ? `<strong>${pmDisplayName}</strong><br/>` : ""}Property Manager${pmPhone ? `<br/>${pmPhone}` : ""}</div>
<div class="sig-line" style="margin-top:32px;">Tenant signature: ______________________________</div>
<div class="sig-line" style="margin-top:32px;">Date: ______________________________</div>
<div class="disclaimer">This letter is generated with the assistance of RentSentry. Landlords are solely responsible for compliance with applicable local law regarding lease renewal notice requirements and rent increase limits.</div>
<script>setTimeout(()=>window.print(),500)</script>
</body></html>`
  }

  // Non-renewal
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Non-Renewal Notice — ${tenantName}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:"Times New Roman",Georgia,serif; font-size:12pt; line-height:1.7; color:#1a1a1a; max-width:680px; margin:60px auto; padding:0 40px; }
h1 { font-size:16pt; font-weight:bold; text-align:center; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:32px; }
p { margin-bottom:14px; }
.sig-line { border-top:1px solid #333; width:260px; margin-top:48px; padding-top:6px; font-size:10pt; color:#555; }
.disclaimer { margin-top:48px; padding-top:16px; border-top:1px solid #ccc; font-size:8pt; color:#666; font-family:Arial,sans-serif; line-height:1.5; }
.print-btn { position:fixed; top:16px; right:16px; background:#1a1a1a; color:white; border:none; padding:8px 18px; border-radius:6px; font-family:Arial,sans-serif; font-size:13px; cursor:pointer; }
@media print { .print-btn { display:none; } body { margin:0; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
<h1>Notice of Non-Renewal of Lease</h1>
<p><strong>Date:</strong> ${fmt(today)}</p>
<p><strong>To:</strong> ${tenantName}<br/>${address}${state ? `, ${state}` : ""}</p>
<p>Dear ${tenantName},</p>
<p>Please be advised that your lease agreement for the above-referenced property, which is currently scheduled to expire on <strong>${fmt(endDate)}</strong>, will <strong>NOT be renewed</strong>.</p>
<p>You are hereby notified that you must vacate the premises and surrender possession no later than <strong>${fmt(nonRenewalDeadline)}</strong>. All personal property must be removed and the unit left in the same condition as it was at move-in, normal wear and tear excepted.</p>
<p>Should you fail to vacate by the date stated above, legal proceedings may be initiated to recover possession of the premises, as well as any costs and attorney fees permitted by law.</p>
<p>Please arrange a move-out inspection with the property manager at least 5 days before your vacate date. Contact us to schedule.</p>
<p>Sincerely,</p>
<div class="sig-line">${pmDisplayName ? `<strong>${pmDisplayName}</strong><br/>` : ""}Property Manager${pmPhone ? `<br/>${pmPhone}` : ""}</div>
<div class="sig-line" style="margin-top:32px;">Date served: ______________________________</div>
<div class="sig-line" style="margin-top:32px;">Method of service: ______________________________</div>
<div class="disclaimer">NOTICE TO PROPERTY MANAGER: This notice is prepared with the assistance of RentSentry for informational purposes only and does not constitute legal advice. You are solely responsible for verifying that the notice period, form, and delivery method comply with applicable state and local law. Consult a licensed attorney before serving. In some jurisdictions, specific non-renewal notice forms or periods are required.</div>
<script>setTimeout(()=>window.print(),500)</script>
</body></html>`
}

const REC_CONFIG = {
  renew: {
    icon: <CheckCircle2 size={16} className="text-emerald-400" />,
    label: "Recommend Renewal",
    color: "bg-emerald-500/8 border-emerald-500/20",
    textColor: "text-emerald-400",
    description: "Good payment history — renewal is low risk.",
  },
  conditional: {
    icon: <AlertTriangle size={16} className="text-amber-400" />,
    label: "Conditional Renewal",
    color: "bg-amber-500/8 border-amber-500/20",
    textColor: "text-amber-400",
    description: "Consider requiring autopay enrollment or a larger deposit.",
  },
  "non-renewal": {
    icon: <XCircle size={16} className="text-red-400" />,
    label: "Consider Non-Renewal",
    color: "bg-red-500/8 border-red-500/20",
    textColor: "text-red-400",
    description: "Payment history suggests high re-offense risk.",
  },
}

export default function LeaseRenewalAssessment(props: Props) {
  const { leaseEnd, latePaymentCount, daysLateAvg, previousDelinquency, currentBalance, rentAmount } = props
  const [open, setOpen] = useState(false)

  const daysLeft = Math.ceil((new Date(leaseEnd + "T12:00:00").getTime() - Date.now()) / 86400000)
  const rec = computeRec(latePaymentCount, daysLateAvg, previousDelinquency, currentBalance, rentAmount)
  const cfg = REC_CONFIG[rec]

  function openLetter(type: "renewal" | "non-renewal") {
    const html = buildLetterHtml(type, props)
    const win = window.open("", "_blank", "width=820,height=960")
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  return (
    <div className={`border rounded-2xl p-5 mb-5 ${cfg.color}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {cfg.icon}
          <div>
            <div className={`text-sm font-semibold ${cfg.textColor}`}>{cfg.label}</div>
            <div className="text-[#9ca3af] text-xs mt-0.5">{cfg.description}</div>
          </div>
        </div>
        <div className={`text-xs font-semibold px-2 py-1 rounded-lg border shrink-0 ${cfg.color} ${cfg.textColor}`}>
          {daysLeft > 0 ? `${daysLeft}d left` : "Expired"}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: "Late payments", value: String(latePaymentCount || 0), flag: latePaymentCount >= 3 },
          { label: "Avg days late", value: `${daysLateAvg || 0}d`, flag: daysLateAvg >= 5 },
          { label: "Prior delinquency", value: previousDelinquency ? "Yes" : "No", flag: previousDelinquency },
        ].map(({ label, value, flag }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">{label}</div>
            <div className={`text-sm font-bold ${flag ? "text-red-400" : "text-white"}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 text-[#9ca3af] hover:text-white hover:bg-white/10 transition-colors"
        >
          <FileText size={12} />
          Generate Letter
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap gap-2 pl-1">
          <button
            onClick={() => openLetter("renewal")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <RefreshCw size={11} />
            Renewal offer letter
          </button>
          <button
            onClick={() => openLetter("non-renewal")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <XCircle size={11} />
            Non-renewal notice
          </button>
        </div>
      )}
    </div>
  )
}
