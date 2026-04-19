export interface RawRow {
  [key: string]: string
}

export interface MappedTenant {
  property_name: string
  unit: string
  name: string
  email: string
  phone: string
  rent_amount: number
  lease_start: string
  lease_end: string
  payment_method: string
  card_expiry: string
  days_late_avg: number
  late_payment_count: number
  previous_delinquency: boolean
  balance_due: number
  last_payment_date: string
  move_in_date: string
  move_out_date: string
  days_past_due: number
}

// Common column name aliases from various PM software exports
const COLUMN_MAP: Record<keyof MappedTenant, string[]> = {
  property_name:      ['property', 'property name', 'building', 'building name', 'community', 'community name', 'site name', 'site', 'complex', 'development'],
  unit:               ['unit', 'unit #', 'unit number', 'apt', 'apartment', 'suite', 'space'],
  name:               ['name', 'tenant name', 'resident name', 'resident', 'tenant', 'full name', 'lessee'],
  email:              ['email', 'email address', 'e-mail', 'resident email', 'tenant email'],
  phone:              ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'contact'],
  rent_amount:        ['rent', 'rent amount', 'monthly rent', 'market rent', 'charge amount', 'rent charge', 'scheduled rent'],
  lease_start:        ['lease start', 'lease begin', 'move in', 'start date', 'lease from', 'lease commencement'],
  lease_end:          ['lease end', 'lease expiration', 'lease to', 'end date', 'lease expiry', 'lease termination'],
  payment_method:     ['payment method', 'pay method', 'payment type', 'pay type'],
  card_expiry:        ['card expiry', 'card expiration', 'cc expiry', 'card exp', 'cc exp'],
  days_late_avg:      ['days late avg', 'average days late', 'avg days late', 'late days avg'],
  late_payment_count: ['late payment count', 'late payments', 'late count', 'number of late payments', 'late payment #', 'times late'],
  previous_delinquency: ['previous delinquency', 'prior delinquency', 'delinquent', 'delinquency history', 'was delinquent'],
  balance_due:        ['balance due', 'balance', 'amount due', 'outstanding balance', 'current balance', 'past due', 'delinquent balance', 'amount owed'],
  last_payment_date:  ['last payment date', 'last payment', 'last paid', 'most recent payment', 'last paid date'],
  move_in_date:       ['move in date', 'move-in', 'movein', 'move in', 'occupancy date'],
  move_out_date:      ['move out date', 'move-out', 'moveout', 'move out', 'vacate date', 'notice date'],
  days_past_due:      ['days past due', 'days overdue', 'days delinquent', 'overdue days', 'dpd', 'days late'],
}

// Extra columns we track for history aggregation but don't store directly
const HISTORY_COLUMN_MAP: Record<string, string[]> = {
  period:        ['period', 'month', 'date', 'billing period', 'billing date', 'ledger date', 'statement date', 'period end', 'as of'],
  payment_date:  ['payment date', 'date paid', 'paid date', 'payment received', 'received date'],
  amount_paid:   ['amount paid', 'payment amount', 'paid amount', 'total paid', 'payment', 'amount received'],
  was_late:      ['late', 'paid late', 'is late', 'delinquent', 'past due flag'],
}

export function detectColumns(headers: string[]): Record<keyof MappedTenant, string | null> {
  const result = {} as Record<keyof MappedTenant, string | null>
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim())

  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    const exactMatch = aliases.find(alias => normalizedHeaders.some(h => h === alias))
    const partialMatch = aliases.find(alias => normalizedHeaders.some(h => h.includes(alias)))
    const match = exactMatch ?? partialMatch

    if (match) {
      const idx = normalizedHeaders.findIndex(h => h === match || h.includes(match))
      result[field as keyof MappedTenant] = headers[idx]
    } else {
      result[field as keyof MappedTenant] = null
    }
  }

  return result
}

export function detectHistoryColumns(headers: string[]): Record<string, string | null> {
  const result: Record<string, string | null> = {}
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim())

  for (const [field, aliases] of Object.entries(HISTORY_COLUMN_MAP)) {
    const exactMatch = aliases.find(alias => normalizedHeaders.some(h => h === alias))
    const partialMatch = aliases.find(alias => normalizedHeaders.some(h => h.includes(alias)))
    const match = exactMatch ?? partialMatch

    if (match) {
      const idx = normalizedHeaders.findIndex(h => h === match || h.includes(match))
      result[field] = headers[idx]
    } else {
      result[field] = null
    }
  }

  return result
}

export function parseCSV(text: string): { headers: string[]; rows: RawRow[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  // Handle quoted CSV fields properly
  function splitCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes
      } else if (line[i] === ',' && !inQuotes) {
        result.push(current.trim())
        current = ""
      } else {
        current += line[i]
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  const rows: RawRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, '').trim())
    if (values.every(v => !v)) continue
    const row: RawRow = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] || ''
    })
    rows.push(row)
  }

  return { headers, rows }
}

// Detect if CSV has multiple rows per tenant (historical format)
export function isHistoricalCSV(rows: RawRow[], mapping: Record<keyof MappedTenant, string | null>): boolean {
  const unitCol = mapping['unit']
  const nameCol = mapping['name']
  if (!unitCol && !nameCol) return false

  const seen = new Set<string>()
  for (const row of rows) {
    const key = [row[unitCol ?? ''] ?? '', row[nameCol ?? ''] ?? ''].join('|').toLowerCase().trim()
    if (!key || key === '|') continue
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

// Aggregate multiple rows per tenant into a single MappedTenant with derived history stats
export function aggregateHistoricalRows(
  rows: RawRow[],
  mapping: Record<keyof MappedTenant, string | null>,
  historyMapping: Record<string, string | null>
): MappedTenant[] {
  const unitCol = mapping['unit']
  const nameCol = mapping['name']

  // Group rows by unit (or name as fallback)
  const groups = new Map<string, RawRow[]>()
  for (const row of rows) {
    const unit = (unitCol ? row[unitCol] : '') || ''
    const name = (nameCol ? row[nameCol] : '') || ''
    const key = (unit || name).toLowerCase().trim()
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  const results: MappedTenant[] = []

  for (const [, groupRows] of groups) {
    // Sort by period/date if available (oldest first)
    const periodCol = historyMapping['period']
    if (periodCol) {
      groupRows.sort((a, b) => {
        const da = new Date(a[periodCol] || '').getTime()
        const db = new Date(b[periodCol] || '').getTime()
        return isNaN(da) || isNaN(db) ? 0 : da - db
      })
    }

    // Use most recent row for current values
    const latest = groupRows[groupRows.length - 1]
    const base = mapRow(latest, mapping)

    // ── Derive history stats from all rows ──────────────────────────

    let lateCount = 0
    let totalLateDays = 0
    let lateDayEntries = 0
    let previousDelinquency = false
    let lastPaymentDate = base.last_payment_date

    const paymentDateCol = historyMapping['payment_date']
    const amountPaidCol = historyMapping['amount_paid']
    const wasLateCol = historyMapping['was_late']
    const balanceCol = mapping['balance_due']
    const rentCol = mapping['rent_amount']
    const dpd = mapping['days_past_due']

    for (const row of groupRows) {
      const balance = parseFloat((balanceCol ? row[balanceCol] : '0')?.replace(/[$,]/g, '') || '0') || 0
      const rent = parseFloat((rentCol ? row[rentCol] : '0')?.replace(/[$,]/g, '') || '0') || 0
      const daysPastDue = parseInt((dpd ? row[dpd] : '0') || '0') || 0
      const wasLateRaw = wasLateCol ? (row[wasLateCol] || '').toLowerCase() : ''
      const wasLate = ['yes', 'true', '1', 'y', 'late'].includes(wasLateRaw)

      // Count as late: explicit flag, balance > 0, or days past due > 0
      if (wasLate || balance > 0 || daysPastDue > 0) {
        lateCount++
        if (daysPastDue > 0) {
          totalLateDays += daysPastDue
          lateDayEntries++
        }
        // Serious delinquency: 2+ months behind or 60+ days past due
        if ((rent > 0 && balance >= rent * 2) || daysPastDue >= 60) {
          previousDelinquency = true
        }
      }

      // Track last payment date from payment_date column
      if (paymentDateCol && row[paymentDateCol]) {
        const paid = row[paymentDateCol]
        if (!lastPaymentDate || new Date(paid) > new Date(lastPaymentDate)) {
          lastPaymentDate = paid
        }
      }

      // If amount_paid column exists and amount > 0, also use that as a payment signal
      if (amountPaidCol && row[amountPaidCol]) {
        const amt = parseFloat(row[amountPaidCol].replace(/[$,]/g, '') || '0')
        if (amt > 0 && periodCol && row[periodCol]) {
          if (!lastPaymentDate || new Date(row[periodCol]) > new Date(lastPaymentDate)) {
            lastPaymentDate = row[periodCol]
          }
        }
      }
    }

    // Don't double-count if CSV already had late_payment_count column
    const hasExplicitCount = mapping['late_payment_count'] && parseInt(latest[mapping['late_payment_count']!] || '0') > 0
    const hasExplicitAvg = mapping['days_late_avg'] && parseInt(latest[mapping['days_late_avg']!] || '0') > 0

    results.push({
      ...base,
      late_payment_count: hasExplicitCount ? base.late_payment_count : lateCount,
      days_late_avg: hasExplicitAvg ? base.days_late_avg : (lateDayEntries > 0 ? Math.round(totalLateDays / lateDayEntries) : 0),
      previous_delinquency: base.previous_delinquency || previousDelinquency,
      last_payment_date: lastPaymentDate || base.last_payment_date,
    })
  }

  return results
}

export function mapRow(row: RawRow, mapping: Record<keyof MappedTenant, string | null>): MappedTenant {
  function get(field: keyof MappedTenant): string {
    const col = mapping[field]
    return col ? (row[col] || '') : ''
  }

  return {
    property_name:      get('property_name'),
    unit:               get('unit'),
    name:               get('name'),
    email:              get('email'),
    phone:              get('phone'),
    rent_amount:        parseFloat(get('rent_amount').replace(/[$,]/g, '')) || 0,
    lease_start:        get('lease_start'),
    lease_end:          get('lease_end'),
    payment_method:     get('payment_method').toLowerCase() || 'unknown',
    card_expiry:        get('card_expiry'),
    days_late_avg:      parseInt(get('days_late_avg')) || 0,
    late_payment_count: parseInt(get('late_payment_count')) || 0,
    previous_delinquency: ['yes', 'true', '1', 'y'].includes(get('previous_delinquency').toLowerCase()),
    balance_due:        parseFloat(get('balance_due').replace(/[$,]/g, '')) || 0,
    last_payment_date:  get('last_payment_date'),
    move_in_date:       get('move_in_date'),
    move_out_date:      get('move_out_date'),
    days_past_due:      parseInt(get('days_past_due')) || 0,
  }
}
