import { NextResponse } from "next/server"

export const STOP_KEYWORDS  = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"])
export const START_KEYWORDS = new Set(["START", "UNSTOP", "YES"])

export function calcDaysPastDue(lastPaymentDate: string | null, rentDueDay = 1): number {
  if (!lastPaymentDate) return 0
  const last = new Date(lastPaymentDate)
  const now = new Date()
  const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
  let due = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (due > now) due = new Date(now.getFullYear(), now.getMonth() - 1, dueDay)
  return last < due ? Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0
}

export function nextStepLabel(days: number): string {
  if (days >= 30) return "contact your attorney"
  if (days >= 20) return "serve Pay or Quit notice"
  if (days >= 10) return "review CFK vs eviction"
  if (days >= 5)  return "offer a payment plan"
  return "send a reminder"
}

export function twiml(message: string): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  )
}

export function emptyTwiml(): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  )
}

export function parsePaidCodes(body: string, totalCount: number): number[] | "all" | "none" {
  const upper = body.trim().toUpperCase()

  if (upper === "YES" || upper === "Y" || upper === "ALL") return "all"
  if (upper === "NO" || upper === "N" || upper === "NONE") return "none"

  const stripped = upper.replace(/^PAID\s*/i, "").trim()
  const codes = stripped.split(/[\s,]+/).map(Number).filter(n => !isNaN(n) && n >= 1 && n <= totalCount)
  if (codes.length > 0) return codes

  return "none"
}
