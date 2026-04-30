import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const INTERVENTION_LABELS: Record<string, string> = {
  proactive_reminder:          "Proactive Reminder",
  payment_reminder:            "Payment Reminder",
  payment_method_alert:        "Payment Method Alert",
  card_expiry_alert:           "Card Expiry Alert",
  pre_due_delinquent_warning:  "Pre-Due Balance Warning",
  pre_due_urgent:              "Urgent Pre-Due Reminder",
  split_pay_offer:             "Payment Plan Offered",
  cash_for_keys:               "Cash for Keys Offered",
  legal_packet:                "Legal Notice Sent",
  hardship_checkin:            "Hardship Check-In",
  call_logged:                 "Call Logged",
  payment_plan_agreed:         "Payment Plan Agreed",
  custom_sms:                  "Custom SMS Sent",
  manual_note:                 "Note Added",
  pm_confirmation_sent:        "PM Confirmation Sent",
  pm_payment_confirmed:        "PM Confirmed Payment",
}

function escapeCSV(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return ""
  const str = String(val)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, unit, properties(name)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const { data: interventions } = await supabase
    .from("interventions")
    .select("id, type, sent_at, status, notes, snapshot")
    .eq("tenant_id", id)
    .order("sent_at", { ascending: true })

  const rows = (interventions ?? []).map(i => {
    const snap = i.snapshot as Record<string, unknown> | null
    return [
      escapeCSV(new Date(i.sent_at).toLocaleString("en-US")),
      escapeCSV(INTERVENTION_LABELS[i.type] ?? i.type),
      escapeCSV(i.status),
      escapeCSV(snap?.balance_due as number | null),
      escapeCSV(snap?.days_past_due as number | null),
      escapeCSV(snap?.tier as string | null),
      escapeCSV(i.notes),
    ].join(",")
  })

  const header = "Date,Action,Status,Balance Due,Days Past Due,Risk Tier,Notes"
  const propertyName = (tenant.properties as { name?: string } | null)?.name ?? ""
  const tenantLabel = `${tenant.name} — Unit ${tenant.unit}${propertyName ? ` — ${propertyName}` : ""}`
  const exportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  const csv = [
    `# RentSentry Audit Log`,
    `# Tenant: ${tenantLabel}`,
    `# Exported: ${exportDate}`,
    `# Total actions: ${rows.length}`,
    "",
    header,
    ...rows,
  ].join("\n")

  const safeName = tenant.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="audit_${safeName}_${Date.now()}.csv"`,
    },
  })
}
