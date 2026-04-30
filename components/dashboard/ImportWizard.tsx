"use client"
import { useState, useRef } from "react"
import { Upload, CheckCircle2, AlertTriangle, Download, ChevronRight, X, ArrowLeft, RefreshCw } from "lucide-react"
import {
  PLATFORM_CONFIGS, parseCSV, detectColumnMapping, convertRow, generateTemplateCSV,
  type Platform, type TenantImportRow, type ParseError,
} from "@/lib/import-mappers"

interface Property { id: string; name: string }

const PLATFORMS: Platform[] = ["yardi", "appfolio", "buildium", "rent_manager", "excel"]

const PLATFORM_ICONS: Record<Platform, string> = {
  yardi: "Y", appfolio: "AF", buildium: "B", rent_manager: "RM", excel: "XL",
}

const FIELD_LABELS: Record<string, string> = {
  name: "Tenant Name", unit: "Unit", email: "Email", phone: "Phone",
  rent_amount: "Monthly Rent", balance_due: "Balance Due",
  lease_start: "Lease Start", lease_end: "Lease End",
  rent_due_day: "Rent Due Day", payment_method: "Payment Method",
  card_expiry: "Card Expiry", previous_delinquency: "Prior Delinquency",
  late_payment_count: "Late Payment Count", days_late_avg: "Avg Days Late", notes: "Notes",
}

// ── Parse error card ──────────────────────────────────────────────────────────

const PARSE_ERROR_COPY: Record<string, { title: string; body: string; fix: string }> = {
  xlsx_not_supported: {
    title: "Excel file detected — CSV required",
    body: "RentSentry can't read .xlsx files directly. Open the file in Excel or Google Sheets, then go to File → Save As → CSV (.csv), and upload that instead.",
    fix: "Open in Excel → Save As → CSV, then upload again",
  },
  empty_file: {
    title: "File is empty",
    body: "The file you uploaded has no content. Make sure you exported data from your property management software before downloading, and that the export wasn't cancelled mid-way.",
    fix: "Re-export from your software and try again",
  },
  no_data_rows: {
    title: "No tenant rows found",
    body: "The file has column headers but no tenant data underneath. This sometimes happens if the report was exported with no active tenants, or if filters excluded all results.",
    fix: "Check that your export includes active tenants with no extra filters",
  },
  wrong_delimiter: {
    title: "File uses a different separator",
    body: "This CSV appears to use semicolons (;) or tabs as separators instead of commas. This is common with Yardi exports from European-locale Windows machines. Open the file in Excel, then save it as 'CSV UTF-8 (Comma delimited)' and upload again.",
    fix: "In Excel: Save As → CSV UTF-8 (Comma delimited)",
  },
  garbled_encoding: {
    title: "File encoding issue",
    body: "The file appears to be saved in UTF-16 format (a common result when Excel auto-saves CSV files on Windows). Open it in Excel, then re-save as 'CSV UTF-8 (Comma delimited)' and upload again.",
    fix: "In Excel: Save As → CSV UTF-8 (Comma delimited)",
  },
}

function ParseErrorCard({
  error, platform, onRetry, onBack,
}: {
  error: ParseError
  platform: Platform
  onRetry: () => void
  onBack: () => void
}) {
  const copy = PARSE_ERROR_COPY[error.code] ?? {
    title: "Could not read file",
    body: "Something went wrong parsing this file. Try exporting again from your software.",
    fix: "Try a different file",
  }
  const extra = error.code === "wrong_delimiter" && "detected" in error
    ? ` Detected separator: ${error.detected}.`
    : ""

  return (
    <div className="bg-[#1a0a0a] border border-red-500/25 rounded-2xl p-5 mb-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
          <AlertTriangle size={15} className="text-red-400" />
        </div>
        <div>
          <div className="text-red-300 font-semibold text-sm mb-1">{copy.title}</div>
          <p className="text-[#9ca3af] text-xs leading-relaxed">{copy.body}{extra}</p>
        </div>
      </div>

      <div className="bg-[#0d1117] border border-white/5 rounded-xl px-4 py-3 mb-4">
        <div className="text-[#4b5563] text-[10px] uppercase tracking-wide mb-1">How to fix</div>
        <div className="text-[#9ca3af] text-xs">{copy.fix}</div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#60a5fa]/10 border border-[#60a5fa]/20 text-[#60a5fa] text-sm font-semibold hover:bg-[#60a5fa]/15 transition-colors"
        >
          <RefreshCw size={13} />
          Try again
        </button>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[#9ca3af] text-sm hover:bg-white/10 transition-colors"
        >
          Re-read instructions
        </button>
      </div>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function ImportWizard({ properties }: { properties: Property[] }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [parsedRows, setParsedRows] = useState<TenantImportRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, keyof TenantImportRow>>({})
  const [propertyId, setPropertyId] = useState<string>(properties[0]?.id ?? "")
  const [loading, setLoading] = useState(false)
  const [imported, setImported] = useState<number | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [parseError, setParseError] = useState<ParseError | null>(null)
  const [noMappedColumns, setNoMappedColumns] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function resetUpload() {
    setParseError(null)
    setNoMappedColumns(false)
    setParsedRows([])
    setHeaders([])
    setImportError(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function triggerFilePicker() {
    resetUpload()
    fileRef.current?.click()
  }

  function handleFile(file: File) {
    if (!platform) return
    resetUpload()

    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      setParseError({ code: "xlsx_not_supported" })
      setStep(3)
      return
    }

    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const result = parseCSV(text)

      if (!result.ok) {
        setParseError(result.error)
        setStep(3)
        return
      }

      const { headers: h, rows: rawRows } = result
      const mapping = detectColumnMapping(h, platform)
      const mappedFields = new Set(Object.values(mapping))

      if (!mappedFields.has("name") && !mappedFields.has("unit")) {
        setNoMappedColumns(true)
        setHeaders(h)
        setStep(3)
        return
      }

      const converted = rawRows.map(r => convertRow(r, mapping))
      setHeaders(h)
      setColumnMapping(mapping)
      setParsedRows(converted)
      setStep(3)
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function updateMapping(header: string, field: string) {
    const newMapping = { ...columnMapping }
    for (const [h, f] of Object.entries(newMapping)) {
      if (f === field && h !== header) delete newMapping[h]
    }
    if (field === "") delete newMapping[header]
    else newMapping[header] = field as keyof TenantImportRow
    setColumnMapping(newMapping)
  }

  async function handleImport() {
    if (!platform) return
    setLoading(true)
    setImportError(null)
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows, propertyId: propertyId || null }),
      })
      const data = await res.json()
      if (data.ok) setImported(data.imported)
      else setImportError(data.error || "Import failed.")
    } catch {
      setImportError("Could not reach server.")
    } finally {
      setLoading(false)
    }
  }

  function downloadTemplate() {
    const csv = generateTemplateCSV()
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "rentsentry-import-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const validRows = parsedRows.filter(r => !r._errors?.length)
  const errorRows = parsedRows.filter(r => r._errors?.length)
  const cfg = platform ? PLATFORM_CONFIGS[platform] : null

  // ── Success ────────────────────────────────────────────────────────────────
  if (imported !== null) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={32} className="text-emerald-400" />
        </div>
        <h2 className="text-white text-xl font-bold mb-2">
          {imported} tenant{imported !== 1 ? "s" : ""} imported
        </h2>
        <p className="text-[#4b5563] text-sm mb-8">
          RentSentry has scored each tenant and assigned their risk tier.
        </p>
        <div className="flex gap-3 justify-center">
          <a href="/dashboard/tenants" className="px-5 py-2.5 rounded-xl bg-[#60a5fa] text-black text-sm font-semibold hover:bg-[#3b82f6] transition-colors">
            View Tenants
          </a>
          <button
            onClick={() => { setImported(null); setStep(1); setPlatform(null); resetUpload() }}
            className="px-5 py-2.5 rounded-xl bg-white/5 text-[#9ca3af] text-sm font-semibold hover:bg-white/10 transition-colors border border-white/10"
          >
            Import More
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step === s ? "bg-[#60a5fa] text-black" :
              step > s  ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-[#1e2d45] text-[#4b5563]"
            }`}>
              {step > s ? <CheckCircle2 size={12} /> : s}
            </div>
            <span className={`text-xs font-medium ${step === s ? "text-white" : "text-[#374151]"}`}>
              {["Select Source", "Instructions", "Upload & Import"][i]}
            </span>
            {i < 2 && <ChevronRight size={12} className="text-[#1e2d45]" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Platform selection ── */}
      {step === 1 && (
        <div>
          <h2 className="text-white font-semibold text-base mb-1">Where is your data coming from?</h2>
          <p className="text-[#4b5563] text-sm mb-6">
            RentSentry will give you exact export instructions for your software.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PLATFORMS.map(p => {
              const c = PLATFORM_CONFIGS[p]
              return (
                <button
                  key={p}
                  onClick={() => { setPlatform(p); setStep(2) }}
                  className="text-left bg-[#111827] border border-white/10 rounded-2xl p-4 hover:border-[#60a5fa]/40 hover:bg-[#131929] transition-all group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-[#1e2d45] flex items-center justify-center text-[#60a5fa] text-xs font-bold shrink-0">
                      {PLATFORM_ICONS[p]}
                    </div>
                    <div>
                      <div className="text-white font-semibold text-sm group-hover:text-[#60a5fa] transition-colors">{c.name}</div>
                      <div className="text-[#374151] text-xs">{c.tagline}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.autoFills.slice(0, 4).map(f => (
                      <span key={f} className="text-[10px] bg-emerald-500/8 text-emerald-600 px-1.5 py-0.5 rounded">
                        {FIELD_LABELS[f] ?? f}
                      </span>
                    ))}
                    {c.autoFills.length > 4 && (
                      <span className="text-[10px] text-[#374151]">+{c.autoFills.length - 4} more</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Step 2: Instructions ── */}
      {step === 2 && cfg && (
        <div>
          <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-[#4b5563] hover:text-white text-sm transition-colors mb-6">
            <ArrowLeft size={13} /> Back
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#1e2d45] flex items-center justify-center text-[#60a5fa] text-sm font-bold">
              {PLATFORM_ICONS[platform!]}
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">{cfg.name} — Export Instructions</h2>
              <p className="text-[#4b5563] text-xs">{cfg.tagline}</p>
            </div>
          </div>

          <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-4">
            <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-3">How to export</div>
            <ol className="space-y-2.5">
              {cfg.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-[#1e2d45] text-[#60a5fa] text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-[#9ca3af] text-sm leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="bg-[#111827] border border-emerald-500/15 rounded-2xl p-4">
              <div className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-3">Auto-fills from CSV</div>
              <div className="space-y-1.5">
                {cfg.autoFills.map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm text-[#9ca3af]">
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    {FIELD_LABELS[f] ?? f}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
              <div className="text-[#4b5563] text-xs font-semibold uppercase tracking-wide mb-3">Needs manual entry</div>
              <div className="space-y-2">
                {cfg.manualFields.length === 0 && (
                  <div className="text-[#374151] text-xs">Template covers all fields</div>
                )}
                {cfg.manualFields.map(f => (
                  <div key={f.field}>
                    <div className="text-[#6b7280] text-sm">{f.field}</div>
                    <div className="text-[#374151] text-[11px]">{f.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {cfg.tips.length > 0 && (
            <div className="bg-[#0d1117] border border-white/5 rounded-xl p-4 mb-5">
              <div className="text-[#4b5563] text-xs uppercase tracking-wide mb-2">Tips</div>
              <ul className="space-y-1.5">
                {cfg.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-[#4b5563] text-xs">
                    <span className="w-1 h-1 rounded-full bg-[#374151] shrink-0 mt-1.5" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            {platform === "excel" && (
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[#9ca3af] text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                <Download size={14} /> Download Template
              </button>
            )}
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-2.5 rounded-xl bg-[#60a5fa] hover:bg-[#3b82f6] text-black text-sm font-semibold transition-colors"
            >
              Continue to Upload
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Upload + preview ── */}
      {step === 3 && cfg && (
        <div>
          <button
            onClick={() => { setStep(2); resetUpload() }}
            className="flex items-center gap-1.5 text-[#4b5563] hover:text-white text-sm transition-colors mb-6"
          >
            <ArrowLeft size={13} /> Back
          </button>

          <h2 className="text-white font-semibold text-base mb-1">Upload your CSV</h2>
          <p className="text-[#4b5563] text-sm mb-5">
            {platform === "excel"
              ? "Upload your filled RentSentry template."
              : `Upload the ${cfg.name} Rent Roll export.`}
          </p>

          {/* ── Parse error ── */}
          {parseError && (
            <ParseErrorCard
              error={parseError}
              platform={platform!}
              onRetry={triggerFilePicker}
              onBack={() => { resetUpload(); setStep(2) }}
            />
          )}

          {/* ── No columns matched ── */}
          {!parseError && noMappedColumns && headers.length > 0 && (
            <div className="bg-[#1a0a0a] border border-orange-500/25 rounded-2xl p-5 mb-4">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle size={16} className="text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-orange-300 font-semibold text-sm mb-1">Wrong report — no columns matched</div>
                  <p className="text-[#9ca3af] text-xs leading-relaxed">
                    RentSentry found {headers.length} column{headers.length !== 1 ? "s" : ""} but couldn&apos;t identify tenant names or unit numbers. You may have uploaded the wrong report (e.g. a financial statement or owner report instead of a Rent Roll), or this export has custom column names.
                  </p>
                </div>
              </div>
              <div className="bg-[#0d1117] border border-white/5 rounded-xl p-3 mb-4">
                <div className="text-[#4b5563] text-xs mb-2">Columns found in your file — use the dropdowns below to assign them manually:</div>
                <div className="flex flex-wrap gap-1.5">
                  {headers.map(h => (
                    <span key={h} className="text-xs bg-[#1e2d45] text-[#6b7280] px-2 py-1 rounded">{h}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-2 mb-4">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-3">
                    <span className="text-[#6b7280] text-xs w-40 truncate shrink-0">{h}</span>
                    <ChevronRight size={12} className="text-[#374151] shrink-0" />
                    <select
                      value={columnMapping[h] ?? ""}
                      onChange={e => updateMapping(h, e.target.value)}
                      className="flex-1 bg-[#0d1220] border border-[#1e2d45] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2e4060]"
                    >
                      <option value="">— Skip —</option>
                      {Object.entries(FIELD_LABELS).map(([field, label]) => (
                        <option key={field} value={field}>{label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={triggerFilePicker}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-sm font-semibold hover:bg-orange-500/15 transition-colors"
                >
                  Try a different file
                </button>
                <button
                  onClick={() => { resetUpload(); setStep(2) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[#9ca3af] text-sm hover:bg-white/10 transition-colors"
                >
                  Re-read instructions
                </button>
              </div>
            </div>
          )}

          {/* ── Upload zone ── */}
          {!parseError && !noMappedColumns && parsedRows.length === 0 && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={triggerFilePicker}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-[#60a5fa] bg-[#60a5fa]/5"
                  : "border-[#1e2d45] hover:border-[#2e4060] hover:bg-white/[0.02]"
              }`}
            >
              <Upload size={28} className="text-[#374151] mx-auto mb-3" />
              <div className="text-white text-sm font-semibold mb-1">Drop your CSV here or click to browse</div>
              <div className="text-[#4b5563] text-xs">.csv files only — convert .xlsx in Excel first (File → Save As → CSV)</div>
            </div>
          )}

          {/* Shared hidden input */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
              if (fileRef.current) fileRef.current.value = ""
            }}
          />

          {/* ── Preview + import ── */}
          {!parseError && !noMappedColumns && parsedRows.length > 0 && (
            <div>
              {/* Column mapping */}
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white font-semibold text-sm">Column Mapping</div>
                  <button onClick={resetUpload} className="text-[#4b5563] hover:text-white transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-2">
                  {headers.map(h => (
                    <div key={h} className="flex items-center gap-3">
                      <span className="text-[#6b7280] text-xs w-40 truncate shrink-0">{h}</span>
                      <ChevronRight size={12} className="text-[#374151] shrink-0" />
                      <select
                        value={columnMapping[h] ?? ""}
                        onChange={e => updateMapping(h, e.target.value)}
                        className="flex-1 bg-[#0d1220] border border-[#1e2d45] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2e4060]"
                      >
                        <option value="">— Skip —</option>
                        {Object.entries(FIELD_LABELS).map(([field, label]) => (
                          <option key={field} value={field}>{label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Property selector */}
              {properties.length > 0 && (
                <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-4">
                  <div className="text-white font-semibold text-sm mb-3">Assign to Property</div>
                  <select
                    value={propertyId}
                    onChange={e => setPropertyId(e.target.value)}
                    className="w-full bg-[#0d1220] border border-[#1e2d45] text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#2e4060]"
                  >
                    <option value="">No property (assign later)</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Preview table */}
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white font-semibold text-sm">
                    Preview — {parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""} found
                  </div>
                  <div className="flex items-center gap-3">
                    {validRows.length > 0 && <span className="text-emerald-400 text-xs">{validRows.length} valid</span>}
                    {errorRows.length > 0 && <span className="text-red-400 text-xs">{errorRows.length} with errors</span>}
                  </div>
                </div>

                {validRows.length === 0 && (
                  <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/15 rounded-xl p-3 mb-3">
                    <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-red-300 text-xs font-semibold mb-0.5">All rows have errors</div>
                      <div className="text-[#9ca3af] text-xs">
                        Every row is missing a tenant name or unit number. Check that the column mapping above is correct — the &ldquo;Tenant Name&rdquo; and &ldquo;Unit&rdquo; columns must be assigned.
                      </div>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left text-[#4b5563] py-2 pr-4 font-medium">Name</th>
                        <th className="text-left text-[#4b5563] py-2 pr-4 font-medium">Unit</th>
                        <th className="text-left text-[#4b5563] py-2 pr-4 font-medium">Rent</th>
                        <th className="text-left text-[#4b5563] py-2 pr-4 font-medium">Balance</th>
                        <th className="text-left text-[#4b5563] py-2 pr-4 font-medium">Lease End</th>
                        <th className="text-left text-[#4b5563] py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="border-b border-white/[0.04]">
                          <td className="py-2 pr-4 text-white">{r.name || <span className="text-red-400">missing</span>}</td>
                          <td className="py-2 pr-4 text-[#9ca3af]">{r.unit || <span className="text-red-400">missing</span>}</td>
                          <td className="py-2 pr-4 text-[#9ca3af]">{r.rent_amount ? `$${r.rent_amount.toLocaleString()}` : "—"}</td>
                          <td className="py-2 pr-4 text-[#9ca3af]">{r.balance_due ? `$${r.balance_due.toLocaleString()}` : "—"}</td>
                          <td className="py-2 pr-4 text-[#9ca3af]">{r.lease_end ?? "—"}</td>
                          <td className="py-2">
                            {r._errors?.length ? (
                              <span className="text-red-400 flex items-center gap-1">
                                <AlertTriangle size={10} /> {r._errors[0]}
                              </span>
                            ) : (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 size={10} /> Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedRows.length > 10 && (
                    <div className="text-[#374151] text-[11px] mt-2">
                      + {parsedRows.length - 10} more rows not shown
                    </div>
                  )}
                </div>
              </div>

              {importError && (
                <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                  <AlertTriangle size={14} className="text-red-400 shrink-0" />
                  <span className="text-red-400 text-sm">{importError}</span>
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={loading || validRows.length === 0}
                className="w-full py-3 rounded-xl bg-[#60a5fa] hover:bg-[#3b82f6] text-black text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Importing…" : `Import ${validRows.length} Tenant${validRows.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
