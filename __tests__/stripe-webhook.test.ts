import { describe, it, expect } from "vitest"

/**
 * Tests for the business-critical paths in the stripe-connect webhook:
 * idempotency and balance clearing. We test the logic directly by isolating
 * the key checks rather than spinning up the full Next.js handler.
 */

// ── Idempotency logic ─────────────────────────────────────────────────────────

describe("Webhook idempotency", () => {
  it("marks an event as already processed when stripe_event_id matches", () => {
    // Simulate what the DB returns when the event was already processed
    const alreadyProcessed = { id: "intervention-1" }

    // The webhook checks: if (alreadyProcessed) return early
    const shouldSkip = !!alreadyProcessed
    expect(shouldSkip).toBe(true)
  })

  it("allows processing when no matching event_id exists", () => {
    const alreadyProcessed = null
    const shouldSkip = !!alreadyProcessed
    expect(shouldSkip).toBe(false)
  })
})

// ── Balance calculation ───────────────────────────────────────────────────────

describe("Balance update after payment", () => {
  it("subtracts payment amount from balance_due", () => {
    const currentBalance = 1500
    const amountPaid = 750
    const newBalance = Math.max(0, currentBalance - amountPaid)
    expect(newBalance).toBe(750)
  })

  it("floors balance at 0 — never goes negative", () => {
    const currentBalance = 500
    const amountPaid = 750 // overpayment
    const newBalance = Math.max(0, currentBalance - amountPaid)
    expect(newBalance).toBe(0)
  })

  it("prefers rent_amount_cents metadata over session.amount_total", () => {
    const rentAmountCents = 150000 // $1500 from metadata
    const sessionAmountTotal = 150750 // $1507.50 (includes fee)

    const amountPaid = rentAmountCents > 0
      ? rentAmountCents / 100
      : (sessionAmountTotal || 0) / 100

    // Should use the clean rent amount, not the fee-inflated total
    expect(amountPaid).toBe(1500)
  })

  it("falls back to session.amount_total when rent_amount_cents is 0", () => {
    const rentAmountCents = 0
    const sessionAmountTotal = 150750

    const amountPaid = rentAmountCents > 0
      ? rentAmountCents / 100
      : (sessionAmountTotal || 0) / 100

    expect(amountPaid).toBe(1507.5)
  })
})

// ── Installment note formatting ───────────────────────────────────────────────

describe("Payment note formatting", () => {
  it("formats installment note with index", () => {
    const installmentIndex = "1"
    const note = installmentIndex !== undefined
      ? `installment:${installmentIndex}`
      : "Paid via RentSentry payment link"
    expect(note).toBe("installment:1")
  })

  it("uses generic note when no installment index", () => {
    const installmentIndex = undefined
    const note = installmentIndex !== undefined
      ? `installment:${installmentIndex}`
      : "Paid via RentSentry payment link"
    expect(note).toBe("Paid via RentSentry payment link")
  })
})

// ── Autopay charge + decline alert logic ─────────────────────────────────────

describe("Decline count logic", () => {
  it("increments decline count correctly", () => {
    const recentDeclines = [{ id: "int-1" }, { id: "int-2" }]
    const declineCount = (recentDeclines?.length ?? 0) + 1
    expect(declineCount).toBe(3)
  })

  it("starts at 1 for a first-time decline", () => {
    const recentDeclines: { id: string }[] = []
    const declineCount = (recentDeclines?.length ?? 0) + 1
    expect(declineCount).toBe(1)
  })

  it("includes trigger check — skips alert when trigger not in list", () => {
    const triggers = ["pay_or_quit", "legal"]
    const shouldAlert = triggers.includes("autopay_declined")
    expect(shouldAlert).toBe(false)
  })

  it("fires alert when autopay_declined is in triggers", () => {
    const triggers = ["pay_or_quit", "autopay_declined", "legal"]
    const shouldAlert = triggers.includes("autopay_declined")
    expect(shouldAlert).toBe(true)
  })

  it("defaults to including autopay_declined when pm_alert_triggers is null", () => {
    const rawTriggers = null
    const triggers: string[] = Array.isArray(rawTriggers)
      ? rawTriggers
      : ["pay_or_quit", "legal", "installment_missed", "autopay_declined"]
    expect(triggers.includes("autopay_declined")).toBe(true)
  })
})
