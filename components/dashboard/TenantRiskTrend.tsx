interface Payment {
  date: string
  amount: number
}

interface Props {
  payments: Payment[]
  rentAmount: number
  rentDueDay: number
}

type RiskLevel = "paid" | "late1" | "late2" | "late3" | "missed" | "unknown"

interface MonthData {
  label: string
  risk: RiskLevel
  daysLate: number | null
  amount: number | null
}

const RISK_COLOR: Record<RiskLevel, string> = {
  paid:    "bg-emerald-500",
  late1:   "bg-yellow-400",
  late2:   "bg-orange-500",
  late3:   "bg-red-500",
  missed:  "bg-red-700",
  unknown: "bg-white/10",
}

const RISK_LABEL: Record<RiskLevel, string> = {
  paid:    "On time",
  late1:   "1–3 days late",
  late2:   "4–7 days late",
  late3:   "8+ days late",
  missed:  "Not paid",
  unknown: "No data",
}

function getMonths(count: number): { year: number; month: number; label: string }[] {
  const now = new Date()
  const months = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleDateString("en-US", { month: "short" }),
    })
  }
  return months
}

export default function TenantRiskTrend({ payments, rentAmount, rentDueDay }: Props) {
  if (payments.length === 0 && rentAmount === 0) return null

  const months = getMonths(6)
  const dueDay = Math.min(Math.max(rentDueDay || 1, 1), 28)

  const data: MonthData[] = months.map(({ year, month, label }) => {
    const dueDate = new Date(year, month, dueDay)
    const nextDueDate = new Date(year, month + 1, dueDay)

    // Find payments made between the due date of this month and the due date of next month
    const monthPayments = payments.filter(p => {
      const pd = new Date(p.date)
      return pd >= dueDate && pd < nextDueDate
    })

    if (monthPayments.length === 0) {
      // Check if this is a future month
      const now = new Date()
      if (dueDate > now) return { label, risk: "unknown", daysLate: null, amount: null }
      if (rentAmount > 0) return { label, risk: "missed", daysLate: null, amount: null }
      return { label, risk: "unknown", daysLate: null, amount: null }
    }

    // Use the earliest payment as the reference
    const earliest = monthPayments.reduce((a, b) => new Date(a.date) < new Date(b.date) ? a : b)
    const payDate = new Date(earliest.date)
    const daysLate = Math.max(0, Math.floor((payDate.getTime() - dueDate.getTime()) / 86400000))
    const totalAmount = monthPayments.reduce((s, p) => s + (p.amount || 0), 0)

    let risk: RiskLevel = "paid"
    if (daysLate >= 8) risk = "late3"
    else if (daysLate >= 4) risk = "late2"
    else if (daysLate >= 1) risk = "late1"

    return { label, risk, daysLate, amount: totalAmount }
  })

  const hasAnyData = data.some(d => d.risk !== "unknown")
  if (!hasAnyData) return null

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-5">
      <h2 className="text-white font-semibold text-sm mb-4">Payment Trend — Last 6 Months</h2>

      <div className="flex items-end gap-2 mb-3">
        {data.map(({ label, risk, daysLate, amount }, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
            <div className="relative w-full flex justify-center">
              {risk !== "unknown" && (
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 whitespace-nowrap bg-[#0d1117] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-[#9ca3af] shadow-xl">
                  {RISK_LABEL[risk]}
                  {daysLate !== null && daysLate > 0 && ` (${daysLate}d late)`}
                  {amount !== null && ` · $${amount.toLocaleString()}`}
                </div>
              )}
            </div>
            <div
              className={`w-full rounded-t-sm transition-all ${RISK_COLOR[risk]}`}
              style={{ height: risk === "unknown" ? "8px" : risk === "paid" ? "36px" : risk === "late1" ? "28px" : risk === "late2" ? "22px" : risk === "late3" ? "16px" : "12px" }}
            />
            <span className="text-[#4b5563] text-[10px]">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
        {[
          { risk: "paid" as RiskLevel,    label: "On time" },
          { risk: "late1" as RiskLevel,   label: "1–3d late" },
          { risk: "late2" as RiskLevel,   label: "4–7d late" },
          { risk: "late3" as RiskLevel,   label: "8d+ late" },
          { risk: "missed" as RiskLevel,  label: "Missed" },
        ].filter(({ risk }) => data.some(d => d.risk === risk)).map(({ risk, label }) => (
          <div key={risk} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-sm ${RISK_COLOR[risk]}`} />
            <span className="text-[#4b5563] text-[10px]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
