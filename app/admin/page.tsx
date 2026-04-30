import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import { Users, CreditCard, Clock, AlertTriangle, CheckCircle, ShieldOff } from "lucide-react"
import AdminUserCard from "./AdminUserCard"

const ADMIN_ID = "b9988721-6b42-4387-a3be-a62920a3b46f"

function trialInfo(createdAt: string, metaEndsAt?: string) {
  const trialEndsAt = metaEndsAt
    ? new Date(metaEndsAt)
    : new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
  const daysLeft = Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const totalDays = Math.round((trialEndsAt.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
  const daysUsed = totalDays - daysLeft
  return { daysLeft, totalDays, daysUsed: Math.max(0, daysUsed), trialEndsAt, active: daysLeft > 0 }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) notFound()

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [
    { data: { users: authUsers } },
    { data: subs },
    { data: tenantCounts },
    { data: actionCounts },
  ] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 500 }),
    service.from("subscriptions").select("user_id, status, updated_at"),
    service.from("tenants").select("user_id").eq("status", "active"),
    service.from("interventions").select("user_id"),
  ])

  const subMap = new Map((subs ?? []).map(s => [s.user_id, s]))

  const tenantMap = new Map<string, number>()
  for (const row of tenantCounts ?? []) {
    tenantMap.set(row.user_id, (tenantMap.get(row.user_id) ?? 0) + 1)
  }

  const actionMap = new Map<string, number>()
  for (const row of actionCounts ?? []) {
    actionMap.set(row.user_id, (actionMap.get(row.user_id) ?? 0) + 1)
  }

  const rows = authUsers
    .filter(u => u.id !== ADMIN_ID)
    .map(u => {
      const sub = subMap.get(u.id)
      const revoked = u.user_metadata?.access_revoked === true
      const trial = trialInfo(u.created_at, u.user_metadata?.trial_ends_at)
      const status: "paid" | "trial" | "expired" | "revoked" =
        revoked ? "revoked" :
        sub?.status === "active" ? "paid" :
        trial.active ? "trial" : "expired"
      return {
        id: u.id,
        email: u.email ?? "No email",
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at ?? null,
        trial,
        status,
        tenants: tenantMap.get(u.id) ?? 0,
        actions: actionMap.get(u.id) ?? 0,
        sub: sub ?? null,
      }
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const paid     = rows.filter(r => r.status === "paid")
  const expiring = rows.filter(r => r.status === "trial" && r.trial.daysLeft <= 7)
  const trial    = rows.filter(r => r.status === "trial")
  const expired  = rows.filter(r => r.status === "expired")
  const revoked  = rows.filter(r => r.status === "revoked")
  const mrr      = paid.length * 49

  return (
    <div className="min-h-screen bg-[#0a0e1a] p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-white text-2xl font-bold">Admin</h1>
          <p className="text-[#4b5563] text-sm mt-1">Only you can see this · {rows.length} total users</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
          {[
            { label: "MRR",      value: `$${mrr.toLocaleString()}`, color: "text-emerald-400", icon: CreditCard },
            { label: "Paying",   value: paid.length,    color: "text-emerald-400", icon: CheckCircle },
            { label: "On Trial", value: trial.length,   color: "text-blue-400",    icon: Clock },
            { label: "Expired",  value: expired.length, color: "text-orange-400",  icon: AlertTriangle },
            { label: "Revoked",  value: revoked.length, color: "text-red-400",     icon: ShieldOff },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-[#111827] border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={13} className={color} />
                <span className="text-[#4b5563] text-xs uppercase tracking-wide">{label}</span>
              </div>
              <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Expiring soon */}
        {expiring.length > 0 && (
          <section className="mb-8">
            <h2 className="text-orange-400 font-semibold text-sm mb-3 flex items-center gap-2">
              <AlertTriangle size={14} />
              Expiring within 7 days — reach out personally
            </h2>
            <div className="space-y-3">
              {expiring.map(u => (
                <AdminUserCard key={u.id} user={u} formatDate={formatDate} formatDateTime={formatDateTime} />
              ))}
            </div>
          </section>
        )}

        {/* All users */}
        <section>
          <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            <Users size={14} className="text-[#4b5563]" />
            All Users
          </h2>
          <div className="space-y-3">
            {rows.map(u => (
              <AdminUserCard key={u.id} user={u} formatDate={formatDate} formatDateTime={formatDateTime} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
