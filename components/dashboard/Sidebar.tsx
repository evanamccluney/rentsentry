"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Building2, Users, CreditCard, LogOut,
  Settings, TrendingUp, CalendarDays, BarChart2, Upload,
  Bell, ShieldCheck,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

const ADMIN_ID = "b9988721-6b42-4387-a3be-a62920a3b46f"

const links = [
  { href: "/dashboard",                  label: "Overview",       icon: LayoutDashboard },
  { href: "/dashboard/notifications",    label: "Notifications",  icon: Bell },
  { href: "/dashboard/tenants",          label: "Tenants",        icon: Users },
  { href: "/dashboard/import",           label: "Import",         icon: Upload },
  { href: "/dashboard/properties",       label: "Properties",     icon: Building2 },
  { href: "/dashboard/rent-roll",        label: "Rent Roll",      icon: TrendingUp },
  { href: "/dashboard/leases",           label: "Leases",         icon: CalendarDays },
  { href: "/dashboard/impact",           label: "Revenue Impact", icon: BarChart2 },
  { href: "/dashboard/billing",          label: "Billing",        icon: CreditCard },
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
    await createClient().auth.signOut()
    router.push("/login")
  }

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href)

  return (
    <aside className="hidden lg:flex w-56 flex-col shrink-0 bg-[#09090b] border-r border-[#27272a]">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#27272a]">
        <span className="font-heading text-white font-bold text-base tracking-tight">RentSentry</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch={true}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
              isActive(href)
                ? "bg-[#6366f1]/10 text-[#818cf8] font-medium"
                : "text-[#71717a] hover:bg-[#18181b] hover:text-[#a1a1aa] font-normal"
            )}
          >
            <Icon size={15} className="shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-[#27272a] space-y-0.5">
        <Link
          href="/dashboard/settings"
          prefetch={true}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
            isActive("/dashboard/settings")
              ? "bg-[#6366f1]/10 text-[#818cf8] font-medium"
              : "text-[#71717a] hover:bg-[#18181b] hover:text-[#a1a1aa] font-normal"
          )}
        >
          <Settings size={15} className="shrink-0" />
          <span className="truncate">Settings</span>
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            prefetch={false}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
              pathname === "/admin"
                ? "bg-[#6366f1]/10 text-[#818cf8] font-medium"
                : "text-[#71717a] hover:bg-[#18181b] hover:text-[#a1a1aa]"
            )}
          >
            <ShieldCheck size={15} className="shrink-0" />
            <span>Admin</span>
          </Link>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#52525b] hover:bg-[#18181b] hover:text-[#71717a] transition-colors w-full"
        >
          <LogOut size={15} className="shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
