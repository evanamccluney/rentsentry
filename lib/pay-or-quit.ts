// Pay or Quit notice generator — all 50 US states
// Disclaimer: notices are provided as a starting point only.
// Always verify requirements with a local attorney before serving.

export interface PayOrQuitData {
  tenantName: string
  tenantUnit: string
  propertyAddress: string
  propertyCity?: string
  propertyState: string
  amountOwed: number
  landlordName: string
  servedDate: string // YYYY-MM-DD
}

interface StateRule {
  days: number
  title: string
  legalText: string
  serviceNote: string
}

// Days to pay or quit + required language per state
export const STATE_RULES: Record<string, StateRule> = {
  AL: { days: 7,  title: "7-Day Notice to Pay Rent or Quit",         serviceNote: "Deliver personally or post on door and mail by first class mail.",          legalText: "Alabama Code § 35-9A-421" },
  AK: { days: 7,  title: "7-Day Notice to Pay Rent or Vacate",        serviceNote: "Deliver personally, leave with person of suitable age, or post and mail.",   legalText: "Alaska Stat. § 34.03.220" },
  AZ: { days: 5,  title: "5-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or leave with someone of suitable age and discretion.",    legalText: "Ariz. Rev. Stat. § 33-1368" },
  AR: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or post conspicuously on the premises.",                   legalText: "Ark. Code Ann. § 18-17-701" },
  CA: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult on premises, or post and mail.",         legalText: "Cal. Civ. Proc. Code § 1161" },
  CO: { days: 10, title: "10-Day Notice to Pay Rent or Quit",         serviceNote: "Deliver personally or post on door and mail by first class mail.",            legalText: "Colo. Rev. Stat. § 13-40-104" },
  CT: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or leave with adult residing on premises.",                 legalText: "Conn. Gen. Stat. § 47a-23" },
  DE: { days: 5,  title: "5-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by certified mail.",                               legalText: "Del. Code Ann. tit. 25, § 5502" },
  FL: { days: 3,  title: "3-Day Notice to Pay Rent or Vacate",        serviceNote: "Deliver personally, mail by certified mail, or post conspicuously.",          legalText: "Fla. Stat. § 83.56" },
  GA: { days: 3,  title: "3-Day Demand for Payment of Rent",          serviceNote: "Deliver personally or post conspicuously on the premises.",                   legalText: "Ga. Code Ann. § 44-7-50" },
  HI: { days: 5,  title: "5-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by registered or certified mail.",                 legalText: "Haw. Rev. Stat. § 521-68" },
  ID: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Idaho Code § 6-303" },
  IL: { days: 5,  title: "5-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult resident, or post and mail.",            legalText: "735 Ill. Comp. Stat. 5/9-209" },
  IN: { days: 10, title: "10-Day Notice to Pay Rent or Quit",         serviceNote: "Deliver personally or send by certified mail.",                               legalText: "Ind. Code § 32-31-1-6" },
  IA: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Iowa Code § 562A.27" },
  KS: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by certified mail.",                               legalText: "Kan. Stat. Ann. § 58-2564" },
  KY: { days: 7,  title: "7-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Ky. Rev. Stat. Ann. § 383.660" },
  LA: { days: 5,  title: "5-Day Notice to Vacate",                    serviceNote: "Deliver personally or send by certified mail.",                               legalText: "La. Code Civ. Proc. Ann. art. 4701" },
  ME: { days: 7,  title: "7-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by certified mail.",                               legalText: "Me. Rev. Stat. tit. 14, § 6002" },
  MD: { days: 4,  title: "4-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or post conspicuously on the premises.",                   legalText: "Md. Code Ann., Real Prop. § 8-401" },
  MA: { days: 14, title: "14-Day Notice to Pay Rent or Quit",         serviceNote: "Deliver personally or send by certified mail.",                               legalText: "Mass. Gen. Laws ch. 186, § 11" },
  MI: { days: 7,  title: "7-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Mich. Comp. Laws § 600.5714" },
  MN: { days: 14, title: "14-Day Notice to Pay Rent or Quit",         serviceNote: "Deliver personally or send by first class mail.",                             legalText: "Minn. Stat. § 504B.135" },
  MS: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or post conspicuously on the premises.",                   legalText: "Miss. Code Ann. § 89-7-27" },
  MO: { days: 5,  title: "5-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Mo. Rev. Stat. § 535.010" },
  MT: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Mont. Code Ann. § 70-24-422" },
  NE: { days: 7,  title: "7-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Neb. Rev. Stat. § 76-1431" },
  NV: { days: 7,  title: "7-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Nev. Rev. Stat. § 40.253" },
  NH: { days: 7,  title: "7-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by certified mail.",                               legalText: "N.H. Rev. Stat. Ann. § 540:3" },
  NJ: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "N.J. Stat. Ann. § 2A:18-61.2" },
  NM: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "N.M. Stat. Ann. § 47-8-33" },
  NY: { days: 14, title: "14-Day Rent Demand Notice",                  serviceNote: "Deliver personally, leave with adult, or post and mail (nail and mail).",    legalText: "N.Y. Real Prop. Acts. Law § 711" },
  NC: { days: 10, title: "10-Day Notice to Pay Rent or Quit",         serviceNote: "Deliver personally, leave with adult, or post conspicuously.",                legalText: "N.C. Gen. Stat. § 42-3" },
  ND: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by certified mail.",                               legalText: "N.D. Cent. Code § 47-32-01" },
  OH: { days: 3,  title: "3-Day Notice to Pay Rent or Vacate",        serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Ohio Rev. Code Ann. § 1923.04" },
  OK: { days: 5,  title: "5-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Okla. Stat. tit. 41, § 131" },
  OR: { days: 10, title: "10-Day Notice to Pay Rent or Terminate",    serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Or. Rev. Stat. § 90.394" },
  PA: { days: 10, title: "10-Day Notice to Quit for Non-Payment",     serviceNote: "Deliver personally or send by certified mail.",                               legalText: "68 Pa. Cons. Stat. § 250.501" },
  RI: { days: 5,  title: "5-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by certified mail.",                               legalText: "R.I. Gen. Laws § 34-18-35" },
  SC: { days: 5,  title: "5-Day Notice to Pay Rent or Terminate",     serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "S.C. Code Ann. § 27-40-710" },
  SD: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by certified mail.",                               legalText: "S.D. Codified Laws § 21-16-1" },
  TN: { days: 14, title: "14-Day Notice to Pay Rent or Quit",         serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Tenn. Code Ann. § 66-28-505" },
  TX: { days: 3,  title: "3-Day Notice to Vacate",                    serviceNote: "Deliver personally, leave with adult, or post conspicuously and mail.",       legalText: "Tex. Prop. Code § 24.005" },
  UT: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Utah Code Ann. § 78B-6-802" },
  VT: { days: 14, title: "14-Day Notice to Pay Rent or Quit",         serviceNote: "Deliver personally or send by first class mail.",                             legalText: "Vt. Stat. Ann. tit. 9, § 4467" },
  VA: { days: 5,  title: "5-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Va. Code Ann. § 55.1-1245" },
  WA: { days: 14, title: "14-Day Notice to Pay Rent or Vacate",       serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Wash. Rev. Code § 59.12.030" },
  WV: { days: 5,  title: "5-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by certified mail.",                               legalText: "W. Va. Code § 55-3A-1" },
  WI: { days: 5,  title: "5-Day Notice to Pay Rent or Vacate",        serviceNote: "Deliver personally, leave with adult, or post and mail.",                     legalText: "Wis. Stat. § 704.17" },
  WY: { days: 3,  title: "3-Day Notice to Pay Rent or Quit",          serviceNote: "Deliver personally or send by certified mail.",                               legalText: "Wyo. Stat. Ann. § 1-21-1002" },
  DC: { days: 30, title: "30-Day Notice to Pay Rent or Quit",         serviceNote: "Deliver personally or send by certified mail.",                               legalText: "D.C. Code § 42-3206" },
}

export function generatePayOrQuitPDF(data: PayOrQuitData): Promise<void> {
  // Dynamic import to avoid SSR issues
  return import("jspdf").then(({ jsPDF }) => {
    const stateCode = data.propertyState.toUpperCase()
    const rule = STATE_RULES[stateCode]

    if (!rule) {
      alert(`State "${data.propertyState}" not found. Please verify your property state is set correctly.`)
      return
    }

    const doc = new jsPDF({ unit: "pt", format: "letter" })
    const margin = 72
    const pageWidth = 612
    const contentWidth = pageWidth - margin * 2
    let y = margin

    // Helper: add wrapped text and return new Y
    function addText(text: string, fontSize: number, bold = false, color = "#000000", extraSpacing = 0): number {
      doc.setFontSize(fontSize)
      doc.setFont("helvetica", bold ? "bold" : "normal")
      doc.setTextColor(color)
      const lines = doc.splitTextToSize(text, contentWidth)
      doc.text(lines, margin, y)
      y += lines.length * (fontSize * 1.4) + extraSpacing
      return y
    }

    function addLine(): number {
      doc.setDrawColor("#e5e7eb")
      doc.line(margin, y, pageWidth - margin, y)
      y += 16
      return y
    }

    // ── Header ────────────────────────────────────────────────────────────────
    addText("RentSentry", 10, false, "#9ca3af")
    y += 4
    addText(rule.title, 18, true, "#111827", 8)
    addLine()

    // ── Date + parties ────────────────────────────────────────────────────────
    const served = new Date(data.servedDate)
    const formattedDate = served.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    addText(`Date: ${formattedDate}`, 11, false, "#374151", 4)
    addText(`To: ${data.tenantName}`, 11, false, "#374151", 2)
    addText(`Unit: ${data.tenantUnit}`, 11, false, "#374151", 2)
    const locationParts = [data.propertyAddress, data.propertyCity, data.propertyState].filter(Boolean)
    addText(`Property: ${locationParts.join(", ")}`, 11, false, "#374151", 12)
    addLine()

    // ── Body ──────────────────────────────────────────────────────────────────
    const dueDate = new Date(served)
    dueDate.setDate(dueDate.getDate() + rule.days)
    const formattedDue = dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })

    addText(
      `PLEASE TAKE NOTICE that you are hereby required to pay the rent for the above-described premises, of which you currently hold possession, now past due in the amount of $${data.amountOwed.toLocaleString("en-US", { minimumFractionDigits: 2 })}, or to quit and deliver up possession of said premises within ${rule.days} (${rule.days}) days after service of this notice, on or before ${formattedDue}.`,
      11, false, "#111827", 16
    )

    addText(
      `If you fail to pay the amount due or vacate the premises by the date specified above, legal proceedings will be initiated against you to recover possession of the premises, declare the rental agreement forfeited, and recover damages and costs of suit.`,
      11, false, "#374151", 16
    )

    addText(`Statutory Authority: ${rule.legalText}`, 10, false, "#6b7280", 12)
    addLine()

    // ── Service instructions ──────────────────────────────────────────────────
    addText("Service Instructions", 11, true, "#374151", 4)
    addText(rule.serviceNote, 10, false, "#6b7280", 16)
    addLine()

    // ── Landlord signature block ───────────────────────────────────────────────
    addText("Landlord / Property Manager", 11, true, "#374151", 4)
    addText(`Name: ${data.landlordName}`, 11, false, "#374151", 12)
    y += 32
    doc.setDrawColor("#374151")
    doc.line(margin, y, margin + 200, y)
    y += 14
    addText("Signature", 9, false, "#9ca3af", 16)
    addLine()

    // ── Proof of service ──────────────────────────────────────────────────────
    addText("Proof of Service", 11, true, "#374151", 4)
    addText("I, the undersigned, declare that I served this notice on the tenant named above on the following date and in the following manner:", 10, false, "#374151", 8)
    addText("Date Served: ___________________________", 10, false, "#374151", 4)
    addText("Method of Service: ___________________________", 10, false, "#374151", 12)
    y += 32
    doc.line(margin, y, margin + 200, y)
    y += 14
    addText("Signature of Person Serving Notice", 9, false, "#9ca3af", 24)

    // ── Disclaimer ────────────────────────────────────────────────────────────
    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")
    doc.setTextColor("#9ca3af")
    const disclaimer = "DISCLAIMER: This notice is provided by RentSentry as a starting point only and does not constitute legal advice. Requirements vary by jurisdiction and may change. Always verify current requirements with a licensed attorney in your state before serving this notice. Serving an incorrect notice may delay eviction proceedings."
    const dLines = doc.splitTextToSize(disclaimer, contentWidth)
    doc.text(dLines, margin, 750)

    // ── Save ──────────────────────────────────────────────────────────────────
    const safeName = data.tenantName.replace(/\s+/g, "_")
    doc.save(`PayOrQuit_${safeName}_${data.servedDate}.pdf`)
  })
}
