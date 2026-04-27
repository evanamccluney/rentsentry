import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Sidebar from "@/components/dashboard/Sidebar"
import AIChat from "@/components/dashboard/AIChat"
import AutomationStatusBar from "@/components/dashboard/AutomationStatusBar"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded")
    .eq("id", user.id)
    .single()

  if (!profile?.onboarded) redirect("/onboarding")

  return (
    <div className="flex h-screen bg-[#0a0e1a] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AutomationStatusBar />
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
      <AIChat />
    </div>
  )
}
