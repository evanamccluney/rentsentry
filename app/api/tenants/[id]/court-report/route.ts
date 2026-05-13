import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const INTERVENTION_LABELS: Record<string, string> = {
  proactive_reminder:         "Proactive Reminder Sent",
  payment_reminder:           "Payment Reminder Sent",
  payment_method_alert:       "Payment Method Alert",
  card_expiry_alert:          "Card Expiry Alert",
  pre_due_delinquent_warning: "Pre-Due Warning Sent",
  pre_due_urgent:             "Urgent Pre-Due Reminder",
  split_pay_offer:            "Payment Plan Offered",
  cash_for_keys:              "Cash for Keys Offered",
  legal_packet:               "Legal Notice Sent",
  hardship_checkin:           "Hardship Check-In",
  call_logged:                "Call Logged",
  payment_plan_agreed:        "Payment Plan Agreed",
  custom_sms:                 "Custom SMS Sent",
  manual_note:                "Note Added",
  pm_confirmation_sent:       "PM Confirmation Sent",
  pm_payment_confirmed:       "PM Confirmed Payment",
  situation_intake:           "Situation Intake",
  resolution_outcome:         "Resolution Outcome",
  tenant_response:            "Tenant Response Logged",
  payment_link_sent:          "Payment Link Sent",
  payment_link_paid:          "Payment Received via Link",
  payment_declined:           "Autopay Payment Declined",
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const [{ data: tenant }, { data: interventions }, { data: payments }, { data: profile }] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, unit, email, phone, rent_amount, balance_due, rent_due_day, lease_start, lease_end, move_in_date, late_payment_count, days_late_avg, previous_delinquency, properties(name, address, state)")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("interventions")
      .select("id, type, sent_at, status, notes, snapshot")
      .eq("tenant_id", id)
      .order("sent_at", { ascending: true }),
    supabase
      .from("payments")
      .select("id, amount, date, source, note")
      .eq("tenant_id", id)
      .order("date", { ascending: true }),
    supabase
      .from("profiles")
      .select("pm_display_name, pm_phone")
      .eq("id", user.id)
      .single(),
  ])

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const property = tenant.properties as { name?: string; address?: string; state?: string } | null
  const pm = profile as { pm_display_name?: string; pm_phone?: string } | null
  const exportDate = fmt(new Date())

  const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount || 0), 0)
  const rentDue = (tenant.rent_amount || 0) * Math.max(1, Math.round((tenant.balance_due || 0) / Math.max(tenant.rent_amount || 1, 1)))

  // Merge payments and interventions into a single timeline
  const timeline: { date: string; type: "payment" | "action"; content: string }[] = [
    ...(payments ?? []).map(p => ({
      date: p.date,
      type: "payment" as const,
      content: `Payment received: $${(p.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}${p.source && p.source !== "manual" ? ` via ${p.source}` : ""}${p.note ? ` — ${p.note}` : ""}`,
    })),
    ...(interventions ?? []).map(i => ({
      date: i.sent_at,
      type: "action" as const,
      content: `${INTERVENTION_LABELS[i.type] ?? i.type}${i.notes ? `: ${i.notes}` : ""}`,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Tenant Case File — ${tenant.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Georgia, serif;
      font-size: 11pt;
      line-height: 1.65;
      color: #111;
      max-width: 720px;
      margin: 48px auto;
      padding: 0 40px;
    }
    .header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 18pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .header .sub { font-size: 10pt; color: #444; }
    .section { margin-bottom: 28px; }
    .section-title {
      font-size: 9pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #444;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
      margin-bottom: 12px;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 40px; }
    .field { margin-bottom: 6px; }
    .field .label { font-size: 9pt; color: #666; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; }
    .field .value { font-size: 11pt; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th { background: #f5f5f5; text-align: left; padding: 6px 10px; font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #444; border: 1px solid #ddd; }
    td { padding: 6px 10px; border: 1px solid #ddd; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .payment-row td { color: #1a5c1a; }
    .action-row td { color: #111; }
    .summary-box { background: #f9f9f9; border: 1px solid #ccc; padding: 14px 18px; border-radius: 4px; margin-bottom: 16px; }
    .summary-box .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11pt; }
    .summary-box .row.total { font-weight: bold; border-top: 1px solid #ccc; margin-top: 6px; padding-top: 8px; }
    .signature-section { margin-top: 48px; }
    .sig-block { display: inline-block; width: 260px; margin-right: 60px; vertical-align: top; }
    .sig-line { border-top: 1px solid #333; margin-top: 48px; padding-top: 4px; font-size: 9pt; color: #555; }
    .disclaimer {
      margin-top: 40px;
      padding-top: 14px;
      border-top: 1px solid #ccc;
      font-size: 8pt;
      color: #777;
      font-family: Arial, sans-serif;
      line-height: 1.5;
    }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 8.5pt; font-weight: bold; }
    .badge-payment { background: #d4edda; color: #155724; }
    .badge-action { background: #e8eaf6; color: #283593; }
    @media print { body { margin: 0; padding: 20px; } }
    .print-btn {
      position: fixed; top: 16px; right: 16px;
      background: #1a1a1a; color: white;
      border: none; padding: 8px 18px; border-radius: 6px;
      font-family: Arial, sans-serif; font-size: 13px; cursor: pointer;
    }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save PDF</button>

  <div class="header">
    <h1>Tenant Case File</h1>
    <div class="sub">Prepared by RentSentry · ${exportDate} · For use with legal counsel or collections</div>
  </div>

  <div class="section">
    <div class="section-title">Tenant Information</div>
    <div class="grid-2">
      <div>
        <div class="field"><div class="label">Full Name</div><div class="value">${tenant.name}</div></div>
        <div class="field"><div class="label">Unit</div><div class="value">Unit ${tenant.unit}${property?.name ? ` — ${property.name}` : ""}</div></div>
        ${property?.address ? `<div class="field"><div class="label">Property Address</div><div class="value">${property.address}</div></div>` : ""}
        ${tenant.email ? `<div class="field"><div class="label">Email</div><div class="value">${tenant.email}</div></div>` : ""}
        ${tenant.phone ? `<div class="field"><div class="label">Phone</div><div class="value">${tenant.phone}</div></div>` : ""}
      </div>
      <div>
        <div class="field"><div class="label">Monthly Rent</div><div class="value">$${(tenant.rent_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
        <div class="field"><div class="label">Current Balance Due</div><div class="value">$${(tenant.balance_due || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
        ${tenant.lease_start ? `<div class="field"><div class="label">Lease Start</div><div class="value">${fmtShort(tenant.lease_start)}</div></div>` : ""}
        ${tenant.lease_end ? `<div class="field"><div class="label">Lease End</div><div class="value">${fmtShort(tenant.lease_end)}</div></div>` : ""}
        <div class="field"><div class="label">Late Payments (history)</div><div class="value">${tenant.late_payment_count || 0} · avg ${tenant.days_late_avg || 0} days late</div></div>
        ${tenant.previous_delinquency ? `<div class="field"><div class="label">Prior Delinquency</div><div class="value">Yes</div></div>` : ""}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Account Summary</div>
    <div class="summary-box">
      <div class="row"><span>Total rent payments received</span><span>$${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
      <div class="row"><span>Number of payments</span><span>${(payments ?? []).length}</span></div>
      <div class="row"><span>Communications logged</span><span>${(interventions ?? []).length}</span></div>
      <div class="row total"><span>Current outstanding balance</span><span>$${(tenant.balance_due || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Payment History (${(payments ?? []).length} records)</div>
    ${(payments ?? []).length === 0 ? "<p>No payments recorded.</p>" : `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Amount</th>
          <th>Method</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${(payments ?? []).map(p => `
        <tr class="payment-row">
          <td>${fmtShort(p.date)}</td>
          <td>$${(p.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
          <td>${p.source || "—"}</td>
          <td>${p.note || "—"}</td>
        </tr>`).join("")}
      </tbody>
    </table>`}
  </div>

  <div class="section">
    <div class="section-title">Communication & Action Log (${timeline.length} records)</div>
    ${timeline.length === 0 ? "<p>No communications logged.</p>" : `
    <table>
      <thead>
        <tr>
          <th style="width:160px">Date & Time</th>
          <th style="width:90px">Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${timeline.map(e => `
        <tr class="${e.type === "payment" ? "payment-row" : "action-row"}">
          <td>${e.type === "payment" ? fmtShort(e.date) : fmtDateTime(e.date)}</td>
          <td><span class="badge badge-${e.type}">${e.type === "payment" ? "Payment" : "Action"}</span></td>
          <td>${e.content}</td>
        </tr>`).join("")}
      </tbody>
    </table>`}
  </div>

  <div class="section signature-section">
    <div class="section-title">Certification</div>
    <p style="margin-bottom:12px;font-size:10pt;">
      I certify that the information contained in this case file is accurate and complete to the best of my knowledge,
      and that all notices were served in accordance with applicable state and local law.
    </p>
    <div>
      <div class="sig-block">
        <div class="sig-line">
          ${pm?.pm_display_name ? `<strong>${pm.pm_display_name}</strong><br/>` : ""}
          Property Manager${pm?.pm_phone ? `<br/>${pm.pm_phone}` : ""}
        </div>
      </div>
      <div class="sig-block">
        <div class="sig-line">Date signed: _________________________</div>
      </div>
    </div>
  </div>

  <div class="disclaimer">
    This document was prepared with the assistance of RentSentry software and is provided for informational purposes only.
    It does not constitute legal advice. All information should be verified by a licensed attorney before use in legal proceedings.
    The property manager is solely responsible for the accuracy of information and compliance with applicable law.
  </div>

  <script>setTimeout(() => window.print(), 500)</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
