import type { RiskResult } from "@/lib/risk-engine"

export interface ActionStep {
  immediateAction: string
  immediateDetail: string
  trigger: { condition: string; days: number; nextAction: string } | null
  warning: string | null
  recoveryOdds: number
  recoveryContext: string
  communicationStatus: "responsive" | "unresponsive" | "unknown"
  autopayDeclineCount: number
  escalationAccelerated: boolean
}

interface Intervention {
  type: string
  sent_at: string
  notes?: string | null
}

const AUTO_TYPES = [
  "proactive_reminder",
  "pre_due_urgent",
  "pre_due_delinquent_warning",
  "pre_due_installment_offer",
  "payment_method_alert",
]

function getLastAutoAction(interventions: Intervention[]): { type: string; daysAgo: number } | null {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const recent = interventions
    .filter(i => AUTO_TYPES.includes(i.type) && new Date(i.sent_at) >= cutoff)
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
  if (recent.length === 0) return null
  const daysAgo = Math.floor((Date.now() - new Date(recent[0].sent_at).getTime()) / (1000 * 60 * 60 * 24))
  return { type: recent[0].type, daysAgo }
}

export function autoActionLabel(type: string): string {
  if (type === "pre_due_installment_offer") return "split-pay offer with payment link"
  if (type === "pre_due_urgent") return "urgent payment reminder"
  if (type === "pre_due_delinquent_warning") return "balance + upcoming rent warning"
  if (type === "payment_method_alert") return "payment method alert"
  return "proactive reminder"
}

function whenStr(daysAgo: number): string {
  if (daysAgo === 0) return "today"
  if (daysAgo === 1) return "yesterday"
  return `${daysAgo} days ago`
}

function getRecentDeclines(interventions: Intervention[]): number {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  return interventions.filter(
    i => i.type === "payment_declined" && new Date(i.sent_at) >= cutoff
  ).length
}

function getCommunicationStatus(interventions: Intervention[]): "responsive" | "unresponsive" | "unknown" {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const recentCalls = interventions.filter(
    i => i.type === "call_logged" && new Date(i.sent_at) >= cutoff
  )
  if (recentCalls.length === 0) return "unknown"
  const hasNoAnswer = recentCalls.some(c => c.notes?.toLowerCase().includes("no answer") || c.notes?.toLowerCase().includes("attempted"))
  const hasCompleted = recentCalls.some(c => c.notes?.toLowerCase().includes("completed"))
  if (hasCompleted) return "responsive"
  if (hasNoAnswer) return "unresponsive"
  return "unknown"
}

export function buildActionPlan(
  risk: RiskResult,
  interventions: Intervention[]
): ActionStep | null {
  if (risk.tier === "healthy") return null

  const commStatus = getCommunicationStatus(interventions)
  const declines = getRecentDeclines(interventions)
  const escalationAccelerated = commStatus === "unresponsive" || declines >= 2

  // Adjust trigger days based on responsiveness — non-responsive tenants get shorter windows
  const urgencyMultiplier = escalationAccelerated ? 0.5 : 1

  switch (risk.tier) {
    case "watch": {
      const lastAuto = getLastAutoAction(interventions)
      if (lastAuto) {
        const label = autoActionLabel(lastAuto.type)
        return {
          immediateAction: "System already reached out — monitoring for response",
          immediateDetail: `A ${label} was automatically sent ${whenStr(lastAuto.daysAgo)}. No action needed from you right now — wait to see if the tenant responds before following up manually.`,
          trigger: null,
          warning: null,
          recoveryOdds: 90,
          recoveryContext: "Proactive outreach before the due date prevents late payments in ~9 out of 10 cases for tenants with this history.",
          communicationStatus: commStatus,
          autopayDeclineCount: declines,
          escalationAccelerated,
        }
      }
      return {
        immediateAction: "Send a proactive reminder before rent is due",
        immediateDetail: "A text or call now prevents a late payment entirely. Chronic late payers respond to early contact — waiting until after the 1st costs you collection time.",
        trigger: null,
        warning: null,
        recoveryOdds: 90,
        recoveryContext: "Proactive outreach before the due date prevents late payments in ~9 out of 10 cases for tenants with this history.",
        communicationStatus: commStatus,
        autopayDeclineCount: declines,
        escalationAccelerated,
      }
    }

    case "reminder": {
      const lastAuto = getLastAutoAction(interventions)
      const autoContext = lastAuto
        ? `System sent a ${autoActionLabel(lastAuto.type)} ${whenStr(lastAuto.daysAgo)} — they still haven't paid. `
        : ""
      return {
        immediateAction: lastAuto
          ? "System already reached out — follow up directly now"
          : risk.tenant_pattern === "sudden_nonpayer"
          ? "Call to check in — this looks like a hardship, not willful non-payment"
          : "Send a friendly reminder text or call",
        immediateDetail: lastAuto
          ? `${autoContext}Since the automated message didn't result in payment, a direct personal follow-up from you carries more weight now.`
          : risk.tenant_pattern === "sudden_nonpayer"
          ? "This tenant paid on time consistently before. A personal check-in resolves most sudden misses — ask what's going on before assuming the worst."
          : "Most first-time late situations resolve with one reminder. Keep the tone light — this is likely an oversight, not a crisis.",
        trigger: {
          condition: "No response or payment",
          days: Math.round(3 * urgencyMultiplier),
          nextAction: "Offer a structured 2-payment split to recover the balance",
        },
        warning: commStatus === "unresponsive"
          ? "This tenant hasn't responded to recent contact — skip the soft approach and move to a payment plan offer now."
          : null,
        recoveryOdds: escalationAccelerated ? 60 : 85,
        recoveryContext: escalationAccelerated
          ? "Non-responsive tenants at this stage recover about 60% of the time — act faster than you normally would."
          : "~85% of first-time late tenants pay within 7 days of a single reminder.",
        communicationStatus: commStatus,
        autopayDeclineCount: declines,
        escalationAccelerated,
      }
    }

    case "payment_plan":
      return {
        immediateAction: "Offer a structured 2–3 installment payment plan",
        immediateDetail: "Send the Stripe payment link now for installment 1. Waiting without a plan reduces recovery odds significantly — tenants with a concrete path to compliance are far more likely to pay.",
        trigger: {
          condition: "They decline or don't respond",
          days: Math.round(5 * urgencyMultiplier),
          nextAction: "Issue a formal Pay or Quit notice to start the legal clock",
        },
        warning: declines >= 1
          ? `${declines} autopay decline${declines > 1 ? "s" : ""} in the last 30 days — this may be financial distress, not a timing issue. A payment plan may not hold.`
          : "Do not accept \"I'll pay soon\" without a specific date and written agreement.",
        recoveryOdds: escalationAccelerated ? 45 : 65,
        recoveryContext: escalationAccelerated
          ? "With autopay failures or no communication, about 45% of payment plans succeed at this stage."
          : "~65% of payment plans initiated before day 15 result in full recovery.",
        communicationStatus: commStatus,
        autopayDeclineCount: declines,
        escalationAccelerated,
      }

    case "pay_or_quit":
      return {
        immediateAction: "Issue a formal Pay or Quit notice today",
        immediateDetail: "This is the legally required first step before eviction in all US states. It starts the clock — most tenants (about 50%) pay within the notice period when it's served formally.",
        trigger: {
          condition: "No full payment after the notice period",
          days: 7,
          nextAction: "File for eviction immediately — every additional week is more unpaid rent",
        },
        warning: "Do NOT accept partial payment after serving this notice. Even a small partial payment voids the notice in most states and forces you to restart the entire process.",
        recoveryOdds: escalationAccelerated ? 30 : 50,
        recoveryContext: escalationAccelerated
          ? "With this tenant's history and communication pattern, about 30% pay after a formal notice — prepare for eviction."
          : "About half of tenants pay in full after receiving a formal Pay or Quit notice.",
        communicationStatus: commStatus,
        autopayDeclineCount: declines,
        escalationAccelerated,
      }

    case "cash_for_keys":
      return {
        immediateAction: "Make a written Cash for Keys offer",
        immediateDetail: "The cost math shows this is likely cheaper than eviction. Offer $500–$1,500 in writing for a voluntary move-out within 14 days. Frame it as helping them avoid an eviction record — that matters to future landlords.",
        trigger: {
          condition: "They decline or don't respond",
          days: 5,
          nextAction: "File for eviction — you've exhausted the voluntary path",
        },
        warning: "Do not hand over any cash until the unit is vacant, keys are returned, and you have a signed move-out agreement. Verbal agreements are unenforceable.",
        recoveryOdds: 70,
        recoveryContext: "About 70% of Cash for Keys offers succeed when made properly in writing — it's faster and cheaper than court for most landlords.",
        communicationStatus: commStatus,
        autopayDeclineCount: declines,
        escalationAccelerated,
      }

    case "legal":
      return {
        immediateAction: "Contact an eviction attorney today",
        immediateDetail: "At this stage, every additional week of waiting costs you one more week of unpaid rent with a low probability of voluntary resolution. The attorney starts the Unlawful Detainer process — your goal is to get the case filed this week.",
        trigger: null,
        warning: "Do NOT accept any payment after filing for eviction — even a partial payment can halt the case and force you to restart. Wait for a formal settlement agreement through the attorney.",
        recoveryOdds: 12,
        recoveryContext: "Fewer than 1 in 8 tenants at this stage self-resolve without legal pressure. The court process is your most reliable path to recovery.",
        communicationStatus: commStatus,
        autopayDeclineCount: declines,
        escalationAccelerated,
      }

    default:
      return null
  }
}
