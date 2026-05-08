"use client"

import { useState } from "react"
import { Info, X } from "lucide-react"

type Section = {
  title: string
  body: string
  items?: string[]
}

type Props = {
  title?: string
  sections: Section[]
  note?: string
  compact?: boolean
}

export default function CalculationExplainer({
  title = "How calculated",
  sections,
  note,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] text-[#6b7280] hover:text-white hover:bg-white/[0.06] transition-colors ${
          compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs"
        }`}
        aria-label={title}
      >
        <Info size={compact ? 11 : 12} />
        {title}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111827] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h3 className="text-white text-sm font-semibold">How these numbers are calculated</h3>
                <p className="text-[#4b5563] text-xs mt-0.5">Exact ledger fields are separated from model estimates.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#4b5563] hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {sections.map(section => (
                <div key={section.title}>
                  <div className="text-white text-xs font-semibold">{section.title}</div>
                  <p className="text-[#9ca3af] text-xs leading-relaxed mt-1">{section.body}</p>
                  {section.items && section.items.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {section.items.map(item => (
                        <li key={item} className="flex items-start gap-2 text-[#6b7280] text-xs leading-relaxed">
                          <span className="w-1 h-1 rounded-full bg-[#374151] shrink-0 mt-1.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {note && (
                <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2.5 text-amber-200/80 text-xs leading-relaxed">
                  {note}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
