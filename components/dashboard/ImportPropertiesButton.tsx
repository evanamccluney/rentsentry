"use client"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { FileUp } from "lucide-react"
import { parseCSV } from "@/lib/csv-parser"

const PROP_ALIASES: Record<string, string[]> = {
  name: ["property name", "property", "name", "building name", "building"],
  address: ["address", "street address", "street", "full address"],
  city: ["city"],
  state: ["state"],
  zip: ["zip", "zip code", "postal code"],
  total_units: ["total units", "units", "unit count", "number of units"],
}

function detectPropColumns(headers: string[]) {
  const map: Record<string, string | null> = {}
  for (const [field, aliases] of Object.entries(PROP_ALIASES)) {
    const match = headers.find(h =>
      aliases.some(a => h.toLowerCase().trim() === a)
    )
    map[field] = match || null
  }
  return map
}

export default function ImportPropertiesButton() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(file: File) {
    setLoading(true)
    const text = await file.text()
    const { headers, rows } = parseCSV(text)
    const map = detectPropColumns(headers)

    if (!map.name) {
      toast.error("Could not find a 'Property Name' column in the CSV.")
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error("Not authenticated."); setLoading(false); return }

    // Normalize full state name to 2-letter abbreviation
    const STATE_ABBR: Record<string, string> = {
      "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA",
      "colorado":"CO","connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA",
      "hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA","kansas":"KS",
      "kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD","massachusetts":"MA",
      "michigan":"MI","minnesota":"MN","mississippi":"MS","missouri":"MO","montana":"MT",
      "nebraska":"NE","nevada":"NV","new hampshire":"NH","new jersey":"NJ","new mexico":"NM",
      "new york":"NY","north carolina":"NC","north dakota":"ND","ohio":"OH","oklahoma":"OK",
      "oregon":"OR","pennsylvania":"PA","rhode island":"RI","south carolina":"SC",
      "south dakota":"SD","tennessee":"TN","texas":"TX","utah":"UT","vermont":"VT",
      "virginia":"VA","washington":"WA","west virginia":"WV","wisconsin":"WI","wyoming":"WY",
    }
    function normalizeState(raw: string): string | null {
      if (!raw) return null
      const trimmed = raw.trim()
      if (trimmed.length === 2) return trimmed.toUpperCase()
      return STATE_ABBR[trimmed.toLowerCase()] ?? null
    }

    const properties = rows.map(row => {
      const rawState = map.state ? row[map.state] : null
      const stateAbbr = normalizeState(rawState ?? "")
      const addressParts = [
        map.address ? row[map.address] : null,
        map.city ? row[map.city] : null,
        rawState || null,
        map.zip ? row[map.zip] : null,
      ].filter(Boolean)

      return {
        user_id: user.id,
        name: map.name ? row[map.name!]?.trim() : "Unnamed",
        address: addressParts.join(", ") || null,
        state: stateAbbr,
        total_units: map.total_units ? parseInt(row[map.total_units] || "0") || 0 : 0,
      }
    }).filter(p => p.name && p.name !== "Unnamed")

    if (!properties.length) {
      toast.error("No valid properties found in the CSV.")
      setLoading(false)
      return
    }

    const { error } = await supabase.from("properties").insert(properties)
    if (error) {
      toast.error("Failed to import properties.")
    } else {
      toast.success(`${properties.length} properties imported.`)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-2 border border-[#1e2d45] text-[#9ca3af] hover:text-white hover:bg-[#131929] font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
      >
        <FileUp size={15} />
        {loading ? "Importing…" : "Import CSV"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </>
  )
}
