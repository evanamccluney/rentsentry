"use client"
import { useState, useEffect } from "react"
import { Pause, Play, Settings, Loader2 } from "lucide-react"
import Link from "next/link"

export default function AutomationStatusBar() {
  const [autoMode, setAutoMode] = useState<boolean | null>(null) // null = loading
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/automation/settings")
      .then(r => r.json())
      .then(d => setAutoMode(d.auto_mode ?? false))
      .catch(() => setAutoMode(false))
  }, [])

  async function toggleAutoMode() {
    if (autoMode === null || saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_mode: !autoMode }),
      })
      const data = await res.json()
      if (data.ok) setAutoMode(data.auto_mode)
    } finally {
      setSaving(false)
    }
  }

  const isOn = autoMode === true

  return (
    <div className={`flex items-center justify-between px-6 py-2 border-b text-xs shrink-0 transition-colors ${
      isOn
        ? "bg-[#071a07] border-emerald-900/40"
        : "bg-[#0d1117] border-white/5"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 font-semibold ${isOn ? "text-emerald-400" : "text-[#4b5563]"}`}>
          {autoMode === null ? (
            <Loader2 size={11} className="animate-spin text-[#4b5563]" />
          ) : (
            <span className={`w-1.5 h-1.5 rounded-full ${isOn ? "bg-emerald-500 animate-pulse" : "bg-[#4b5563]"}`} />
          )}
          {autoMode === null
            ? "Loading..."
            : isOn
              ? "Auto Mode ON — system will act when conditions are met"
              : "Auto Mode OFF — system evaluates but does not send"}
        </div>
        {isOn && (
          <span className="text-[#374151] hidden sm:inline">
            Behavior-based monitoring · dedup protection · snapshots saved
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleAutoMode}
          disabled={autoMode === null || saving}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors text-xs disabled:opacity-40 ${
            isOn
              ? "bg-white/5 text-[#6b7280] hover:text-white hover:bg-white/10 border border-white/10"
              : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
          }`}
        >
          {saving ? (
            <Loader2 size={10} className="animate-spin" />
          ) : isOn ? (
            <><Pause size={10} /> Pause</>
          ) : (
            <><Play size={10} /> Enable</>
          )}
        </button>
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium bg-white/5 text-[#6b7280] hover:text-white hover:bg-white/10 border border-white/10 transition-colors text-xs"
        >
          <Settings size={10} /> Manage Rules
        </Link>
      </div>
    </div>
  )
}
