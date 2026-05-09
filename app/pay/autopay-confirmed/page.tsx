import { Shield, Zap } from "lucide-react"

export default function AutopayConfirmedPage() {
  return (
    <main className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
          <Zap size={28} className="text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Autopay enabled</h1>
        <p className="text-[#6b7280] text-sm leading-relaxed mb-8">
          Your payment method has been saved. Future installments will be charged automatically on their due dates — you don't need to do anything.
        </p>
        <div className="flex items-center justify-center gap-2 text-[#4b5563] text-xs">
          <Shield size={11} className="text-blue-400" />
          <span>Secured by RentSentry &amp; Stripe</span>
        </div>
      </div>
    </main>
  )
}
