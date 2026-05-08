// Real eviction economics based on industry research:
// Sources: Eviction Lab, NAA, BiggerPockets, iPropertyManagement, Snappt, LegalMatch

export type StateData = {
  weeks: number              // weeks from filing to writ of possession (uncontested)
  courtFee: number           // filing + service of process fees
  attorneyFee: number        // typical flat fee for uncontested case
  lockoutFee: number         // sheriff / marshal execution fee
  contestedRisk: number      // 0–1 probability tenant contests (tenant-friendly states higher)
  contestedWeeksMultiplier: number // how much longer if contested (avg 2.5x in CA/NY)
}

// Default for states not explicitly listed
const DEFAULT: StateData = {
  weeks: 8, courtFee: 150, attorneyFee: 900, lockoutFee: 125,
  contestedRisk: 0.30, contestedWeeksMultiplier: 2.0,
}

export const STATE_ECONOMICS: Record<string, StateData> = {
  // Fast / landlord-friendly states
  TX: { weeks: 4,  courtFee: 100, attorneyFee:  600, lockoutFee: 100, contestedRisk: 0.18, contestedWeeksMultiplier: 2.0 },
  AZ: { weeks: 5,  courtFee: 150, attorneyFee:  700, lockoutFee: 100, contestedRisk: 0.20, contestedWeeksMultiplier: 2.0 },
  AL: { weeks: 4,  courtFee: 275, attorneyFee:  600, lockoutFee: 100, contestedRisk: 0.18, contestedWeeksMultiplier: 1.8 },
  AR: { weeks: 4,  courtFee: 100, attorneyFee:  600, lockoutFee: 100, contestedRisk: 0.18, contestedWeeksMultiplier: 1.8 },
  GA: { weeks: 5,  courtFee: 175, attorneyFee:  700, lockoutFee: 100, contestedRisk: 0.20, contestedWeeksMultiplier: 2.0 },
  IN: { weeks: 5,  courtFee: 150, attorneyFee:  700, lockoutFee: 100, contestedRisk: 0.20, contestedWeeksMultiplier: 1.8 },
  TN: { weeks: 5,  courtFee: 150, attorneyFee:  650, lockoutFee: 100, contestedRisk: 0.18, contestedWeeksMultiplier: 1.8 },
  NC: { weeks: 5,  courtFee: 150, attorneyFee:  700, lockoutFee: 100, contestedRisk: 0.20, contestedWeeksMultiplier: 2.0 },
  // Moderate states
  CO: { weeks: 6,  courtFee: 150, attorneyFee:  800, lockoutFee: 125, contestedRisk: 0.28, contestedWeeksMultiplier: 2.2 },
  FL: { weeks: 6,  courtFee: 200, attorneyFee:  900, lockoutFee: 150, contestedRisk: 0.25, contestedWeeksMultiplier: 2.2 },
  OH: { weeks: 7,  courtFee: 150, attorneyFee:  800, lockoutFee: 125, contestedRisk: 0.25, contestedWeeksMultiplier: 2.0 },
  MO: { weeks: 7,  courtFee: 150, attorneyFee:  800, lockoutFee: 125, contestedRisk: 0.25, contestedWeeksMultiplier: 2.0 },
  MI: { weeks: 8,  courtFee: 175, attorneyFee:  900, lockoutFee: 125, contestedRisk: 0.28, contestedWeeksMultiplier: 2.2 },
  PA: { weeks: 8,  courtFee: 200, attorneyFee: 1000, lockoutFee: 150, contestedRisk: 0.30, contestedWeeksMultiplier: 2.5 },
  VA: { weeks: 8,  courtFee: 175, attorneyFee: 1000, lockoutFee: 125, contestedRisk: 0.28, contestedWeeksMultiplier: 2.2 },
  // Slow / tenant-friendly states
  WA: { weeks: 10, courtFee: 200, attorneyFee: 1200, lockoutFee: 150, contestedRisk: 0.40, contestedWeeksMultiplier: 2.5 },
  OR: { weeks: 10, courtFee: 200, attorneyFee: 1200, lockoutFee: 150, contestedRisk: 0.45, contestedWeeksMultiplier: 2.5 },
  IL: { weeks: 10, courtFee: 250, attorneyFee: 1500, lockoutFee: 150, contestedRisk: 0.40, contestedWeeksMultiplier: 2.5 },
  MD: { weeks: 10, courtFee: 200, attorneyFee: 1200, lockoutFee: 150, contestedRisk: 0.38, contestedWeeksMultiplier: 2.5 },
  NJ: { weeks: 12, courtFee: 250, attorneyFee: 1800, lockoutFee: 175, contestedRisk: 0.50, contestedWeeksMultiplier: 3.0 },
  CT: { weeks: 14, courtFee: 250, attorneyFee: 1800, lockoutFee: 150, contestedRisk: 0.48, contestedWeeksMultiplier: 2.8 },
  MA: { weeks: 16, courtFee: 300, attorneyFee: 2000, lockoutFee: 175, contestedRisk: 0.55, contestedWeeksMultiplier: 3.0 },
  NY: { weeks: 16, courtFee: 215, attorneyFee: 2000, lockoutFee: 175, contestedRisk: 0.55, contestedWeeksMultiplier: 3.5 },
  VT: { weeks: 20, courtFee: 200, attorneyFee: 2000, lockoutFee: 175, contestedRisk: 0.55, contestedWeeksMultiplier: 3.0 },
  CA: { weeks: 20, courtFee: 400, attorneyFee: 2500, lockoutFee: 200, contestedRisk: 0.65, contestedWeeksMultiplier: 3.5 },
}

export function getStateData(state?: string | null): StateData {
  return state ? (STATE_ECONOMICS[state.toUpperCase()] ?? DEFAULT) : DEFAULT
}

export type EvictionScenario = {
  label: string
  courtFee: number
  attorneyFee: number
  lockoutFee: number
  lostRentWeeks: number
  lostRent: number
  turnoverWeeks: number
  turnoverCost: number
  damagePremium: number  // expected value of excess damage (probability × avg damage cost)
  total: number
  weeksTotal: number
  low: number
  high: number
}

export type CFKScenario = {
  offerAmount: number
  vacateWeeks: number     // time tenant takes to vacate after accepting
  vacateRentLoss: number
  turnoverWeeks: number
  turnoverCost: number
  total: number
  weeksTotal: number
  low: number
  high: number
}

export type CostEstimateSource = {
  label: string
  basis: "ledger" | "calendar-proration" | "local-average" | "industry-range" | "model-assumption"
  note: string
}

export type EconomicsResult = {
  uncontested: EvictionScenario
  contested: EvictionScenario
  cfk: CFKScenario
  blendedEviction: number  // uncontested + (contested - uncontested) × contestedRisk
  cfkSavings: number       // blendedEviction - cfk.total
  recommendation: "cfk" | "ud"
  recommendationStrength: "strong" | "moderate" | "close"
  reasoning: string[]
  breakEvenOffer: number   // max CFK offer where CFK is still cheaper than blended eviction
  blendedEvictionRange: { low: number; high: number }
  cfkSavingsRange: { low: number; high: number }
  estimateConfidence: "low" | "medium"
  assumptions: string[]
  sources: CostEstimateSource[]
}

function range(value: number, lowFactor: number, highFactor: number) {
  return {
    low: Math.max(0, Math.round(value * lowFactor)),
    high: Math.max(0, Math.round(value * highFactor)),
  }
}

export function calculateEconomics(params: {
  rentAmount: number
  monthsOwed: number
  previousDelinquency: boolean
  latePaymentCount: number
  state?: string | null
}): EconomicsResult {
  const { rentAmount, monthsOwed, previousDelinquency, latePaymentCount, state } = params
  const d = getStateData(state)
  const weeklyRent = rentAmount / 4.33

  // ── Uncontested eviction ──────────────────────────────────────────────────────
  // Turnover after eviction is worse than normal: evicted tenants leave less clean,
  // sometimes leave belongings, and the PM often needs deeper repairs.
  // Industry average: 5.5 weeks from vacancy to re-tenanted (vs 4 for voluntary)
  const evictionTurnoverWeeks = 5.5
  const evictionTurnoverCost = Math.round(weeklyRent * evictionTurnoverWeeks)

  // Property damage premium: NAA data shows post-eviction damage averages $2,500–$5,000
  // above normal wear and tear. At ~30% probability for a moderate-risk tenant, expected
  // value ≈ $900. Higher for repeat offenders.
  const baseDamageProbability = previousDelinquency ? 0.50 : 0.30
  const avgExcessDamage = 3200 // mid-point of $2,500–$4,000 industry range
  const damagePremium = Math.round(baseDamageProbability * avgExcessDamage)

  const uncontestedLostRent = Math.round(d.weeks * weeklyRent)
  const uncontestedTotal = d.courtFee + d.attorneyFee + d.lockoutFee
    + uncontestedLostRent + evictionTurnoverCost + damagePremium
  const uncontestedRange = range(uncontestedTotal, 0.78, 1.35)

  const uncontested: EvictionScenario = {
    label: "Eviction (uncontested)",
    courtFee: d.courtFee,
    attorneyFee: d.attorneyFee,
    lockoutFee: d.lockoutFee,
    lostRentWeeks: d.weeks,
    lostRent: uncontestedLostRent,
    turnoverWeeks: evictionTurnoverWeeks,
    turnoverCost: evictionTurnoverCost,
    damagePremium,
    total: uncontestedTotal,
    weeksTotal: d.weeks + evictionTurnoverWeeks,
    ...uncontestedRange,
  }

  // ── Contested eviction ────────────────────────────────────────────────────────
  // Contested cases: 3–4× attorney fees, longer timeline, higher damage
  const contestedWeeks = Math.round(d.weeks * d.contestedWeeksMultiplier)
  const contestedAttorney = Math.round(d.attorneyFee * 3.2)  // avg 3.2× for contested
  const contestedLostRent = Math.round(contestedWeeks * weeklyRent)
  const contestedDamagePremium = Math.round(damagePremium * 1.6)  // more hostile departure
  const contestedTotal = d.courtFee + contestedAttorney + d.lockoutFee
    + contestedLostRent + evictionTurnoverCost + contestedDamagePremium
  const contestedRange = range(contestedTotal, 0.80, 1.45)

  const contested: EvictionScenario = {
    label: "Eviction (contested)",
    courtFee: d.courtFee,
    attorneyFee: contestedAttorney,
    lockoutFee: d.lockoutFee,
    lostRentWeeks: contestedWeeks,
    lostRent: contestedLostRent,
    turnoverWeeks: evictionTurnoverWeeks,
    turnoverCost: evictionTurnoverCost,
    damagePremium: contestedDamagePremium,
    total: contestedTotal,
    weeksTotal: contestedWeeks + evictionTurnoverWeeks,
    ...contestedRange,
  }

  // ── Blended eviction cost (probability-weighted) ──────────────────────────────
  const blendedEviction = Math.round(
    uncontestedTotal + (contestedTotal - uncontestedTotal) * d.contestedRisk
  )
  const blendedEvictionRange = {
    low: Math.round(uncontested.low + (contested.low - uncontested.low) * d.contestedRisk),
    high: Math.round(uncontested.high + (contested.high - uncontested.high) * d.contestedRisk),
  }

  // ── Cash for Keys ─────────────────────────────────────────────────────────────
  // Industry standard offer: 1.0–1.5× monthly rent
  // Tenant has 2–3 weeks to vacate; standard turnover (no damage premium) 4 weeks
  const cfkOffer = Math.round(rentAmount * 1.0)  // base 1 month offer
  const cfkVacateWeeks = 2.5
  const cfkVacateRentLoss = Math.round(cfkVacateWeeks * weeklyRent)
  const cfkTurnoverWeeks = 4.0
  const cfkTurnoverCost = Math.round(weeklyRent * cfkTurnoverWeeks)
  const cfkTotal = cfkOffer + cfkVacateRentLoss + cfkTurnoverCost
  const cfkRange = {
    low: Math.round((rentAmount * 0.5) + cfkVacateRentLoss + Math.round(cfkTurnoverCost * 0.75)),
    high: Math.round((rentAmount * 2.0) + Math.round(cfkVacateRentLoss * 1.5) + Math.round(cfkTurnoverCost * 1.4)),
  }

  const cfk: CFKScenario = {
    offerAmount: cfkOffer,
    vacateWeeks: cfkVacateWeeks,
    vacateRentLoss: cfkVacateRentLoss,
    turnoverWeeks: cfkTurnoverWeeks,
    turnoverCost: cfkTurnoverCost,
    total: cfkTotal,
    weeksTotal: cfkVacateWeeks + cfkTurnoverWeeks,
    ...cfkRange,
  }

  const cfkSavings = blendedEviction - cfkTotal
  const cfkSavingsRange = {
    low: blendedEvictionRange.low - cfk.high,
    high: blendedEvictionRange.high - cfk.low,
  }
  const breakEvenOffer = Math.round(blendedEviction - cfkVacateRentLoss - cfkTurnoverCost)

  // ── Recommendation logic ──────────────────────────────────────────────────────
  const reasoning: string[] = []
  let recommendation: "cfk" | "ud" = "cfk"
  let recommendationStrength: "strong" | "moderate" | "close" = "strong"

  // Factor 1: Raw dollar difference
  const savingsPct = cfkSavings / blendedEviction

  // Factor 2: Repeat offender — cash for keys may not stick
  if (previousDelinquency && latePaymentCount >= 5) {
    recommendation = "ud"
    reasoning.push(`Chronic payment history (${latePaymentCount} late payments + prior delinquency) — repeat offenders are less likely to honor CFK agreements`)
  }

  // Factor 3: 3+ months owed with prior delinquency
  if (monthsOwed >= 3 && previousDelinquency) {
    recommendation = "ud"
    reasoning.push(`${Math.round(monthsOwed * 10) / 10} months overdue with prior delinquency — pattern suggests this tenant will not self-correct`)
  }

  // Factor 4: If CFK still clearly cheaper even accounting for repeat risk
  if (recommendation === "ud" && cfkSavings > rentAmount * 2) {
    // Even for repeat offenders, CFK might be worth it in very slow states
    reasoning.push(`However, expected eviction cost is $${cfkSavings.toLocaleString()} more than CFK — consider a structured CFK with written release`)
    recommendation = "cfk"
    recommendationStrength = "moderate"
  } else if (recommendation === "ud") {
    recommendationStrength = "strong"
  }

  // Factor 5: Dollar savings narrative (always add)
  if (recommendation === "cfk") {
    if (savingsPct >= 0.4) {
      reasoning.push(`CFK modeled midpoint saves $${cfkSavings.toLocaleString()} (${Math.round(savingsPct * 100)}% less than eviction)`)
      recommendationStrength = "strong"
    } else if (savingsPct >= 0.2) {
      reasoning.push(`CFK modeled midpoint saves $${cfkSavings.toLocaleString()} — meaningful but not overwhelming`)
      recommendationStrength = "moderate"
    } else {
      reasoning.push(`CFK modeled midpoint saves roughly $${cfkSavings.toLocaleString()} — the difference is closer than usual`)
      recommendationStrength = "close"
    }
  }

  // Factor 6: State speed
  if (d.weeks <= 5) {
    if (recommendation === "cfk") {
      reasoning.push(`${state} has a fast eviction timeline (~${d.weeks} weeks) — court is a viable option here, but CFK still avoids damage risk and attorney fees`)
      recommendationStrength = recommendationStrength === "strong" ? "moderate" : recommendationStrength
    } else {
      reasoning.push(`${state} eviction timeline is only ~${d.weeks} weeks — fast state supports the UD recommendation`)
    }
  } else if (d.weeks >= 12) {
    reasoning.push(`${state} evictions average ~${d.weeks} weeks in court — slow timeline is a major cost driver`)
  }

  // Factor 7: Contested risk
  if (d.contestedRisk >= 0.40) {
    reasoning.push(`${Math.round(d.contestedRisk * 100)}% chance tenant contests in ${state} — contested case adds ~$${(contestedTotal - uncontestedTotal).toLocaleString()} in expected costs`)
  }

  // Factor 8: Damage
  reasoning.push(`Post-eviction damage is modeled at $${damagePremium.toLocaleString()} expected value; replace this with local move-out history when available`)

  // Factor 9: No prior delinquency
  if (!previousDelinquency && recommendation === "cfk") {
    reasoning.push(`No prior delinquency — first-time situation, tenant more likely to cooperate with CFK`)
  }

  if (cfkSavingsRange.low <= 0 && cfkSavingsRange.high > 0) {
    recommendationStrength = "close"
    reasoning.push("Modeled savings range crosses zero — verify local court fees, attorney fees, lockout fees, and timeline before relying on the midpoint")
  }

  return {
    uncontested,
    contested,
    cfk,
    blendedEviction,
    cfkSavings,
    recommendation,
    recommendationStrength,
    reasoning,
    breakEvenOffer,
    blendedEvictionRange,
    cfkSavingsRange,
    estimateConfidence: state ? "medium" : "low",
    assumptions: [
      "Current balance and monthly rent come from the tenant ledger/import.",
      "Rent loss is prorated from monthly rent; it is not a separate fee.",
      "Court fees, attorney fees, lockout fees, timelines, contested risk, turnover, and damage are model assumptions unless configured from local records.",
      "Court fees can vary by county and may change by statute or clerk schedule.",
      "Cash-for-Keys is voluntary and should be reviewed against state/local rules before use.",
    ],
    sources: [
      {
        label: "Tenant ledger/import",
        basis: "ledger",
        note: "Balance due and monthly rent are exact only to the quality and date of the imported ledger.",
      },
      {
        label: "Calendar rent proration",
        basis: "calendar-proration",
        note: "Daily rent exposure divides monthly rent by the number of days in each calendar month.",
      },
      {
        label: "Local court and attorney assumptions",
        basis: "local-average",
        note: "Replace defaults with county clerk fee schedules and attorney quotes for decision-grade local accuracy.",
      },
      {
        label: "Cash-for-Keys assumption",
        basis: "industry-range",
        note: "Offer range modeled at 0.5x-2.0x monthly rent; actual enforceability and amount are local/legal questions.",
      },
    ],
  }
}
