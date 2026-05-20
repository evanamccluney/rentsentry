import { describe, expect, it } from "vitest"
import { isHighImpactAITool, summarizePendingAITools, userExplicitlyConfirmed } from "@/lib/ai-action-guard"

describe("AI action guard", () => {
  it("marks outbound and record-changing tools as high impact", () => {
    expect(isHighImpactAITool("send_sms")).toBe(true)
    expect(isHighImpactAITool("record_payment")).toBe(true)
    expect(isHighImpactAITool("send_split_pay_offer")).toBe(true)
  })

  it("does not mark unknown tools as high impact", () => {
    expect(isHighImpactAITool("unknown")).toBe(false)
  })

  it("requires explicit confirmation language", () => {
    expect(userExplicitlyConfirmed("confirm")).toBe(true)
    expect(userExplicitlyConfirmed("yes go ahead")).toBe(true)
    expect(userExplicitlyConfirmed("send Kevin a text")).toBe(false)
  })

  it("summarizes pending tool names without duplicates", () => {
    expect(summarizePendingAITools(["send_sms", "send_sms", "record_payment"])).toBe("send_sms, record_payment")
  })
})
