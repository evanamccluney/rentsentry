"use client"
import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { parseCSV, detectColumns, detectHistoryColumns, isHistoricalCSV, aggregateHistoricalRows, mapRow, type MappedTenant } from "@/lib/csv-parser"
import { scoreTenant } from "@/lib/risk-engine"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Upload, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react"

type ExistingProperty = { id: string; name: string; state: string | null }
type Step = "upload" | "mapping" | "preview" | "importing" | "done"

type ChangeType = "paid" | "improved" | "worsened" | "new" | "unchanged"
interface ChangeInfo { type: ChangeType; prevBalance: number }
type PreviewTenant = MappedTenant & { risk_score: string; risk_reasons: string[]; change?: ChangeInfo; _editingRent?: boolean }

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

function nameFromFilename(filename: string): string {
  return filename
    .replace(/\.(csv|xlsx?)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export default function UploadPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("upload")
  const [propertyName, setPropertyName] = useState("")
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [historyMapping, setHistoryMapping] = useState<Record<string, string | null>>({})
  const [isHistorical, setIsHistorical] = useState(false)
  const [preview, setPreview] = useState<PreviewTenant[]>([])
  const [changeMap, setChangeMap] = useState<Map<string, ChangeInfo>>(new Map())
  const [importedCount, setImportedCount] = useState(0)
  const [defaultRent, setDefaultRent] = useState("")
  const [existingProperties, setExistingProperties] = useState<ExistingProperty[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("__new__")

  useEffect(() => {
    async function loadProperties() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("properties")
        .select("id, name, state")
        .eq("user_id", user.id)
        .order("name")
      if (data && data.length > 0) {
        setExistingProperties(data)
        setSelectedPropertyId(data[0].id)
        setPropertyName(data[0].name)
      }
    }
    loadProperties()
  }, [])

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCSV(text)
      if (!headers.length) { toast.error("Could not parse CSV. Check the file format."); return }
      const detected = detectColumns(headers)
      const detectedHistory = detectHistoryColumns(headers)
      const historical = isHistoricalCSV(rows, detected as Record<keyof MappedTenant, string | null>)

      // Auto-detect property name from first data row if column exists
      const propCol = detected.property_name
      const detectedPropertyName = propCol && rows[0]?.[propCol] ? rows[0][propCol] : ""

      setPropertyName(detectedPropertyName || nameFromFilename(file.name))
      setHeaders(headers)
      setRawRows(rows)
      setMapping(detected as Record<string, string | null>)
      setHistoryMapping(detectedHistory)
      setIsHistorical(historical)
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

  async function buildPreview() {
    if (selectedPropertyId === "__new__" && !propertyName.trim()) { toast.error("Enter a property name."); return }

    // Fetch existing balances for this property to detect what changed
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const newChangeMap = new Map<string, ChangeInfo>()

    if (user) {
      let existingProp: { id: string } | null = null
      if (selectedPropertyId !== "__new__") {
        existingProp = { id: selectedPropertyId }
      } else {
        const { data } = await supabase
          .from("properties")
          .select("id")
          .eq("user_id", user.id)
          .ilike("name", propertyName.trim())
          .maybeSingle()
        existingProp = data
      }

      if (existingProp) {
        const { data: existingTenants } = await supabase
          .from("tenants")
          .select("unit, balance_due")
          .eq("property_id", existingProp.id)
          .eq("user_id", user.id)

        if (existingTenants) {
          const existingMap = new Map<string, number>()
          for (const t of existingTenants) {
            existingMap.set((t.unit ?? "").toLowerCase().trim(), t.balance_due ?? 0)
          }

          for (const row of rawRows.slice(0, 200)) {
            const tenant = mapRow(row, mapping as Record<string, string | null>)
            const unitKey = (tenant.unit ?? "").toLowerCase().trim()
            const prevBalance = existingMap.get(unitKey)

            if (prevBalance === undefined) {
              newChangeMap.set(unitKey, { type: "new", prevBalance: 0 })
            } else {
              const newBal = tenant.balance_due
              const delta = newBal - prevBalance
              let type: ChangeType
              if (prevBalance > 0 && newBal === 0) type = "paid"
              else if (delta < 0) type = "improved"
              else if (delta > 0) type = "worsened"
              else type = "unchanged"
              newChangeMap.set(unitKey, { type, prevBalance })
            }
          }
        }
      }
    }

    setChangeMap(newChangeMap)

    // If historical CSV, aggregate rows per tenant — otherwise map one row per tenant
    const tenants: MappedTenant[] = isHistorical
      ? aggregateHistoricalRows(rawRows, mapping as Record<keyof MappedTenant, string | null>, historyMapping)
      : rawRows.slice(0, 200).map(row => mapRow(row, mapping as Record<string, string | null>))

    const mapped = tenants.map(tenant => {
      const { score, reasons } = scoreTenant(tenant)
      const unitKey = (tenant.unit ?? "").toLowerCase().trim()
      return { ...tenant, risk_score: score, risk_reasons: reasons, change: newChangeMap.get(unitKey) }
    })
    setPreview(mapped)
    setStep("preview")
  }

  async function handleImport() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error("Not authenticated."); return }

    setStep("importing")

    // Use selected property or create new one
    let resolvedPropertyId: string | undefined

    if (selectedPropertyId !== "__new__") {
      resolvedPropertyId = selectedPropertyId
    } else {
      const { data: existing } = await supabase
        .from("properties")
        .select("id")
        .eq("user_id", user.id)
        .ilike("name", propertyName.trim())
        .maybeSingle()

      resolvedPropertyId = existing?.id

      if (!resolvedPropertyId) {
        const { data: created, error: createError } = await supabase
          .from("properties")
          .insert({ user_id: user.id, name: propertyName.trim() })
          .select("id")
          .single()

        if (createError || !created) {
          toast.error("Could not create property.")
          setStep("preview")
          return
        }
        resolvedPropertyId = created.id
      }
    }

    // Delete only the units present in this CSV (preserves tenants not in this upload)
    // On "Full refresh", also mark any remaining tenants as vacated
    const incomingUnits = preview.map(t => t.unit).filter(Boolean) as string[]

    if (incomingUnits.length > 0) {
      await supabase
        .from("tenants")
        .delete()
        .eq("property_id", resolvedPropertyId!)
        .eq("user_id", user.id)
        .in("unit", incomingUnits)
    }

    if (replaceExisting) {
      // Mark any tenants NOT in this CSV as vacated
      await supabase
        .from("tenants")
        .update({ status: "vacated" })
        .eq("property_id", resolvedPropertyId!)
        .eq("user_id", user.id)
        .not("unit", "in", `(${incomingUnits.map(u => `"${u}"`).join(",")})`)
    }

    // Batch insert all tenants from this CSV fresh
    const batchSize = 50
    let inserted = 0
    for (let i = 0; i < preview.length; i += batchSize) {
      const batch = preview.slice(i, i + batchSize).map((t, idx) => ({
        property_id: resolvedPropertyId!,
        user_id: user.id,
        unit: t.unit || `Unit ${i + idx + 1}`,
        name: t.name || "Unknown",
        email: t.email || null,
        phone: t.phone || null,
        rent_amount: t.rent_amount,
        lease_start: t.lease_start || null,
        lease_end: t.lease_end || null,
        payment_method: t.payment_method || "unknown",
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
      if (error) {
        toast.error(`Import failed: ${error.message}`)
        setStep("preview")
        return
      }
      inserted += batch.length
    }

    await supabase
      .from("properties")
      .update({ total_units: inserted })
      .eq("id", resolvedPropertyId)

    // Auto-log payments for tenants whose balance cleared to $0
    const paidUnits = [...changeMap.entries()]
      .filter(([, v]) => v.type === "paid" && v.prevBalance > 0)

    if (paidUnits.length > 0) {
      const { data: freshTenants } = await supabase
        .from("tenants")
        .select("id, unit")
        .eq("property_id", resolvedPropertyId)
        .eq("user_id", user.id)
        .in("unit", paidUnits.map(([unit]) => unit))

      if (freshTenants && freshTenants.length > 0) {
        const paymentRecords = freshTenants.flatMap(t => {
          const entry = paidUnits.find(([unit]) => unit === (t.unit ?? "").toLowerCase().trim())
          if (!entry || !entry[1].prevBalance) return []
          return [{
            tenant_id: t.id,
            user_id: user.id,
            amount: entry[1].prevBalance,
            date: new Date().toISOString().split("T")[0],
            note: "Auto-detected — balance cleared on upload",
          }]
        })
        if (paymentRecords.length > 0) {
          await supabase.from("payments").insert(paymentRecords)
        }
      }
    }

    setImportedCount(inserted)

    // Send PM alert SMS if alerts are enabled — based on fresh import data
    const delinquent = preview
      .filter(t => (t.balance_due ?? 0) > 0)
      .map(t => ({
        name: t.name,
        balance_due: t.balance_due ?? 0,
        days_past_due: t.last_payment_date
          ? Math.floor((Date.now() - new Date(t.last_payment_date).getTime()) / 86400000)
          : 0,
        rent_amount: t.rent_amount ?? 0,
      }))

    if (delinquent.length > 0) {
      fetch("/api/pm-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delinquent }),
      }).catch(() => {}) // fire and forget — don't block the UI
    }

    toast.success(`${inserted} tenants imported to ${propertyName}.`)
    setStep("done")
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CheckCircle className="text-green-400 w-16 h-16 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Import Complete</h2>
        <p className="text-[#9ca3af] mb-2">
          {importedCount} tenants imported to{" "}
          <span className="text-white">{propertyName}</span>.
        </p>
        {[...changeMap.values()].filter(v => v.type === "paid").length > 0 && (
          <p className="text-emerald-400 text-sm mb-4">
            {[...changeMap.values()].filter(v => v.type === "paid").length} payment{[...changeMap.values()].filter(v => v.type === "paid").length !== 1 ? "s" : ""} auto-logged — balances cleared.
          </p>
        )}
        <div className="flex gap-3">
          <Button onClick={() => router.push("/dashboard/tenants")} className="bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold">
            View All Tenants
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Upload Rent Roll</h1>
        <p className="text-[#9ca3af] text-sm mt-1">Import from AppFolio, Buildium, Yardi, or any PM software</p>
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
          <Button className="bg-[#60a5fa] hover:bg-[#3b82f6] text-black font-semibold">
            Choose File
          </Button>
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

          {/* Property selection */}
          <div className="mb-6 pb-6 border-b border-[#1e2d45]">
            <label className="text-white font-medium text-sm block mb-2">Property</label>
            {existingProperties.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={selectedPropertyId}
                  onChange={e => {
                    setSelectedPropertyId(e.target.value)
                    if (e.target.value !== "__new__") {
                      const p = existingProperties.find(p => p.id === e.target.value)
                      if (p) setPropertyName(p.name)
                    }
                  }}
                  className="w-full max-w-sm bg-[#0a0e1a] border border-[#1e2d45] text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#60a5fa]"
                >
                  {existingProperties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.state ? ` (${p.state})` : ""}</option>
                  ))}
                  <option value="__new__">+ Create new property…</option>
                </select>
                {selectedPropertyId === "__new__" && (
                  <input
                    value={propertyName}
                    onChange={e => setPropertyName(e.target.value)}
                    placeholder="New property name"
                    autoFocus
                    className="w-full max-w-sm bg-[#0a0e1a] border border-[#1e2d45] text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#60a5fa]"
                  />
                )}
              </div>
            ) : (
              <input
                value={propertyName}
                onChange={e => setPropertyName(e.target.value)}
                placeholder="e.g. Oakwood Apartments"
                className="w-full max-w-sm bg-[#0a0e1a] border border-[#1e2d45] text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#60a5fa]"
              />
            )}
          </div>

          {/* Re-upload toggle */}
          <div className="mb-6 pb-6 border-b border-[#1e2d45]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">Existing tenants for this property</p>
                <p className="text-[#4b5563] text-xs mt-0.5">
                  {replaceExisting
                    ? "Tenants not in this CSV will be marked as vacated"
                    : "Existing tenants updated, new ones added — nothing removed"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setReplaceExisting(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    !replaceExisting ? "bg-[#1a2744] text-[#60a5fa] border-[#60a5fa]" : "border-[#1e2d45] text-[#9ca3af] hover:border-[#60a5fa]"
                  }`}
                >
                  <RefreshCw size={11} className="inline mr-1" />Update existing
                </button>
                <button
                  onClick={() => setReplaceExisting(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    replaceExisting ? "bg-[#1a2744] text-[#60a5fa] border-[#60a5fa]" : "border-[#1e2d45] text-[#9ca3af] hover:border-[#60a5fa]"
                  }`}
                >
                  Full refresh
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
          {/* Missing rent amount warning */}
          {preview.some(t => !t.rent_amount) && (
            <div className="mb-4 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="text-orange-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-orange-400 text-sm font-semibold">
                    Rent amount missing for {preview.filter(t => !t.rent_amount).length} tenant{preview.filter(t => !t.rent_amount).length !== 1 ? "s" : ""}
                  </p>
                  <p className="text-[#6b7280] text-xs mt-0.5 mb-3">
                    Your CSV didn't include a rent amount column. Without it, risk scoring will be less accurate. Set a default below, edit individual rows in the table, or ask the AI assistant to help.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[#9ca3af] text-xs shrink-0">Set all missing to $</span>
                    <input
                      type="number"
                      placeholder="e.g. 1500"
                      value={defaultRent}
                      onChange={e => setDefaultRent(e.target.value)}
                      className="w-28 bg-[#0a0e1a] border border-white/10 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500/40"
                    />
                    <button
                      onClick={() => {
                        const amt = parseFloat(defaultRent)
                        if (!amt || amt <= 0) return
                        setPreview(prev => prev.map(t => t.rent_amount ? t : { ...t, rent_amount: amt }))
                        setDefaultRent("")
                      }}
                      className="bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Apply
                    </button>
                    <span className="text-[#4b5563] text-xs">or click any $0 in the table to edit individually</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Historical CSV banner */}
          {isHistorical && (
            <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-blue-400 text-lg">📊</span>
              <div>
                <p className="text-blue-400 text-sm font-semibold">Historical data detected</p>
                <p className="text-[#6b7280] text-xs mt-0.5">Multiple months of data found. RentSentry automatically calculated late payment count, average days late, and delinquency history from your full payment history — the AI advisor will use all of it.</p>
              </div>
            </div>
          )}
          {/* Changes summary — only shown when comparing against a previous upload */}
          {changeMap.size > 0 && (() => {
            const paid      = preview.filter(t => t.change?.type === "paid")
            const worsened  = preview.filter(t => t.change?.type === "worsened")
            const improved  = preview.filter(t => t.change?.type === "improved")
            const isFirstUpload = preview.every(t => t.change?.type === "new" || !t.change)
            if (isFirstUpload) return null
            return (
              <div className="bg-[#0d1628] border border-white/10 rounded-xl px-5 py-4 mb-5 flex items-start gap-4 flex-wrap">
                <div>
                  <p className="text-white text-sm font-semibold mb-1">Changes since last upload</p>
                  <div className="flex items-center gap-4 flex-wrap">
                    {paid.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-emerald-400 text-sm font-medium">{paid.length} paid</span>
                        <span className="text-[#4b5563] text-xs">
                          (${paid.reduce((s, t) => s + (t.change?.prevBalance ?? 0), 0).toLocaleString()} cleared)
                        </span>
                      </div>
                    )}
                    {improved.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                        <span className="text-blue-400 text-sm">{improved.length} balance reduced</span>
                      </div>
                    )}
                    {worsened.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <span className="text-red-400 text-sm">{worsened.length} balance increased</span>
                      </div>
                    )}
                    {paid.length === 0 && improved.length === 0 && worsened.length === 0 && (
                      <span className="text-[#4b5563] text-sm">No balance changes detected</span>
                    )}
                  </div>
                  {paid.length > 0 && (
                    <p className="text-[#4b5563] text-xs mt-1.5">Payments will be auto-logged for {paid.length} tenant{paid.length !== 1 ? "s" : ""} on import</p>
                  )}
                </div>
              </div>
            )
          })()}

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

            <p className="text-[#9ca3af] text-sm mb-4">
              Importing <span className="text-white">{preview.length} tenants</span> to{" "}
              <span className="text-white">{propertyName}</span>
              {replaceExisting ? " — existing records will be replaced." : " — adding on top of existing records."}
            </p>

            {replaceExisting && (
              <div className="flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-4 py-2.5 mb-4">
                <AlertTriangle size={13} className="text-yellow-400 shrink-0" />
                <span className="text-yellow-400 text-xs">
                  Full refresh — tenants not in this CSV will be marked as vacated. No data is deleted.
                </span>
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
                  {changeMap.size > 0 && <th className="px-4 py-3 text-left">Since Last Upload</th>}
                  <th className="px-4 py-3 text-left">Risk</th>
                  <th className="px-4 py-3 text-left">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((t, i) => (
                  <tr key={i} className="border-t border-[#1e2d45] hover:bg-[#131929]">
                    <td className="px-4 py-3 text-white font-mono text-xs">{t.unit || "—"}</td>
                    <td className="px-4 py-3 text-white">{t.name || "—"}</td>
                    <td className="px-4 py-3">
                      {t._editingRent ? (
                        <input
                          type="number"
                          autoFocus
                          defaultValue={t.rent_amount || ""}
                          placeholder="0"
                          className="w-24 bg-[#0a0e1a] border border-blue-500/40 text-white text-sm rounded-lg px-2 py-1 focus:outline-none"
                          onBlur={e => {
                            const val = parseFloat(e.target.value) || 0
                            setPreview(prev => prev.map((p, pi) => pi === i ? { ...p, rent_amount: val, _editingRent: false } : p))
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                            if (e.key === "Escape") setPreview(prev => prev.map((p, pi) => pi === i ? { ...p, _editingRent: false } : p))
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => setPreview(prev => prev.map((p, pi) => pi === i ? { ...p, _editingRent: true } : p))}
                          className={`text-left hover:underline ${t.rent_amount ? "text-white" : "text-orange-400 font-medium"}`}
                          title="Click to edit"
                        >
                          {t.rent_amount ? `$${t.rent_amount.toLocaleString()}` : "$0 — click to set"}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.balance_due > 0
                        ? <span className="text-red-400">${t.balance_due.toLocaleString()}</span>
                        : <span className="text-[#9ca3af]">—</span>}
                    </td>
                    {changeMap.size > 0 && (
                      <td className="px-4 py-3 text-xs">
                        {t.change?.type === "paid" && (
                          <span className="text-emerald-400 font-medium">Paid ${(t.change.prevBalance).toLocaleString()}</span>
                        )}
                        {t.change?.type === "improved" && (
                          <span className="text-blue-400">↓ ${Math.abs(t.balance_due - t.change.prevBalance).toLocaleString()} reduced</span>
                        )}
                        {t.change?.type === "worsened" && (
                          <span className="text-red-400">↑ ${Math.abs(t.balance_due - t.change.prevBalance).toLocaleString()} more</span>
                        )}
                        {t.change?.type === "new" && (
                          <span className="text-[#4b5563]">New</span>
                        )}
                        {(t.change?.type === "unchanged" || !t.change) && (
                          <span className="text-[#374151]">—</span>
                        )}
                      </td>
                    )}
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
