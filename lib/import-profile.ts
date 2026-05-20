import type { Platform, TenantImportRow } from "@/lib/import-mappers"

export interface SavedImportProfile {
  platform: Platform | null
  column_mapping: Record<string, keyof TenantImportRow> | null
  property_id?: string | null
}

export function applySavedImportMapping(
  detected: Record<string, keyof TenantImportRow>,
  headers: string[],
  platform: Platform,
  profile?: SavedImportProfile | null
): { mapping: Record<string, keyof TenantImportRow>; usedSavedMapping: boolean } {
  if (!profile || profile.platform !== platform || !profile.column_mapping) {
    return { mapping: detected, usedSavedMapping: false }
  }

  const headerSet = new Set(headers)
  const savedForCurrentFile = Object.fromEntries(
    Object.entries(profile.column_mapping).filter(([header]) => headerSet.has(header))
  ) as Record<string, keyof TenantImportRow>

  const hasRequiredSavedMapping = Object.values(savedForCurrentFile).includes("name") &&
    Object.values(savedForCurrentFile).includes("unit")

  if (!hasRequiredSavedMapping) {
    return { mapping: detected, usedSavedMapping: false }
  }

  return {
    mapping: { ...detected, ...savedForCurrentFile },
    usedSavedMapping: true,
  }
}
