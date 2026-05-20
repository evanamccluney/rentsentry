import { describe, expect, it } from "vitest"
import { generateTenantOtp } from "@/lib/tenant-otp"

describe("generateTenantOtp", () => {
  it("returns a six-digit numeric code", () => {
    expect(generateTenantOtp()).toMatch(/^\d{6}$/)
  })

  it("never returns a code below 100000 in repeated samples", () => {
    for (let i = 0; i < 100; i++) {
      expect(Number(generateTenantOtp())).toBeGreaterThanOrEqual(100000)
    }
  })
})
