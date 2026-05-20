// State-specific eviction and notice data
// Eviction weeks: industry averages for uncontested cases
// Notice days: statutory pay-or-quit cure period before filing

export const STATE_EVICTION_WEEKS: Record<string, number> = {
  TX: 6,  AZ: 6,  AL: 5,  AR: 5,  CO: 6,  GA: 6,  FL: 7,  NC: 6,  IN: 6,  TN: 6,
  OH: 7,  MO: 7,  MI: 8,  PA: 8,  VA: 8,  WA: 10, OR: 10, IL: 10, MD: 10, NJ: 12,
  NY: 16, CA: 20, MA: 16, CT: 14, VT: 20,
}

// Statutory days tenant has to pay or quit before landlord can file
export const STATE_NOTICE_DAYS: Record<string, number> = {
  TX: 3,  AZ: 5,  AL: 7,  AR: 3,  CO: 10, GA: 3,  FL: 3,  NC: 10, IN: 10, TN: 14,
  OH: 3,  MO: 3,  MI: 7,  PA: 10, VA: 5,  WA: 14, OR: 10, IL: 5,  MD: 10, NJ: 30,
  NY: 14, CA: 3,  MA: 14, CT: 3,  VT: 14,
}

export function evictionWeeks(state?: string | null): number {
  return state ? (STATE_EVICTION_WEEKS[state.toUpperCase()] ?? 10) : 10
}

export function noticeDays(state?: string | null): number {
  return state ? (STATE_NOTICE_DAYS[state.toUpperCase()] ?? 3) : 3
}
