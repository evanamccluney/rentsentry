"use client"
import { useState, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { parseCSV, detectColumns, mapRow, type MappedTenant } from "@/lib/csv-parser"
import { scoreTenant } from "@/lib/risk-engine"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Upload, CheckCircle, AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react"
import Link from "next/link"

type Step = "upload" | "mapping" | "preview" | "importing" | "done"

const RISK_COLORS: Record<string, string> = {
  green: "bg-green-500 text-black",
  yellow: "bg-yellow-400 text-black",
  red: "bg-red-500 text-white",
}

const RISK_LABELS: Record<string, string> = {
  green: "Low Risk",
  yellow: "At Risk",
  red: "High Risk",
}

export default function PropertyUploadPage() {
  const router = useRouter()
  const params = useParams()
  const propertyId = params.id as string

  const [step, setStep] = useState<Step>("upload")
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [preview, setPreview] = useState<(MappedTenant & { risk_score: string; risk_reasons: string[] })[]>([])
  const [importedCount, setImportedCount] = useState(0)

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCSV(text)
      if (!headers.length) { toast.error("Could not parse CSV. Check the file format."); return }
      const detected = detectColumns(headers)
      setHeaders(headers)
      setRawRows(rows)
      setMapping(detected as Record<string, string | null>)
      setStep("mapping")
    }
    reader.readAsText(file)
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith(".csv")) handleFile(file)
    else toast.error("Please upload a CSV file.")
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function buildPreview() {
    const mapped = rawRows.slice(0, 200).map(row => {
      const tenant = mapRow(row, mapping as Record<string, string | null>)
      const { score, reasons } = scoreTenant(tenant)
      return { ...tenant, risk_score: score, risk_reasons: reasons }
    })
    setPreview(mapped)
    setStep("preview")
  }

  async function handleImport() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error("Not authenticated."); return }

    setStep("importing")

    if (replaceExisting) {
      await supabase.from("tenants").delete().eq("property_id", propertyId).eq("user_id", user.id)
    }

    const batchSize = 50
    let inserted = 0
    for (let i = 0; i < preview.length; i += batchSize) {
      const batch = preview.slice(i, i + batchSize).map((t, idx) => ({
        property_id: propertyId,
        user_id: user.id,
        unit: t.unit || `Unit ${i + idx + 1}`,
        name: t.name || "Unknown",
        email: t.email,
        phone: t.phone,
        rent_amount: t.rent_amount,
        lease_start: t.lease_start || null,
        lease_end: t.lease_end || null,
        payment_method: t.payment_method,
        card_expiry: t.card_expiry || null,
        days_late_avg: t.days_late_avg,
        late_payment_count: t.late_payment_count,
        previous_delinquency: t.previous_delinquency,
        balance_due: t.balance_due,
        last_payment_date: t.last_payment_date || null,
        move_in_date: t.move_in_date || null,
        move_out_date: t.move_out_date || null,
        risk_score: t.risk_score,
        risk_reasons: t.risk_reasons,
        status: t.move_out_date ? "vacated" : "active",
      }))
      const { error } = await supabase.from("tenants").insert(batch)
      if (!error) inserted += batch.length
    }

    await supabase.from("properties").update({ total_units: inserted }).eq("id", propertyId)

    setImportedCount(inserted)
    toast.success(`${inserted} tenants imported successfully.`)
    setStep("done")
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CheckCircle className="text-green-400 w-16 h-16 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Import Complete</h2>
        <p className="text-[#9ca3af] mb-6">{importedCount} tenants scored and ready for review.</p>
        <div className="flex gap-3">
          <Button onClick={() => router.push("/dashboard/tenants")} className="bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold">
            View Tenant Board
          </Button>
          <Button variant="outline" onClick={() => { setStep("upload"); setPreview([]) }} className="border-[#1e2d45] text-white hover:bg-[#131929]">
            Upload Another
          </Button>
        </div>
      </div>
    )
  }

  if (step === "importing") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 border-4 border-[#60a5fa] border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-bold text-white mb-1">Importing & Scoring…</h2>
        <p className="text-[#9ca3af] text-sm">Running risk analysis on {preview.length} tenants</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/dashboard/properties/${propertyId}`} className="text-[#9ca3af] hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Upload Rent Roll</h1>
          <p className="text-[#9ca3af] text-sm mt-1">Import from AppFolio, Buildium, Yardi, or any PM software</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        {["upload", "mapping", "preview"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step === s
                ? "bg-[#60a5fa] text-black"
                : ["mapping", "preview"].indexOf(step) > ["upload", "mapping", "preview"].indexOf(s)
                  ? "bg-green-500 text-black"
                  : "bg-[#1e2d45] text-[#9ca3af]"
            }`}>
              {i + 1}
            </div>
            <span className={step === s ? "text-white font-medium" : "text-[#9ca3af]"}>
              {s === "upload" ? "Upload" : s === "mapping" ? "Map Columns" : "Preview & Import"}
            </span>
            {i < 2 && <span className="text-[#1e2d45] mx-1">→</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-[#1e2d45] hover:border-[#60a5fa] rounded-xl p-16 text-center transition-colors cursor-pointer"
          onClick={() => document.getElementById("csv-input")?.click()}
        >
          <Upload className="w-10 h-10 text-[#60a5fa] mx-auto mb-4" />
          <h2 className="text-white font-semibold text-lg mb-1">Drag & drop your rent roll</h2>
          <p className="text-[#9ca3af] text-sm mb-4">AppFolio, Buildium, Yardi, and Excel exports all work</p>
          <input id="csv-input" type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
          <Button className="bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold">Choose File</Button>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === "mapping" && (
        <div className="bg-[#131929] border border-[#1e2d45] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-green-400 w-5 h-5" />
            <span className="text-white font-semibold">Smart column detection complete — {rawRows.length} rows found</span>
          </div>
          <p className="text-[#9ca3af] text-sm mb-6">Review the detected column mapping. Adjust any that are incorrect.</p>

          {/* Replace toggle */}
          <div className="mb-6 pb-6 border-b border-[#1e2d45]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">If tenants already exist for this property</p>
                <p className="text-[#4b5563] text-xs mt-0.5">
                  {replaceExisting ? "Replace all existing records with this CSV" : "Add new tenants on top of existing records"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setReplaceExisting(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    !replaceExisting ? "bg-[#1a2744] text-[#60a5fa] border-[#60a5fa]" : "border-[#1e2d45] text-[#9ca3af] hover:border-[#60a5fa]"
                  }`}
                >
                  <RefreshCw size={11} className="inline mr-1" />Add on top
                </button>
                <button
                  onClick={() => setReplaceExisting(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    replaceExisting ? "bg-[#1a2744] text-[#60a5fa] border-[#60a5fa]" : "border-[#1e2d45] text-[#9ca3af] hover:border-[#60a5fa]"
                  }`}
                >
                  Replace all
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {Object.entries(mapping)
              .filter(([field]) => field !== "property_name")
              .map(([field, col]) => (
                <div key={field} className="flex items-center gap-3">
                  <span className="text-[#9ca3af] text-xs w-36 shrink-0 capitalize">{field.replace(/_/g, " ")}</span>
                  <select
                    value={col || ""}
                    onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value || null }))}
                    className="flex-1 bg-[#0a0e1a] border border-[#1e2d45] text-white text-xs rounded-md px-2 py-1.5"
                  >
                    <option value="">— not mapped —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
          </div>

          <div className="flex gap-3">
            <Button onClick={buildPreview} className="bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold">
              Run Risk Analysis →
            </Button>
            <Button variant="outline" onClick={() => setStep("upload")} className="border-[#1e2d45] text-white hover:bg-[#131929]">
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && (
        <div>
          <div className="bg-[#131929] border border-[#1e2d45] rounded-xl p-6 mb-6">
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-[#9ca3af]">{preview.filter(t => t.risk_score === "green").length} Low Risk</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="text-sm text-[#9ca3af]">{preview.filter(t => t.risk_score === "yellow").length} At Risk</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm text-[#9ca3af]">{preview.filter(t => t.risk_score === "red").length} High Risk</span>
              </div>
              {preview.filter(t => t.risk_score !== "green").length > 0 && (
                <div className="flex items-center gap-1.5 text-yellow-400 text-sm ml-auto">
                  <AlertTriangle size={14} />
                  {preview.filter(t => t.risk_score !== "green").length} tenants need attention
                </div>
              )}
            </div>

            {replaceExisting && (
              <div className="flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-4 py-2.5 mb-4">
                <AlertTriangle size={13} className="text-yellow-400 shrink-0" />
                <span className="text-yellow-400 text-xs">Existing tenants for this property will be replaced.</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleImport} className="bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold">
                Import {preview.length} Tenants →
              </Button>
              <Button variant="outline" onClick={() => setStep("mapping")} className="border-[#1e2d45] text-white hover:bg-[#131929]">
                Back
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#1e2d45]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0d1220] text-[#9ca3af] text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Unit</th>
                  <th className="px-4 py-3 text-left">Tenant</th>
                  <th className="px-4 py-3 text-left">Rent</th>
                  <th className="px-4 py-3 text-left">Balance Due</th>
                  <th className="px-4 py-3 text-left">Risk</th>
                  <th className="px-4 py-3 text-left">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((t, i) => (
                  <tr key={i} className="border-t border-[#1e2d45] hover:bg-[#131929]">
                    <td className="px-4 py-3 text-white font-mono text-xs">{t.unit || "—"}</td>
                    <td className="px-4 py-3 text-white">{t.name || "—"}</td>
                    <td className="px-4 py-3 text-white">${t.rent_amount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {t.balance_due > 0
                        ? <span className="text-red-400">${t.balance_due.toLocaleString()}</span>
                        : <span className="text-[#9ca3af]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${RISK_COLORS[t.risk_score]} text-xs`}>
                        {RISK_LABELS[t.risk_score]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[#9ca3af] text-xs max-w-xs">
                      {t.risk_reasons.join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 50 && (
              <div className="px-4 py-2 text-[#9ca3af] text-xs bg-[#0d1220] border-t border-[#1e2d45]">
                Showing 50 of {preview.length} rows — all will be imported
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
