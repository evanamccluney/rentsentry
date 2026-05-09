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
    .select("id, tenant_id, user_id, status, snapshot")
    .eq("type", "pre_due_installment_offer")
    .filter("snapshot->>offer_token", "eq", token)
    .limit(1)

  const offer = offers?.[0]
  if (!offer) notFound()

  const snap = offer.snapshot as {
    installments: { amount: number; due_date: string }[]
    rent_amount: number
    expires_at: string
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
      <main className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold text-white mb-2">Offer expired</h1>
          <p className="text-[#6b7280] text-sm">This payment plan offer has expired. Contact your property manager to set up a new arrangement.</p>
        </div>
      </main>
    )
  }

  if (accepted) {
    return (
      <main className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold text-white mb-2">Already accepted</h1>
          <p className="text-[#6b7280] text-sm">You already accepted this payment plan. Check your messages for your payment link.</p>
        </div>
      </main>
    )
  }

  const FEE_RATE = 0.005

  return (
    <main className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield size={16} className="text-blue-400" />
            <span className="text-white font-bold">RentSentry</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Split your rent</h1>
          <p className="text-[#6b7280] text-sm">
            {profile?.pm_display_name || "Your property manager"} is offering you a payment plan for Unit {tenant?.unit}
          </p>
        </div>

        {/* Plan card */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[#4b5563] text-xs uppercase tracking-wide">Total rent</span>
            <span className="text-white font-bold text-lg">${snap.rent_amount.toLocaleString()}</span>
          </div>

          <div className="space-y-2 mb-4">
            {snap.installments.map((inst, i) => {
              const fee = Math.round(inst.amount * FEE_RATE * 100) / 100
              return (
                <div key={i} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                  <div>
                    <div className="text-white text-sm font-medium">
                      {i === 0 ? "Pay now" : `Pay on ${formatDate(inst.due_date)}`}
                    </div>
                    <div className="text-[#4b5563] text-xs">
                      {i === 0 ? "First installment" : "Second installment"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white text-sm font-semibold">${inst.amount.toLocaleString()}</div>
                    <div className="text-[#4b5563] text-xs">+${fee.toFixed(2)} fee</div>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[#374151] text-xs">
            A 0.5% processing fee is added at checkout. You may also pay by check — contact your property manager for details.
          </p>
        </div>

        <AcceptOfferButton token={token} tenantName={tenant?.name ?? ""} />

        <p className="text-center text-[#374151] text-xs mt-4">
          Secured by RentSentry &amp; Stripe. Your payment info is never stored on our servers.
        </p>
      </div>
    </main>
  )
}
