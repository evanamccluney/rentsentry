import { CheckCircle2, Shield, Zap } from "lucide-react"

export default async function PaySuccessPage({ searchParams }: { searchParams: Promise<{ autopay?: string }> }) {
  const { autopay } = await searchParams
  const autopayEnabled = autopay === "1"

  return (
    <main className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={28} className="text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Payment received</h1>
        <p className="text-[#6b7280] text-sm leading-relaxed mb-6">
          Your payment has been processed successfully. Your property manager will be notified automatically.
        </p>

        {autopayEnabled && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 mb-6 flex items-start gap-3 text-left">
            <Zap size={15} className="text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-blue-300 text-sm font-semibold">Autopay activated</p>
              <p className="text-blue-400/70 text-xs mt-0.5 leading-relaxed">
                Your payment method has been saved. You&apos;ll be charged automatically each month on your due date.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-[#4b5563] text-xs">
          <Shield size={11} className="text-blue-400" />
          <span>Secured by RentSentry &amp; Stripe</span>
        </div>
      </div>
    </main>
  )
}
