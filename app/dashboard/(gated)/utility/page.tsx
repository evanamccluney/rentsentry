import { Zap } from "lucide-react"

export default function UtilityAuditPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mb-4">
        <Zap size={20} className="text-yellow-400" />
      </div>
      <h1 className="text-white text-xl font-bold mb-2">Utility Audit</h1>
      <p className="text-[#6b7280] text-sm max-w-sm leading-relaxed">
        Utility billing tracking is coming soon. This feature will flag units where you may still be paying utilities after tenant move-in.
      </p>
    </div>
  )
}
