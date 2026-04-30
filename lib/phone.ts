/**
 * Normalizes a phone number string to E.164 format (+1XXXXXXXXXX for US numbers).
 * Twilio rejects anything that isn't E.164.
 * Returns null if the input can't be normalized to a valid number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, "")

  // US 10-digit
  if (digits.length === 10) return `+1${digits}`

  // US 11-digit starting with 1
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`

  // Already has + prefix and enough digits (international)
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`

  return null
}

/**
 * Returns true if the string is already valid E.164.
 */
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{9,14}$/.test(phone)
}
