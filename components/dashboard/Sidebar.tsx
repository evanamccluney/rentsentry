"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Building2, Users, CreditCard, LogOut, Settings, TrendingUp, CalendarDays, BarChart2, Upload, Bell, ShieldCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

const ADMIN_ID = "b9988721-6b42-4387-a3be-a62920a3b46f"

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/tenants", label: "Tenants", icon: Users },
  { href: "/dashboard/import", label: "Import Tenants", icon: Upload },
  { href: "/dashboard/properties", label: "Properties", icon: Building2 },
  { href: "/dashboard/rent-roll", label: "Rent Roll", icon: TrendingUp },
  { href: "/dashboard/leases", label: "Leases", icon: CalendarDays },
  { href: "/dashboard/impact", label: "Revenue Impact", icon: BarChart2 },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    links.forEach(({ href }) => router.prefetch(href))
  }, [router])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user?.id === ADMIN_ID) setIsAdmin(true)
    })
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <aside className="w-60 bg-[#0d1220] border-r border-[#1e2d45] flex flex-col shrink-0">
      <div className="px-6 py-6 border-b border-[#1e2d45]">
        <span className="text-white font-bold text-lg tracking-tight">RentSentry</span>
        <div className="text-[#60a5fa] text-xs mt-0.5">Revenue Protection</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch={true}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              (href === "/dashboard" ? pathname === href : pathname.startsWith(href))
                ? "bg-[#1a2744] text-[#60a5fa]"
                : "text-[#9ca3af] hover:bg-[#131929] hover:text-white"
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-[#1e2d45]">
        {isAdmin && (
          <Link
            href="/admin"
            prefetch={false}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1",
              pathname === "/admin"
                ? "bg-[#1a2744] text-[#60a5fa]"
                : "text-[#4b5563] hover:bg-[#131929] hover:text-white"
            )}
          >
            <ShieldCheck size={16} />
            Admin
          </Link>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#9ca3af] hover:bg-[#131929] hover:text-white transition-colors w-full"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
