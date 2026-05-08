"use client"
import { FileText, AlertTriangle } from "lucide-react"
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

const DISCLAIMER = `NOTICE TO PROPERTY MANAGER: This notice is prepared with the assistance of RentSentry for informational purposes only and does not constitute legal advice. You are solely responsible for verifying that the notice period, service method, form, and all terms comply with applicable state and local law before serving this notice. Defective notices can result in dismissal of eviction proceedings. Consult a licensed attorney in your jurisdiction before serving.`

function buildNoticeHtml(props: Props): string {
  const {
    tenantName, unit, propertyName, propertyAddress, propertyState,
    balanceDue, rentAmount, lateFee, pmDisplayName, pmPhone,
  } = props

  const days = noticeDays(propertyState)
  const today = new Date()
  const deadline = new Date(today)
  deadline.setDate(deadline.getDate() + days)

  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  const location = propertyAddress ?? propertyName ?? "the above-described premises"
  const stateLabel = propertyState ? ` (${propertyState})` : ""
  const totalDue = balanceDue + lateFee

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Pay or Quit Notice — ${tenantName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Georgia, serif;
      font-size: 12pt;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 680px;
      margin: 60px auto;
      padding: 0 40px;
    }
    h1 {
      font-size: 16pt;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 32px;
    }
    .section { margin-bottom: 20px; }
    .label { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td { padding: 6px 8px; border: 1px solid #ccc; font-size: 11pt; }
    td:first-child { font-weight: bold; width: 40%; background: #f9f9f9; }
    .total td { font-weight: bold; background: #f0f0f0; }
    .body-text { margin-bottom: 16px; }
    .signature { margin-top: 48px; }
    .sig-line { border-top: 1px solid #333; width: 260px; margin-top: 40px; padding-top: 6px; font-size: 10pt; color: #555; }
    .disclaimer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #ccc;
      font-size: 8pt;
      color: #666;
      font-family: Arial, sans-serif;
      line-height: 1.5;
    }
    @media print {
      body { margin: 0; }
      .disclaimer { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Notice to Pay Rent or Quit</h1>

  <div class="section">
    <p class="body-text"><span class="label">Date of Notice:</span> ${fmt(today)}</p>
    <p class="body-text"><span class="label">To:</span> ${tenantName}<br/>
    Unit ${unit}, ${location}${stateLabel}</p>
  </div>

  <div class="section">
    <p class="body-text">
      YOU ARE HEREBY NOTIFIED that rent on the above-described premises is past due and unpaid.
      Within <strong>${days} days</strong> of service of this notice, you must either:
    </p>
    <p class="body-text" style="margin-left:24px;">
      (1) Pay the full amount of rent due as set forth below, <strong>OR</strong><br/>
      (2) Vacate and deliver up possession of the premises.
    </p>
    <p class="body-text">
      Failure to pay the full amount or vacate within the time stated will result in legal proceedings to recover possession of the premises, all unpaid rent, applicable fees, court costs, and attorney fees.
    </p>
  </div>

  <div class="section">
    <p class="label" style="margin-bottom:8px;">Amount Due:</p>
    <table>
      <tr><td>Monthly rent</td><td>$${rentAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>
      <tr><td>Outstanding balance</td><td>$${balanceDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>
      ${lateFee > 0 ? `<tr><td>Late fees</td><td>$${lateFee.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>` : ""}
      <tr class="total"><td>TOTAL AMOUNT DUE</td><td>$${totalDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>
    </table>
  </div>

  <div class="section">
    <p class="body-text">
      <span class="label">Pay-or-quit deadline:</span> ${fmt(deadline)} (${days} days from service date${stateLabel})
    </p>
    <p class="body-text">
      Payment must be made in full by the deadline stated above. Partial payments do not cure this notice unless expressly accepted in writing by the property manager.
    </p>
  </div>

  <div class="signature">
    <p>Served by:</p>
    <div class="sig-line">
      ${pmDisplayName ? `<strong>${pmDisplayName}</strong><br/>` : ""}
      Property Manager${pmPhone ? `<br/>${pmPhone}` : ""}
    </div>
    <div class="sig-line" style="margin-top:32px;">
      Date served: ______________________________
    </div>
    <div class="sig-line" style="margin-top:32px;">
      Method of service: ______________________________
    </div>
  </div>

  <div class="disclaimer">${DISCLAIMER}</div>
</body>
</html>`
}

export default function GeneratePayOrQuitNotice(props: Props) {
  function open() {
    const html = buildNoticeHtml(props)
    const win = window.open("", "_blank", "width=820,height=960")
    if (!win) return
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  const hasData = props.balanceDue > 0

  return (
    <button
      onClick={open}
      disabled={!hasData}
      className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-orange-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      title={!hasData ? "No balance due" : "Generate Pay or Quit notice"}
    >
      <AlertTriangle size={12} />
      Generate Pay or Quit
    </button>
  )
}
