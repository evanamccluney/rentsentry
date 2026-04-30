export type Platform = "yardi" | "appfolio" | "buildium" | "rent_manager" | "excel"

export interface TenantImportRow {
  name: string
  unit: string
  email?: string
  phone?: string
  rent_amount?: number
  balance_due?: number
  lease_start?: string
  lease_end?: string
  rent_due_day?: number
  payment_method?: string
  card_expiry?: string
  previous_delinquency?: boolean
  late_payment_count?: number
  days_late_avg?: number
  notes?: string
  _errors?: string[]
}

export interface PlatformConfig {
  id: Platform
  name: string
  tagline: string
  steps: string[]
  reportsNeeded: { name: string; required: boolean; note: string }[]
  autoFills: string[]
  manualFields: { field: string; reason: string }[]
  tips: string[]
  columnMap: Record<string, keyof TenantImportRow>
}

// ── Column maps ───────────────────────────────────────────────────────────────
// Keys are lowercase patterns matched against normalized column headers.
// First match wins. Order matters — more specific patterns first.

const SHARED_COLUMNS: Record<string, keyof TenantImportRow> = {
  "tenant name":        "name",
  "tenant":             "name",
  "name":               "name",
  "resident":           "name",
  "resident name":      "name",
  "lessee":             "name",
  "unit number":        "unit",
  "unit no":            "unit",
  "unit":               "unit",
  "apt":                "unit",
  "apartment":          "unit",
  "suite":              "unit",
  "email address":      "email",
  "email":              "email",
  "e-mail":             "email",
  "phone number":       "phone",
  "phone":              "phone",
  "cell":               "phone",
  "mobile":             "phone",
  "telephone":          "phone",
  "monthly rent":       "rent_amount",
  "rent amount":        "rent_amount",
  "actual rent":        "rent_amount",
  "charges":            "rent_amount",
  "rent":               "rent_amount",
  "market rent":        "rent_amount",
  "lease rent":         "rent_amount",
  "balance due":        "balance_due",
  "balance":            "balance_due",
  "amount due":         "balance_due",
  "current balance":    "balance_due",
  "total balance":      "balance_due",
  "outstanding balance":"balance_due",
  "ar balance":         "balance_due",
  "total due":          "balance_due",
  "lease start date":   "lease_start",
  "lease start":        "lease_start",
  "lease from":         "lease_start",
  "start date":         "lease_start",
  "move in":            "lease_start",
  "move-in date":       "lease_start",
  "lease end date":     "lease_end",
  "lease end":          "lease_end",
  "lease to":           "lease_end",
  "end date":           "lease_end",
  "expiration date":    "lease_end",
  "lease expiration":   "lease_end",
  "rent due day":       "rent_due_day",
  "due day":            "rent_due_day",
  "payment due day":    "rent_due_day",
  "payment method":     "payment_method",
  "pay method":         "payment_method",
  "pay type":           "payment_method",
  "card expiry":        "card_expiry",
  "card expiration":    "card_expiry",
  "expiry":             "card_expiry",
  "cc expiry":          "card_expiry",
  "previous delinquency": "previous_delinquency",
  "prior eviction":     "previous_delinquency",
  "eviction history":   "previous_delinquency",
  "late payment count": "late_payment_count",
  "late payments":      "late_payment_count",
  "number of late payments": "late_payment_count",
  "avg days late":      "days_late_avg",
  "average days late":  "days_late_avg",
  "days late avg":      "days_late_avg",
  "notes":              "notes",
  "comments":           "notes",
  "memo":               "notes",
}

// ── Platform configs ──────────────────────────────────────────────────────────

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  yardi: {
    id: "yardi",
    name: "Yardi",
    tagline: "Voyager & Breeze",
    steps: [
      "In Yardi Voyager: go to Reports → Residential → Rent Roll. Set your property and period, click Display, then Export → Excel.",
      "In Yardi Breeze: go to Reports → select Rent Roll → click the Excel icon to export.",
      "For balances, also export the AR Aging Summary report (Reports → Residential → AR Aging) and upload that as a second file — RentSentry will merge the balance data automatically.",
      "For tenant contact info (email/phone), export the Tenant Directory report if available in your Yardi edition.",
    ],
    reportsNeeded: [
      { name: "Rent Roll", required: true, note: "Core tenant + lease data" },
      { name: "AR Aging Summary", required: false, note: "Adds balance_due to each tenant" },
      { name: "Tenant Directory", required: false, note: "Adds email and phone" },
    ],
    autoFills: ["name", "unit", "rent_amount", "lease_start", "lease_end"],
    manualFields: [
      { field: "Email / Phone", reason: "In Tenant Directory report — upload separately or enter manually" },
      { field: "Balance Due", reason: "In AR Aging report — upload separately or enter manually" },
      { field: "Card Expiry", reason: "Never exported by Yardi (PCI compliance)" },
      { field: "Late Payment History", reason: "Requires Tenant Ledger analysis — built up automatically over time in RentSentry" },
    ],
    tips: [
      "Yardi column names vary by configuration — if auto-mapping fails, use the column mapping screen to reassign.",
      "Export as .xlsx if given the option; save as CSV before uploading.",
      "Do not open the CSV in Excel before uploading — it can corrupt date formats and leading zeros.",
    ],
    columnMap: { ...SHARED_COLUMNS },
  },

  appfolio: {
    id: "appfolio",
    name: "AppFolio",
    tagline: "Property Manager",
    steps: [
      "Go to Reports in your AppFolio account.",
      "Under 'Property and Unit Reports', click Rent Roll.",
      "Click Customize (top right) → Grouping tab → select 'Do not group rows' → click Update → Save.",
      "Click ACTIONS (top right) → Export as CSV.",
      "For tenant contacts: go to People → Tenants → select all → Export to get email and phone.",
    ],
    reportsNeeded: [
      { name: "Rent Roll (CSV)", required: true, note: "Core lease + rent data" },
      { name: "Tenant Export", required: false, note: "Adds email and phone numbers" },
    ],
    autoFills: ["name", "unit", "rent_amount", "lease_start", "lease_end"],
    manualFields: [
      { field: "Balance Due", reason: "Not in Rent Roll — view in AR Aging report or enter manually" },
      { field: "Card Expiry", reason: "Never exported by AppFolio — encrypted for PCI compliance. AppFolio explicitly blocks access to saved payment details." },
      { field: "Late Payment History", reason: "Available in Tenant Ledger but not as aggregate stats — built up in RentSentry over time" },
    ],
    tips: [
      "Make sure to ungroup rows in the Rent Roll before exporting — otherwise the CSV will have merged cells that break parsing.",
      "AppFolio's Rent Roll does not include balance_due. If you need current balances, export the AR Aging report and look up each tenant's total.",
      "AppFolio calls the 'Lease End' column 'Lease End' — this maps automatically.",
    ],
    columnMap: {
      ...SHARED_COLUMNS,
      "lease status": "notes",
      "status":       "notes",
    },
  },

  buildium: {
    id: "buildium",
    name: "Buildium",
    tagline: "Property Management",
    steps: [
      "Click Settings in the left sidebar.",
      "Select Export Data from the dropdown.",
      "Choose Tenants from the data type options.",
      "Click Download — Buildium exports a .xlsx file automatically.",
      "Open the .xlsx in Excel or Google Sheets, then Save As → CSV (.csv) before uploading here.",
      "For balances, also export the Rent Roll report: Reports → Rent Roll → Export.",
    ],
    reportsNeeded: [
      { name: "Tenant Export (.xlsx → CSV)", required: true, note: "Name, contact info, lease dates" },
      { name: "Rent Roll Report", required: false, note: "Adds rent amount and balance due" },
    ],
    autoFills: ["name", "unit", "email", "phone", "lease_start", "lease_end", "rent_amount", "balance_due"],
    manualFields: [
      { field: "Card Expiry", reason: "Never exported by Buildium — stored encrypted in their payment processor" },
      { field: "Previous Delinquency", reason: "Buildium does not track prior eviction history" },
      { field: "Late Payment History", reason: "Available in tenant ledger transactions but not as aggregate stats" },
    ],
    tips: [
      "Buildium's Tenant Export is the most complete — it includes contact info, lease dates, and balance in one file.",
      "Make sure to convert the .xlsx to .csv before uploading (File → Save As → CSV in Excel).",
      "Buildium labels rent as 'Recurring Charges' in some exports — RentSentry maps this to rent_amount automatically.",
    ],
    columnMap: {
      ...SHARED_COLUMNS,
      "recurring charges": "rent_amount",
      "scheduled charges": "rent_amount",
      "deposits held":     "notes",
    },
  },

  rent_manager: {
    id: "rent_manager",
    name: "Rent Manager",
    tagline: "Property Software",
    steps: [
      "Open Rent Manager and click the Reports tab (top right of screen).",
      "Click Report Writer → Report Writer Manager.",
      "Select the Rent Roll report from the library.",
      "Configure the date range and property filter.",
      "Click Export → CSV.",
      "IMPORTANT: Do not open the CSV in Excel before uploading — Rent Manager CSVs can have leading zeros stripped by Excel.",
    ],
    reportsNeeded: [
      { name: "Rent Roll (CSV)", required: true, note: "Core tenant + lease + rent data" },
      { name: "AR Aging Report", required: false, note: "Adds current balance per tenant" },
    ],
    autoFills: ["name", "unit", "rent_amount", "lease_start", "lease_end", "balance_due"],
    manualFields: [
      { field: "Email / Phone", reason: "May not be in Rent Roll — check Tenant report for contact info" },
      { field: "Card Expiry", reason: "Never exported (PCI compliance)" },
      { field: "Late Payment History", reason: "Available in tenant ledger but not as aggregate stats" },
    ],
    tips: [
      "Rent Manager has 450+ reports — the standard Rent Roll is under Reports → Rent Roll Summary.",
      "Column names are fully customizable in Rent Manager. If auto-mapping fails, use the column mapping screen.",
      "Save your CSV to a temporary folder and upload directly — do not open it in Excel first.",
    ],
    columnMap: {
      ...SHARED_COLUMNS,
      "tenant id":   "notes",
      "property":    "notes",
    },
  },

  excel: {
    id: "excel",
    name: "Excel / Custom",
    tagline: "Spreadsheet or other software",
    steps: [
      "Download the RentSentry template below.",
      "Fill in your tenant data — required fields are marked with *.",
      "Save the file as CSV (File → Save As → CSV).",
      "Upload it below.",
    ],
    reportsNeeded: [
      { name: "RentSentry Template (CSV)", required: true, note: "Download the template and fill it in" },
    ],
    autoFills: ["name", "unit", "email", "phone", "rent_amount", "balance_due", "lease_start", "lease_end", "rent_due_day", "payment_method", "card_expiry", "previous_delinquency", "late_payment_count", "days_late_avg", "notes"],
    manualFields: [],
    tips: [
      "The template includes all RentSentry fields including card expiry and late payment history — fill in as much as you have.",
      "Dates should be in MM/DD/YYYY format.",
      "For 'Previous Delinquency', use Yes or No.",
      "Payment Method options: card, ach, cash, check, unknown.",
    ],
    columnMap: { ...SHARED_COLUMNS },
  },
}

// ── CSV parser ────────────────────────────────────────────────────────────────

export type ParseError =
  | { code: "empty_file" }
  | { code: "no_data_rows" }
  | { code: "wrong_delimiter"; detected: string }
  | { code: "no_columns_matched" }
  | { code: "xlsx_not_supported" }
  | { code: "garbled_encoding" }

export type ParseResult =
  | { ok: true; headers: string[]; rows: Record<string, string>[] }
  | { ok: false; error: ParseError }

function detectDelimiter(firstLine: string): "," | ";" | "\t" {
  const counts = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  }
  if (counts[";"] > counts[","] && counts[";"] > counts["\t"]) return ";"
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"])  return "\t"
  return ","
}

export function parseCSV(text: string): ParseResult {
  // Detect UTF-16 / garbled encoding (BOM or non-ASCII-looking garbage)
  if (text.charCodeAt(0) === 0xff || text.charCodeAt(0) === 0xfe || text.includes("\x00")) {
    return { ok: false, error: { code: "garbled_encoding" } }
  }

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim())

  if (lines.length === 0) return { ok: false, error: { code: "empty_file" } }
  if (lines.length < 2)   return { ok: false, error: { code: "no_data_rows" } }

  const delimiter = detectDelimiter(lines[0])

  function parseLine(line: string): string[] {
    const fields: string[] = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === delimiter && !inQuotes) {
        fields.push(current.trim())
        current = ""
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseLine(lines[0]).map(h => h.replace(/^["']|["']$/g, "").trim()).filter(Boolean)

  if (headers.length <= 1 && delimiter === ",") {
    // Likely semicolon or tab delimited but we guessed comma
    const altDelimiter = (lines[0].match(/;/g) ?? []).length > 0 ? "semicolon (;)" : "tab"
    return { ok: false, error: { code: "wrong_delimiter", detected: altDelimiter } }
  }

  const rows = lines.slice(1).map(line => {
    const values = parseLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]))
  }).filter(row => Object.values(row).some(v => v !== ""))

  if (rows.length === 0) return { ok: false, error: { code: "no_data_rows" } }

  return { ok: true, headers, rows }
}

// ── Column mapper ─────────────────────────────────────────────────────────────

export function detectColumnMapping(
  headers: string[],
  platform: Platform
): Record<string, keyof TenantImportRow> {
  const config = PLATFORM_CONFIGS[platform]
  const result: Record<string, keyof TenantImportRow> = {}
  const usedFields = new Set<string>()

  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[_\-*]/g, " ").trim()
    for (const [pattern, field] of Object.entries(config.columnMap)) {
      if (!usedFields.has(field) && (normalized === pattern || normalized.includes(pattern))) {
        result[header] = field
        usedFields.add(field)
        break
      }
    }
  }

  return result
}

// ── Row converter ─────────────────────────────────────────────────────────────

function parseDate(val: string): string | undefined {
  if (!val) return undefined
  // Try MM/DD/YYYY
  const mdy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`
  // Try YYYY-MM-DD
  const iso = val.match(/^\d{4}-\d{2}-\d{2}/)
  if (iso) return val.slice(0, 10)
  // Try M/D/YY
  const short = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (short) return `20${short[3]}-${short[1].padStart(2, "0")}-${short[2].padStart(2, "0")}`
  return undefined
}

function parseMoney(val: string): number | undefined {
  if (!val) return undefined
  const n = parseFloat(val.replace(/[$,\s]/g, ""))
  return isNaN(n) ? undefined : n
}

export function convertRow(
  raw: Record<string, string>,
  mapping: Record<string, keyof TenantImportRow>
): TenantImportRow {
  const row: TenantImportRow = { name: "", unit: "", _errors: [] }
  const r = row as unknown as Record<string, unknown>

  for (const [header, field] of Object.entries(mapping)) {
    const val = raw[header] ?? ""
    if (!val) continue

    switch (field) {
      case "name":
      case "unit":
      case "email":
      case "phone":
      case "payment_method":
      case "card_expiry":
      case "notes":
        r[field] = val
        break
      case "rent_amount":
      case "balance_due":
      case "days_late_avg": {
        const n = parseMoney(val)
        if (n !== undefined) r[field] = n
        break
      }
      case "rent_due_day":
      case "late_payment_count": {
        const n = parseInt(val)
        if (!isNaN(n)) r[field] = n
        break
      }
      case "lease_start":
      case "lease_end": {
        const d = parseDate(val)
        if (d) r[field] = d
        break
      }
      case "previous_delinquency":
        r[field] = /^(yes|true|1|y)$/i.test(val)
        break
    }
  }

  if (!row.name) row._errors!.push("Missing tenant name")
  if (!row.unit) row._errors!.push("Missing unit number")

  return row
}

// ── Excel template ────────────────────────────────────────────────────────────

export function generateTemplateCSV(): string {
  const headers = [
    "Tenant Name*", "Unit*", "Email", "Phone",
    "Monthly Rent", "Balance Due", "Lease Start", "Lease End",
    "Rent Due Day", "Payment Method", "Card Expiry",
    "Previous Delinquency", "Late Payment Count", "Avg Days Late", "Notes",
  ]
  const example = [
    "Jane Smith", "2B", "jane@example.com", "555-867-5309",
    "1500", "0", "01/01/2024", "12/31/2024",
    "1", "ach", "",
    "No", "0", "0", "",
  ]
  return [headers.join(","), example.join(",")].join("\n")
}
