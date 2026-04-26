"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { StickyNote } from "lucide-react"

export default function TenantNotes({ tenantId, initialNotes }: { tenantId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? "")
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("tenants")
      .update({ notes: notes.trim() || null })
      .eq("id", tenantId)
    if (error) toast.error("Could not save notes.")
    else { toast.success("Notes saved."); setDirty(false) }
    setSaving(false)
  }

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StickyNote size={14} className="text-[#4b5563]" />
          <h2 className="text-white font-semibold text-sm">Notes</h2>
        </div>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      <textarea
        value={notes}
        onChange={e => { setNotes(e.target.value); setDirty(true) }}
        onBlur={() => { if (dirty) save() }}
        placeholder="e.g. Called tenant 4/20 — promised to pay by Friday. Has 2 dogs, month-to-month after June."
        rows={3}
        className="w-full bg-[#0d1117] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 placeholder:text-[#374151] focus:outline-none focus:border-white/20 resize-none leading-relaxed"
      />
      <p className="text-[#2e3a50] text-xs mt-1.5">Auto-saves on blur · visible only to you</p>
    </div>
  )
}
