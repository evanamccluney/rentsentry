import { describe, expect, it } from "vitest"
import { applySavedImportMapping } from "@/lib/import-profile"

describe("applySavedImportMapping", () => {
  it("uses saved mapping when platform and headers match", () => {
    const result = applySavedImportMapping(
      { Tenant: "name", Unit: "unit" },
      ["Resident Name", "Apt", "Balance"],
      "appfolio",
      {
        platform: "appfolio",
        property_id: null,
        column_mapping: { "Resident Name": "name", Apt: "unit", Balance: "balance_due" },
      }
    )

    expect(result.usedSavedMapping).toBe(true)
    expect(result.mapping["Resident Name"]).toBe("name")
    expect(result.mapping.Balance).toBe("balance_due")
  })

  it("falls back to detected mapping when platform differs", () => {
    const detected = { Tenant: "name" as const, Unit: "unit" as const }
    const result = applySavedImportMapping(detected, ["Resident Name", "Apt"], "yardi", {
      platform: "appfolio",
      property_id: null,
      column_mapping: { "Resident Name": "name", Apt: "unit" },
    })

    expect(result.usedSavedMapping).toBe(false)
    expect(result.mapping).toBe(detected)
  })

  it("falls back when saved mapping no longer has required fields", () => {
    const detected = { Tenant: "name" as const, Unit: "unit" as const }
    const result = applySavedImportMapping(detected, ["Balance"], "appfolio", {
      platform: "appfolio",
      property_id: null,
      column_mapping: { Balance: "balance_due" },
    })

    expect(result.usedSavedMapping).toBe(false)
    expect(result.mapping).toBe(detected)
  })
})
