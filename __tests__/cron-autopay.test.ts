import { describe, it, expect, vi, beforeEach } from "vitest"
import { chargeAutopayTenant, AutopayTenant } from "@/lib/autopay/charge-tenant"

const mockTenant: AutopayTenant = {
  id: "tenant-1",
  name: "Jane Smith",
  user_id: "landlord-1",
  rent_amount: 1500,
  stripe_customer_id: "cus_test",
  stripe_payment_method_id: "pm_test",
  balance_due: 1500,
}

const TODAY = "2026-05-01"
const MONTH_START = "2026-05-01"
const NOW = new Date("2026-05-01T06:00:00Z")

function makeSupabase() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const from = vi.fn().mockReturnValue({ insert, update })
  return { from, insert, update }
}

function makeStripe(opts: { fail?: boolean } = {}) {
  return {
    paymentIntents: {
      create: opts.fail
        ? vi.fn().mockRejectedValue(new Error("Your card was declined."))
        : vi.fn().mockResolvedValue({ id: "pi_test123", status: "succeeded" }),
    },
  }
}

describe("chargeAutopayTenant", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("creates a payment intent with correct params and returns 'charged'", async () => {
    const stripe = makeStripe()
    const supabase = makeSupabase()

    const result = await chargeAutopayTenant(mockTenant, "acct_test", TODAY, MONTH_START, NOW, stripe as never, supabase)

    expect(result).toBe("charged")
    expect(stripe.paymentIntents.create).toHaveBeenCalledOnce()
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test",
        payment_method: "pm_test",
        confirm: true,
        off_session: true,
        transfer_data: { destination: "acct_test" },
        metadata: expect.objectContaining({
          tenant_id: "tenant-1",
          landlord_id: "landlord-1",
          is_autopay: "true",
          autopay_type: "monthly",
        }),
      }),
      { idempotencyKey: "autopay-tenant-1-2026-05-01" }
    )
  })

  it("charges the correct amount including fee (0.5%)", async () => {
    const stripe = makeStripe()
    const supabase = makeSupabase()

    await chargeAutopayTenant(mockTenant, "acct_test", TODAY, MONTH_START, NOW, stripe as never, supabase)

    const [params] = (stripe.paymentIntents.create as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(params.amount).toBe(150750)             // $1500 + $7.50 fee
    expect(params.application_fee_amount).toBe(750) // $7.50
  })

  it("writes payment record, updates balance, and logs intervention on success", async () => {
    const stripe = makeStripe()
    const supabase = makeSupabase()

    await chargeAutopayTenant(mockTenant, "acct_test", TODAY, MONTH_START, NOW, stripe as never, supabase)

    expect(supabase.from).toHaveBeenCalledWith("payments")
    expect(supabase.from).toHaveBeenCalledWith("tenants")
    expect(supabase.from).toHaveBeenCalledWith("interventions")
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        source: "monthly_autopay",
        amount: 1500,
        date: TODAY,
      })
    )
  })

  it("returns 'failed' and skips DB writes when Stripe declines", async () => {
    const stripe = makeStripe({ fail: true })
    const supabase = makeSupabase()

    const result = await chargeAutopayTenant(mockTenant, "acct_test", TODAY, MONTH_START, NOW, stripe as never, supabase)

    expect(result).toBe("failed")
    expect(supabase.insert).not.toHaveBeenCalled()
    expect(supabase.update).not.toHaveBeenCalled()
  })

  it("handles zero balance_due by setting new balance to 0", async () => {
    const stripe = makeStripe()
    const supabase = makeSupabase()
    const zeroBalanceTenant = { ...mockTenant, balance_due: 0 }

    await chargeAutopayTenant(zeroBalanceTenant, "acct_test", TODAY, MONTH_START, NOW, stripe as never, supabase)

    expect(supabase.update).toHaveBeenCalledWith(
      expect.objectContaining({ balance_due: 0 })
    )
  })

  it("uses a deterministic idempotency key per tenant per month", async () => {
    const stripe = makeStripe()
    const supabase = makeSupabase()

    await chargeAutopayTenant(mockTenant, "acct_test", TODAY, MONTH_START, NOW, stripe as never, supabase)

    const [, options] = (stripe.paymentIntents.create as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(options.idempotencyKey).toBe(`autopay-tenant-1-${MONTH_START}`)
  })
})
