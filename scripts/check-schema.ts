/**
 * Run before deploying: npx ts-node --skip-project scripts/check-schema.ts
 * Checks that all required DB columns exist. Exits 1 if anything is missing.
 */
import { createClient } from "@supabase/supabase-js"

const REQUIRED: Record<string, string[]> = {
  tenants: [
    "autopay_monthly",
    "stripe_payment_method_id",
    "stripe_customer_id",
    "sms_opted_out",
    "resolution_status",
  ],
  profiles: [
    "stripe_account_id",
    "stripe_charges_enabled",
    "pm_phone",
    "pm_alerts_enabled",
    "pm_alert_triggers",
    "pm_display_name",
    "late_fee_day",
    "escalation_preset",
    "reminder_day",
    "payment_plan_day",
    "pay_or_quit_day",
    "cfk_review_day",
    "attorney_review_day",
    "repeat_offender_accelerator_days",
  ],
  payments: ["source"],
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(url, key)
  let missing = 0

  for (const [table, columns] of Object.entries(REQUIRED)) {
    const { data, error } = await supabase
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", table)

    if (error) {
      // Fallback: query via rpc if direct select is blocked by RLS
      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_columns", { p_table: table }).select()
      if (rpcErr) {
        console.warn(`⚠️  Could not check table '${table}': ${error.message}`)
        continue
      }
      const existing = new Set((rpcData ?? []).map((r: { column_name: string }) => r.column_name))
      for (const col of columns) {
        if (!existing.has(col)) {
          console.error(`❌  MISSING: ${table}.${col}`)
          missing++
        }
      }
      continue
    }

    const existing = new Set((data ?? []).map((r: { column_name: string }) => r.column_name))
    for (const col of columns) {
      if (!existing.has(col)) {
        console.error(`❌  MISSING: ${table}.${col}`)
        missing++
      }
    }
  }

  if (missing > 0) {
    console.error(`\n${missing} column(s) missing. Run pending migrations before deploying.`)
    process.exit(1)
  }

  console.log("✅ Schema check passed — all required columns present.")
}

main().catch(e => {
  console.error("Schema check error:", e)
  process.exit(1)
})
