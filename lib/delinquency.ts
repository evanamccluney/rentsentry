function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function mostRecentRentDueDate(rentDueDay = 1, today = new Date()): Date {
  const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay)
  return thisMonth <= today ? thisMonth : new Date(today.getFullYear(), today.getMonth() - 1, dueDay)
}

export function inferDaysPastDueFromRentCycle(rentDueDay = 1, today = new Date()): number {
  const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
  if (today.getDate() < dueDay) return 0

  const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay)
  return Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000))
}

export function inferDelinquencyStartDate(input: {
  balanceDue?: number | null
  rentDueDay?: number | null
  lastPaymentDate?: string | null
  daysPastDue?: number | null
  today?: Date
}): string | null {
  const balanceDue = input.balanceDue ?? 0
  if (balanceDue <= 0) return null

  const today = input.today ?? new Date()

  if (input.daysPastDue && input.daysPastDue > 0) {
    const date = new Date(today)
    date.setDate(date.getDate() - Math.round(input.daysPastDue))
    return toIsoDate(date)
  }

  const dueDate = mostRecentRentDueDate(input.rentDueDay ?? 1, today)

  if (input.lastPaymentDate) {
    const lastPayment = new Date(input.lastPaymentDate + "T00:00:00")
    if (!Number.isNaN(lastPayment.getTime()) && lastPayment > dueDate) {
      return null
    }
  }

  return toIsoDate(dueDate)
}
