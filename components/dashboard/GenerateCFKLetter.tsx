"use client"
import { useState } from "react"
import { FileText, X, Printer, Sparkles, AlertTriangle } from "lucide-react"

interface Props {
  tenantId: string
  tenantName: string
  defaultOfferAmount: number
}

const DISCLAIMER = `IMPORTANT NOTICE: This letter is an informal offer prepared with the assistance of AI and does not constitute legal advice or a legally binding agreement. The property manager is solely responsible for verifying that all terms, notice periods, and conditions comply with applicable state and local law before presenting this letter. Both parties are encouraged to consult with a licensed attorney before signing any agreement. RentSentry makes no representation as to the legal sufficiency of this document.`

function getDefaultVacateDate() {
  const d = new Date()
  d.setDate(d.getDate() + 21)
  return d.toISOString().split("T")[0]
}

function openPrintWindow(letter: string, meta: {
  tenantName: string; unit: string; propertyAddress: string;
  pmName: string; offerAmount: number; vacateDate: string
}) {
  const win = window.open("", "_blank", "width=800,height=900")
  if (!win) return

  const paragraphs = letter
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      if (p.startsWith("•") || p.startsWith("-") || p.match(/^\d+\./)) {
        const items = p.split("\n").filter(Boolean)
        return `<ul>${items.map(i => `<li>${i.replace(/^[•\-\d+\.]\s*/, "")}</li>`).join("")}</ul>`
      }
      return `<p>${p.replace(/\n/g, "<br/>")}</p>`
    })
    .join("\n")

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cash for Keys Offer — ${meta.tenantName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 12pt;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 680px;
      margin: 48px auto;
      padding: 0 32px;
    }
    h1 { font-size: 13pt; font-weight: normal; margin-bottom: 2px; }
    p { margin-bottom: 12px; }
    ul { margin: 8px 0 12px 24px; }
    li { margin-bottom: 4px; }
    .disclaimer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #ccc;
      font-size: 8.5pt;
      color: #555;
      font-family: Arial, sans-serif;
      line-height: 1.5;
    }
    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  ${paragraphs}
  <div class="disclaimer">${DISCLAIMER}</div>
</body>
</html>`)
  win.document.close()
  setTimeout(() => win.print(), 400)
}

export default function GenerateCFKLetter({ tenantId, tenantName, defaultOfferAmount }: Props) {
  const [open, setOpen] = useState(false)
  const [offerAmount, setOfferAmount] = useState(String(defaultOfferAmount))
  const [vacateDate, setVacateDate] = useState(getDefaultVacateDate())
  const [customNote, setCustomNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [letter, setLetter] = useState("")
  const [meta, setMeta] = useState<{
    tenantName: string; unit: string; propertyAddress: string;
    pmName: string; offerAmount: number; vacateDate: string
  } | null>(null)

  function reset() {
    setLetter("")
    setMeta(null)
    setOfferAmount(String(defaultOfferAmount))
    setVacateDate(getDefaultVacateDate())
    setCustomNote("")
  }

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch("/api/ai/cfk-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          offerAmount: parseFloat(offerAmount) || defaultOfferAmount,
          vacateDate,
          customNote: customNote.trim() || null,
        }),
      })
      const data = await res.json()
      if (data.letter) {
        setLetter(data.letter)
        setMeta(data.meta)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true) }}
        className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-white transition-colors"
      >
        <FileText size={12} />
        Generate CFK letter
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={() => setOpen(false)}>
          <div
            className="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-emerald-400" />
                <span className="text-white font-semibold text-sm">Cash for Keys Offer Letter</span>
                <span className="text-[#4b5563] text-xs">· {tenantName}</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#4b5563] hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!letter ? (
                /* Form */
                <div className="px-6 py-5 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">
                        Offer Amount ($)
                      </label>
                      <input
                        type="number"
                        value={offerAmount}
                        onChange={e => setOfferAmount(e.target.value)}
                        className="w-full bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/40 transition-colors"
                      />
                      <p className="text-[#374151] text-[10px] mt-1">Pre-filled with recommended offer</p>
                    </div>
                    <div>
                      <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">
                        Vacate By
                      </label>
                      <input
                        type="date"
                        value={vacateDate}
                        onChange={e => setVacateDate(e.target.value)}
                        className="w-full bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/40 transition-colors"
                      />
                      <p className="text-[#374151] text-[10px] mt-1">Default: 21 days from today</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[#4b5563] text-xs uppercase tracking-wide block mb-1.5">
                      Additional context for the AI <span className="text-[#2e3a50] normal-case">(optional)</span>
                    </label>
                    <textarea
                      value={customNote}
                      onChange={e => setCustomNote(e.target.value)}
                      rows={2}
                      placeholder="e.g. tenant has a dog, unit needs repairs, previous verbal agreement..."
                      className="w-full bg-[#111827] border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/40 transition-colors resize-none placeholder:text-[#2e3a50]"
                    />
                  </div>

                  {/* Disclaimer preview */}
                  <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-amber-200/60 text-xs leading-relaxed">
                        This letter is AI-generated and for informational purposes only. You are responsible for verifying compliance with state and local law before presenting it. Have your attorney review before serving.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Letter preview */
                <div className="px-6 py-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[#4b5563] text-xs uppercase tracking-wide">Letter preview</span>
                    <button
                      onClick={() => setLetter("")}
                      className="text-[#374151] hover:text-[#6b7280] text-xs transition-colors"
                    >
                      ← Edit details
                    </button>
                  </div>
                  <div className="bg-white text-[#1a1a1a] rounded-xl p-6 text-sm leading-relaxed font-serif whitespace-pre-wrap">
                    {letter}
                  </div>
                  <div className="mt-3 bg-[#111827] border border-white/5 rounded-xl p-3.5">
                    <p className="text-[#374151] text-[10px] leading-relaxed">{DISCLAIMER}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1.5 text-[#374151] text-xs">
                <Sparkles size={11} className="text-violet-500" />
                AI-generated · review before presenting
              </div>
              <div className="flex gap-2">
                {letter && meta ? (
                  <button
                    onClick={() => openPrintWindow(letter, { ...meta, offerAmount: parseFloat(offerAmount) })}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors"
                  >
                    <Printer size={13} />
                    Print / Save PDF
                  </button>
                ) : (
                  <button
                    onClick={generate}
                    disabled={loading || !offerAmount || !vacateDate}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                  >
                    <Sparkles size={13} />
                    {loading ? "Generating…" : "Generate Letter"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
