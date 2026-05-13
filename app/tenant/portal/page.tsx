import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { Shield, CheckCircle2, Clock, Phone, Mail } from "lucide-react"
import { getTenantIdFromSession } from "@/lib/tenant-auth"
import PayNowButton from "@/components/tenant/PayNowButton"
import LogoutButton from "@/components/tenant/LogoutButton"

function nextDueDate(rentDueDay: number): Date {
  const now = new Date()
  const dueDay = Math.min(Math.max(rentDueDay ?? 1, 1), 28)
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
  return thisMonth > now ? thisMonth : new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
}

function formatDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", opts ?? { month: "short", day: "numeric", year: "numeric" })
}

function daysPastDue(lastPaymentDate: string, rentDueDay = 1): number {
  const last = new Date(lastPaymentDate)
  const now = new Date()
  const dueDay = Math.min(Math.max(rentDueDay, 1), 28)
  let due = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (due > now) due = new Date(now.getFullYear(), now.getMonth() - 1, dueDay)
  return last < due ? Math.floor((now.getTime() - due.getTime()) / 86400000) : 0
}

export default async function TenantPortalPage() {
  const tenantId = await getTenantIdFromSession()
  if (!tenantId) redirect("/tenant/login")

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: tenant }, { data: payments }, { data: planRows }] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, unit, email, phone, balance_due, rent_amount, rent_due_day, last_payment_date, user_id, properties(name, address)")
      .eq("id", tenantId)
      .single(),
    supabase
      .from("payments")
      .select("id, amount, date, note")
      .eq("tenant_id", tenantId)
      .order("date", { ascending: false })
      .limit(8),
    supabase
      .from("interventions")
      .select("id, snapshot, status")
      .eq("tenant_id", tenantId)
      .eq("type", "payment_plan_agreed")
      .order("sent_at", { ascending: false })
      .limit(1),
  ])

  if (!tenant) redirect("/tenant/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, pm_display_name, pm_phone")
    .eq("id", tenant.user_id)
    .single()

  const property = tenant.properties as { name?: string | null; address?: string | null } | null
  const balance = tenant.balance_due ?? 0
  const rentAmount = tenant.rent_amount ?? 0
  const days = tenant.last_payment_date ? daysPastDue(tenant.last_payment_date, tenant.rent_due_day ?? 1) : 0
  const due = nextDueDate(tenant.rent_due_day ?? 1)
  const daysUntilDue = Math.ceil((due.getTime() - Date.now()) / 86400000)
  const stripeReady = !!profile?.stripe_account_id
  const firstName = tenant.name.split(" ")[0]

  // Active payment plan
  const activePlan = planRows?.[0]
  const planSnap = activePlan?.snapshot as { installments?: { amount: number; due_date: string }[] } | null
  const planInstallments = planSnap?.installments ?? []

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-blue-400" />
            <span className="text-white font-bold text-sm">RentSentry</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-5">
        {/* Greeting */}
        <div>
          <h1 className="text-white text-2xl font-bold">Hi {firstName}</h1>
          <p className="text-[#6b7280] text-sm mt-0.5">
            Unit {tenant.unit}{property?.name ? ` · ${property.name}` : ""}
          </p>
        </div>

        {/* Balance card */}
        {balance > 0 ? (
          <div className="bg-[#111827] border border-red-500/20 rounded-2xl p-5">
            <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-1">Balance due</div>
            <div className="text-red-400 text-4xl font-bold tabular-nums mb-1">
              ${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            {days > 0 && (
              <p className="text-[#6b7280] text-sm mb-4">
                {days} day{days !== 1 ? "s" : ""} past due
              </p>
            )}
            {stripeReady && (
              <div className="space-y-2.5">
                <PayNowButton type="full" label={`Pay $${balance.toLocaleString()} now`} />
                {planInstallments.length === 0 && balance > rentAmount * 0.5 && (
                  <PayNowButton type="plan" label="Split into 2 payments" />
                )}
              </div>
            )}
            {!stripeReady && (
              <p className="text-[#4b5563] text-sm">Contact your property manager to arrange payment.</p>
            )}
          </div>
        ) : (
          <div className="bg-[#111827] border border-emerald-500/20 rounded-2xl p-5 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
            <div>
              <div className="text-emerald-400 font-semibold text-sm">You&apos;re all caught up</div>
              <div className="text-[#4b5563] text-xs mt-0.5">No balance due at this time.</div>
            </div>
          </div>
        )}

        {/* Next due date */}
        <div className="bg-[#111827] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-[#4b5563]" />
            <div>
              <div className="text-[#4b5563] text-xs uppercase tracking-wide">Next rent due</div>
              <div className="text-white text-sm font-medium mt-0.5">
                {formatDate(due.toISOString(), { month: "long", day: "numeric", year: "numeric" })}
              </div>
            </div>
          </div>
          <div className={`text-sm font-semibold tabular-nums ${daysUntilDue <= 3 ? "text-orange-400" : "text-[#6b7280]"}`}>
            {daysUntilDue <= 0 ? "Today" : `${daysUntilDue}d`}
          </div>
        </div>

        {/* Active payment plan */}
        {planInstallments.length > 0 && (
          <div className="bg-[#111827] border border-amber-500/20 rounded-2xl p-5">
            <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">Active payment plan</div>
            <div className="space-y-2">
              {planInstallments.map((inst, i) => {
                const isPast = new Date(inst.due_date) < new Date()
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className={isPast ? "text-[#4b5563] line-through" : "text-white"}>
                      Installment {i + 1} — {formatDate(inst.due_date)}
                    </span>
                    <span className={isPast ? "text-[#4b5563]" : "text-amber-400 font-semibold"}>
                      ${inst.amount.toLocaleString()}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Payment history */}
        {(payments ?? []).length > 0 && (
          <div className="bg-[#111827] border border-white/[0.06] rounded-2xl p-5">
            <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">Payment history</div>
            <div className="space-y-3">
              {(payments ?? []).map(p => (
                <div key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                    <span className="text-[#9ca3af] text-sm">
                      {formatDate(p.date, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <span className="text-emerald-400 text-sm font-semibold tabular-nums">
                    ${(p.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact PM */}
        <div className="bg-[#111827] border border-white/[0.06] rounded-2xl p-5">
          <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">Contact your property manager</div>
          <div className="space-y-2.5">
            {profile?.pm_display_name && (
              <p className="text-white text-sm font-medium">{profile.pm_display_name}</p>
            )}
            {profile?.pm_phone && (
              <a
                href={`tel:${profile.pm_phone}`}
                className="flex items-center gap-2.5 text-[#9ca3af] hover:text-white text-sm transition-colors"
              >
                <Phone size={13} />
                {profile.pm_phone}
              </a>
            )}
            {tenant.email && (
              <a
                href={`mailto:${tenant.email}`}
                className="flex items-center gap-2.5 text-[#9ca3af] hover:text-white text-sm transition-colors"
              >
                <Mail size={13} />
                {tenant.email}
              </a>
            )}
            {!profile?.pm_phone && !tenant.email && (
              <p className="text-[#374151] text-sm">Contact info not available — reach out via your original lease documents.</p>
            )}
          </div>
        </div>

        <p className="text-center text-[#2e3a50] text-xs pb-4">
          Secured by RentSentry. Payment info is never stored on our servers.
        </p>
      </div>
    </main>
  )
}
