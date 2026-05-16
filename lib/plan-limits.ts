export const PLAN_LIMITS: Record<string, number> = {
  starter:   5,
  pro:       20,
  portfolio: 100,
}

export const PLAN_NAMES: Record<string, string> = {
  starter:   "Starter",
  pro:       "Pro",
  portfolio: "Portfolio",
}

export const PLAN_PRICES: Record<string, string> = {
  starter:   "$29/mo",
  pro:       "$59/mo",
  portfolio: "$99/mo",
}

export function planLimitFor(plan: string | null | undefined): number | null {
  if (!plan) return null
  return PLAN_LIMITS[plan] ?? null
}

export function recommendPlan(unitCount: number): "starter" | "pro" | "portfolio" {
  if (unitCount <= 5) return "starter"
  if (unitCount <= 20) return "pro"
  return "portfolio"
}

export function isOnTrial(userCreatedAt: string): boolean {
  const trialEnd = new Date(userCreatedAt).getTime() + 30 * 24 * 60 * 60 * 1000
  return Date.now() < trialEnd
}
