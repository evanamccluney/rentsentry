"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Users, Bell, CreditCard, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const links = [
  { href: "/dashboard",               label: "Home",    icon: LayoutDashboard },
  { href: "/dashboard/notifications", label: "Alerts",  icon: Bell },
  { href: "/dashboard/tenants",       label: "Tenants", icon: Users },
  { href: "/dashboard/billing",       label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings",      label: "Settings", icon: Settings },
]

export default function BottomNav() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href)

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b] border-t border-[#27272a] flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {links.map(({ href, label, icon: Icon }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-3 transition-colors",
              active ? "text-[#818cf8]" : "text-[#52525b] hover:text-[#a1a1aa]"
            )}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
