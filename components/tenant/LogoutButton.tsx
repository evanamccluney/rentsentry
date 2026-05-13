"use client"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

export default function LogoutButton() {
  const router = useRouter()

  async function handle() {
    await fetch("/api/tenant/auth/logout", { method: "POST" })
    router.push("/tenant/login")
  }

  return (
    <button
      onClick={handle}
      className="flex items-center gap-1.5 text-[#4b5563] hover:text-white transition-colors text-xs"
    >
      <LogOut size={13} />
      Sign out
    </button>
  )
}
