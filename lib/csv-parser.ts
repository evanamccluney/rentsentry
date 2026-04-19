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
}

// Common column name aliases from various PM software exports
const COLUMN_MAP: Record<keyof MappedTenant, string[]> = {
  property_name: ['property', 'property name', 'building', 'building name', 'community', 'community name', 'site name', 'site', 'complex', 'development'],
  unit: ['unit', 'unit #', 'unit number', 'apt', 'apartment', 'suite', 'space'],
  name: ['name', 'tenant name', 'resident name', 'resident', 'tenant', 'full name', 'lessee'],
  email: ['email', 'email address', 'e-mail', 'resident email', 'tenant email'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'contact'],
  rent_amount: ['rent', 'rent amount', 'monthly rent', 'market rent', 'charge amount', 'rent charge'],
  lease_start: ['lease start', 'lease begin', 'move in', 'start date', 'lease from', 'lease commencement'],
  lease_end: ['lease end', 'lease expiration', 'lease to', 'end date', 'lease expiry', 'lease termination'],
  payment_method: ['payment method', 'pay method', 'payment type', 'pay type'],
  card_expiry: ['card expiry', 'card expiration', 'cc expiry', 'card exp', 'cc exp'],
  days_late_avg: ['days late avg', 'average days late', 'avg days late', 'late days avg'],
  late_payment_count: ['late payment count', 'late payments', 'late count', 'number of late payments', 'late payment #'],
  previous_delinquency: ['previous delinquency', 'prior delinquency', 'delinquent', 'delinquency history', 'was delinquent'],
  balance_due: ['balance due', 'balance', 'amount due', 'outstanding balance', 'current balance', 'past due'],
  last_payment_date: ['last payment date', 'last payment', 'last paid', 'most recent payment'],
  move_in_date: ['move in date', 'move-in', 'movein', 'move in', 'occupancy date'],
  move_out_date: ['move out date', 'move-out', 'moveout', 'move out', 'vacate date', 'notice date'],
}

export function detectColumns(headers: string[]): Record<keyof MappedTenant, string | null> {
  const result = {} as Record<keyof MappedTenant, string | null>
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim())

  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    // Exact match first, then partial — prevents "property_name" stealing the "name" field
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

export function parseCSV(text: string): { headers: string[]; rows: RawRow[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const rows: RawRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim())
    if (values.every(v => !v)) continue
    const row: RawRow = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] || ''
    })
    rows.push(row)
  }

  return { headers, rows }
}

export function mapRow(row: RawRow, mapping: Record<keyof MappedTenant, string | null>): MappedTenant {
  function get(field: keyof MappedTenant): string {
    const col = mapping[field]
    return col ? (row[col] || '') : ''
  }

  return {
    property_name: get('property_name'),
    unit: get('unit'),
    name: get('name'),
    email: get('email'),
    phone: get('phone'),
    rent_amount: parseFloat(get('rent_amount').replace(/[$,]/g, '')) || 0,
    lease_start: get('lease_start'),
    lease_end: get('lease_end'),
    payment_method: get('payment_method').toLowerCase() || 'unknown',
    card_expiry: get('card_expiry'),
    days_late_avg: parseInt(get('days_late_avg')) || 0,
    late_payment_count: parseInt(get('late_payment_count')) || 0,
    previous_delinquency: ['yes', 'true', '1', 'y'].includes(get('previous_delinquency').toLowerCase()),
    balance_due: parseFloat(get('balance_due').replace(/[$,]/g, '')) || 0,
    last_payment_date: get('last_payment_date'),
    move_in_date: get('move_in_date'),
    move_out_date: get('move_out_date'),
  }
}
