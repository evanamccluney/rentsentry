"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Heart } from "lucide-react"
import HardshipModal from "./HardshipModal"

export default function HardshipButton({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[#6b7280] hover:text-white text-xs font-medium transition-colors"
      >
        <Heart size={12} />
        Log Hardship
      </button>

      {open && (
        <HardshipModal
          tenantId={tenantId}
          tenantName={tenantName}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh() }}
        />
      )}
    </>
  )
}
