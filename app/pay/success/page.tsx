import Link from "next/link"
import { CheckCircle2, Shield } from "lucide-react"

export default function PaySuccessPage() {
  return (
    <main className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={28} className="text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Payment received</h1>
        <p className="text-[#6b7280] text-sm leading-relaxed mb-8">
          Your payment has been processed successfully. Your property manager will be notified automatically.
        </p>
        <div className="flex items-center justify-center gap-2 text-[#4b5563] text-xs">
          <Shield size={11} className="text-blue-400" />
          <span>Secured by RentSentry &amp; Stripe</span>
        </div>
      </div>
    </main>
  )
}
