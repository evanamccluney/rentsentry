"use client"
import { useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronUp, Clock, Users, Zap, PlusCircle, Ban, RotateCcw } from "lucide-react"

type UserRow = {
  id: string
  email: string
  createdAt: string
  lastSignIn: string | null
  trial: { daysLeft: number; totalDays: number; daysUsed: number; active: boolean; trialEndsAt: Date }
  status: "paid" | "trial" | "expired" | "revoked"
  tenants: number
  actions: number
  sub: { status: string; updated_at: string } | null
}

const STATUS_STYLE: Record<string, string> = {
  paid:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  trial:   "text-blue-400 bg-blue-500/10 border-blue-500/20",
  expired: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  revoked: "text-red-400 bg-red-500/10 border-red-500/20",
}

export default function AdminUserCard({
  user,
  formatDate,
  formatDateTime,
}: {
  user: UserRow
  formatDate: (iso: string) => string
  formatDateTime: (iso: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [customDays, setCustomDays] = useState("7")

  const statusLabel =
    user.status === "paid"    ? "Paying $49/mo" :
    user.status === "revoked" ? "Revoked" :
    user.status === "expired" ? "Expired" :
    `${user.trial.daysLeft}d left`

  const trialPct = Math.min(100, Math.round((user.trial.daysUsed / user.trial.totalDays) * 100))

  async function runAction(action: string, days?: number) {
    setLoading(action)
    try {
      const res = await fetch("/api/admin/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: user.id, action, days }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(
          action === "add_days" ? `Added ${days} days` :
          action === "revoke"   ? "Access revoked" :
          "Reset to default"
        )
        setTimeout(() => window.location.reload(), 800)
      } else {
        toast.error(data.error || "Something went wrong.")
      }
    } catch {
      toast.error("Could not apply change.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0">
            <div className="text-white text-sm font-medium truncate">{user.email}</div>
            <div className="text-[#4b5563] text-xs mt-0.5">
              Joined {formatDate(user.createdAt)}
              {user.lastSignIn ? ` · Last seen ${formatDate(user.lastSignIn)}` : " · No sign-ins yet"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="flex items-center gap-3 text-xs text-[#4b5563]">
            <span className="flex items-center gap-1"><Users size={11} />{user.tenants}</span>
            <span className="flex items-center gap-1"><Zap size={11} />{user.actions} actions</span>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${STATUS_STYLE[user.status]}`}>
            {statusLabel}
          </span>
          {open ? <ChevronUp size={14} className="text-[#4b5563]" /> : <ChevronDown size={14} className="text-[#4b5563]" />}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-white/5 px-5 py-4 space-y-5">
          {/* Trial progress */}
          {user.status !== "paid" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[#4b5563] text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <Clock size={11} /> Trial Usage
                </span>
                <span className="text-white text-xs font-medium">
                  {user.trial.daysUsed} of {user.trial.totalDays} days used
                  {user.trial.active && ` · ${user.trial.daysLeft}d remaining`}
                  {!user.trial.active && " · Expired"}
                </span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    user.status === "revoked" || !user.trial.active ? "bg-red-500" :
                    user.trial.daysLeft <= 3 ? "bg-orange-500" :
                    user.trial.daysLeft <= 7 ? "bg-amber-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${trialPct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-[#2e3a50]">
                <span>Started {formatDate(user.createdAt)}</span>
                <span>Ends {formatDate(user.trial.trialEndsAt.toISOString())}</span>
              </div>
            </div>
          )}

          {/* Activity */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Tenants Added", value: user.tenants },
              { label: "Actions Taken", value: user.actions },
              { label: "Last Active",   value: user.lastSignIn ? formatDateTime(user.lastSignIn) : "No contact" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5">
                <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">{label}</div>
                <div className="text-white text-sm font-semibold">{value}</div>
              </div>
            ))}
          </div>

          {/* Controls — hidden for paying users */}
          {user.status !== "paid" && (
            <div>
              <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">Trial Controls</div>
              <div className="flex flex-wrap gap-2">
                {/* Add preset days */}
                {[7, 14, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => runAction("add_days", d)}
                    disabled={loading !== null}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  >
                    <PlusCircle size={12} />
                    +{d} days
                  </button>
                ))}

                {/* Custom days */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={customDays}
                    onChange={e => setCustomDays(e.target.value)}
                    min={1}
                    max={365}
                    className="w-16 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white text-center focus:outline-none focus:border-white/20"
                  />
                  <button
                    onClick={() => runAction("add_days", parseInt(customDays))}
                    disabled={loading !== null || !customDays || parseInt(customDays) < 1}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>

                <div className="w-px bg-white/10 mx-1" />

                {/* Revoke */}
                <button
                  onClick={() => runAction("revoke")}
                  disabled={loading !== null || user.status === "revoked"}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                >
                  <Ban size={12} />
                  Revoke Access
                </button>

                {/* Reset */}
                <button
                  onClick={() => runAction("reset")}
                  disabled={loading !== null}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-[#9ca3af] hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={12} />
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
