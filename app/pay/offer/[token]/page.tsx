import { createClient as createServiceClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import { Shield } from "lucide-react"
import AcceptOfferButton from "./AcceptOfferButton"

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  })
}

export default async function OfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: offers } = await supabase
    .from("interventions")
    .select("id, tenant_id, user_id, status, snapshot, type")
    .in("type", ["pre_due_installment_offer", "split_pay_offer"])
    .filter("snapshot->>offer_token", "eq", token)
    .limit(1)

  const offer = offers?.[0]
  if (!offer) notFound()

  const snap = offer.snapshot as {
    // pre_due_installment_offer fields
    installments?: { amount: number; due_date: string }[]
    rent_amount?: number
    // split_pay_offer fields
    total_amount?: number
    max_installments?: number
    min_installments?: number
    includes_next_month?: boolean
    // shared
    expires_at: string
    offer_token: string
  }

  const expired = new Date(snap.expires_at) < new Date()
  const accepted = offer.status === "accepted"

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, unit")
    .eq("id", offer.tenant_id)
    .single()

  const { data: profile } = await supabase
    .from("profiles")
    .select("pm_display_name")
    .eq("id", offer.user_id)
    .single()

  if (expired) {
    return (
      <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold text-white mb-2">Offer expired</h1>
          <p className="text-[#71717a] text-sm">This payment plan offer has expired. Contact your property manager to set up a new arrangement.</p>
        </div>
      </main>
    )
  }

  if (accepted) {
    return (
      <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold text-white mb-2">Already accepted</h1>
          <p className="text-[#71717a] text-sm">You already accepted this payment plan. Check your messages for your payment link.</p>
        </div>
      </main>
    )
  }

  const { FEE_RATE } = await import("@/lib/payment-config")
  const pmName = profile?.pm_display_name || "Your property manager"

  // ── pre_due_installment_offer: fixed installments ──────────────────────────
  if (offer.type === "pre_due_installment_offer" && snap.installments) {
    const rentAmount = snap.rent_amount ?? 0
    return (
      <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Shield size={16} className="text-indigo-400" />
              <span className="text-white font-bold">RentSentry</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Split your rent</h1>
            <p className="text-[#71717a] text-sm">
              {pmName} is offering a payment plan for Unit {tenant?.unit}
            </p>
          </div>

          <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#71717a] text-xs uppercase tracking-wide">Total</span>
              <span className="text-white font-bold text-lg">${rentAmount.toLocaleString()}</span>
            </div>

            <div className="space-y-2 mb-4">
              {snap.installments.map((inst, i) => {
                const fee = Math.round(inst.amount * FEE_RATE * 100) / 100
                return (
                  <div key={i} className="flex items-center justify-between bg-white/[0.03] border border-[#27272a] rounded-lg px-4 py-3">
                    <div>
                      <div className="text-white text-sm font-medium">
                        {i === 0 ? "Pay now" : `Pay on ${formatDate(inst.due_date)}`}
                      </div>
                      <div className="text-[#52525b] text-xs">Installment {i + 1} of {snap.installments!.length}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-white text-sm font-semibold">${inst.amount.toLocaleString()}</div>
                      <div className="text-[#52525b] text-xs">+${fee.toFixed(2)} fee</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-[#52525b] text-xs">
              A small processing fee is added at checkout. You may also pay by check — contact {pmName} for details.
            </p>
          </div>

          <AcceptOfferButton
            token={token}
            tenantName={tenant?.name ?? ""}
            offerType="pre_due_installment_offer"
            totalAmount={rentAmount}
            maxInstallments={snap.installments.length}
            feeRate={FEE_RATE}
          />

          <p className="text-center text-[#52525b] text-xs mt-4">
            Secured by RentSentry &amp; Stripe. Your payment info is never stored on our servers.
          </p>
        </div>
      </main>
    )
  }

  // ── split_pay_offer: tenant chooses installment count ──────────────────────
  const totalAmount = snap.total_amount ?? 0
  const maxInstallments = snap.max_installments ?? 3
  const minInstallments = snap.min_installments ?? 2
  const includesNextMonth = snap.includes_next_month ?? false

  return (
    <main className="min-h-screen bg-[#09090b] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield size={16} className="text-indigo-400" />
            <span className="text-white font-bold">RentSentry</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Choose your plan</h1>
          <p className="text-[#71717a] text-sm">
            {pmName} is offering you a payment plan for Unit {tenant?.unit}
            {includesNextMonth && (
              <span className="block mt-1 text-amber-400/80 text-xs">
                This covers your past-due balance and upcoming rent
              </span>
            )}
          </p>
        </div>

        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[#71717a] text-xs uppercase tracking-wide">Total to cover</span>
            <span className="text-white font-bold text-lg">${totalAmount.toLocaleString()}</span>
          </div>
          <p className="text-[#52525b] text-xs mb-1">
            Pick how many payments work best for you. Payments are due every 2 weeks starting today.
          </p>
        </div>

        <AcceptOfferButton
          token={token}
          tenantName={tenant?.name ?? ""}
          offerType="split_pay_offer"
          totalAmount={totalAmount}
          maxInstallments={maxInstallments}
          minInstallments={minInstallments}
          feeRate={FEE_RATE}
        />

        <p className="text-center text-[#52525b] text-xs mt-4">
          Secured by RentSentry &amp; Stripe. Your payment info is never stored on our servers.
        </p>
      </div>
    </main>
  )
}
