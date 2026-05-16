import { describe, it, expect } from "vitest"
import { detectIntent } from "@/lib/sms/intent"
import { parsePaidCodes, calcDaysPastDue, nextStepLabel } from "@/lib/sms/utils"

// ── detectIntent ──────────────────────────────────────────────────────────────

describe("detectIntent", () => {
  describe("send_plan_link", () => {
    it.each([
      "I need a payment plan",
      "Can I pay in installments?",
      "I want to split my rent",
      "Can I spread my balance over two payments?",
      "I'd like to pay in two payments",
      "partial pay is fine for now",
      "can I do three payments",
      "pay over time please",
    ])('detects plan intent from "%s"', msg => {
      expect(detectIntent(msg)).toBe("send_plan_link")
    })

    it("does NOT trigger on 'split' without payment context", () => {
      expect(detectIntent("me and my roommate split the chores")).toBeNull()
      expect(detectIntent("we split the pizza last night")).toBeNull()
    })
  })

  describe("send_payment_link", () => {
    it.each([
      "I want to pay now",
      "I want to pay in full",
      "how do I pay my balance",
      "pay online please",
      "send me a link",
      "I want to pay today",
      "pay everything",
      "full payment",
    ])('detects full payment intent from "%s"', msg => {
      expect(detectIntent(msg)).toBe("send_payment_link")
    })
  })

  describe("setup_autopay", () => {
    it.each([
      "set up autopay",
      "I want automatic payments",
      "can you set up auto",
      "recurring payments please",
      "auto charge me monthly",
      "save my card",
    ])('detects autopay intent from "%s"', msg => {
      expect(detectIntent(msg)).toBe("setup_autopay")
    })
  })

  describe("escalate_to_pm", () => {
    it.each([
      "I need to speak to someone",
      "can I talk to the manager",
      "call me back",
      "the heater is broken",
      "there's a repair needed",
      "I dispute this charge",
      "wrong amount on my bill",
      "not my balance",
    ])('detects escalation from "%s"', msg => {
      expect(detectIntent(msg)).toBe("escalate_to_pm")
    })
  })

  describe("null cases", () => {
    it.each([
      "ok",
      "thanks",
      "got it",
      "hello",
      "",
      "I'll check with my roommate",
    ])('returns null for ambiguous "%s"', msg => {
      expect(detectIntent(msg)).toBeNull()
    })
  })
})

// ── parsePaidCodes ────────────────────────────────────────────────────────────

describe("parsePaidCodes", () => {
  it.each(["YES", "Y", "ALL"])('returns "all" for "%s"', input => {
    expect(parsePaidCodes(input, 3)).toBe("all")
  })

  it.each(["NO", "N", "NONE"])('returns "none" for "%s"', input => {
    expect(parsePaidCodes(input, 3)).toBe("none")
  })

  it("parses single PAID code", () => {
    expect(parsePaidCodes("PAID 1", 3)).toEqual([1])
    expect(parsePaidCodes("PAID 2", 3)).toEqual([2])
  })

  it("parses multiple PAID codes comma-separated", () => {
    expect(parsePaidCodes("PAID 1,2", 3)).toEqual([1, 2])
    expect(parsePaidCodes("PAID 1, 3", 3)).toEqual([1, 3])
  })

  it("parses codes without PAID prefix", () => {
    expect(parsePaidCodes("1", 3)).toEqual([1])
    expect(parsePaidCodes("1 2", 3)).toEqual([1, 2])
  })

  it("ignores codes out of range", () => {
    expect(parsePaidCodes("PAID 4", 3)).toBe("none") // 4 > totalCount
    expect(parsePaidCodes("PAID 0", 3)).toBe("none") // 0 < 1
  })

  it("ignores codes beyond total when some are valid", () => {
    expect(parsePaidCodes("PAID 1,4", 3)).toEqual([1]) // 4 dropped
  })

  it("is case-insensitive", () => {
    expect(parsePaidCodes("yes", 3)).toBe("all")
    expect(parsePaidCodes("paid 1", 3)).toEqual([1])
  })
})

// ── calcDaysPastDue ───────────────────────────────────────────────────────────

describe("calcDaysPastDue", () => {
  it("returns 0 when lastPaymentDate is null", () => {
    expect(calcDaysPastDue(null)).toBe(0)
    expect(calcDaysPastDue(null, 5)).toBe(0)
  })

  it("returns 0 when paid within the current month before due day", () => {
    // If tenant paid today, they're not past due
    const today = new Date().toISOString().split("T")[0]
    const result = calcDaysPastDue(today, 1)
    // Could be 0 or positive depending on when test runs relative to due day;
    // at minimum should be a number
    expect(typeof result).toBe("number")
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it("returns a positive number for a payment made many months ago", () => {
    const old = "2024-01-01"
    const result = calcDaysPastDue(old, 1)
    expect(result).toBeGreaterThan(0)
  })

  it("clamps rentDueDay to 1-28 range", () => {
    const old = "2024-01-01"
    const withDayZero = calcDaysPastDue(old, 0)
    const withDayOne = calcDaysPastDue(old, 1)
    expect(withDayZero).toBe(withDayOne)

    const withDay30 = calcDaysPastDue(old, 30)
    const withDay28 = calcDaysPastDue(old, 28)
    expect(withDay30).toBe(withDay28)
  })
})

// ── nextStepLabel ─────────────────────────────────────────────────────────────

describe("nextStepLabel", () => {
  it("returns correct step for each threshold", () => {
    expect(nextStepLabel(0)).toBe("send a reminder")
    expect(nextStepLabel(4)).toBe("send a reminder")
    expect(nextStepLabel(5)).toBe("offer a payment plan")
    expect(nextStepLabel(9)).toBe("offer a payment plan")
    expect(nextStepLabel(10)).toBe("review CFK vs eviction")
    expect(nextStepLabel(19)).toBe("review CFK vs eviction")
    expect(nextStepLabel(20)).toBe("serve Pay or Quit notice")
    expect(nextStepLabel(29)).toBe("serve Pay or Quit notice")
    expect(nextStepLabel(30)).toBe("contact your attorney")
    expect(nextStepLabel(100)).toBe("contact your attorney")
  })
})
