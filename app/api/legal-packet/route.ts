import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateLegalPacket } from "@/lib/legal-packet"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId } = await req.json()
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 })

  // Fetch tenant + property
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("*, properties(name, address)")
    .eq("id", tenantId)
    .eq("user_id", user.id)
    .single()

  if (tenantErr || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  // Fetch interventions for this tenant
  const { data: interventions } = await supabase
    .from("interventions")
    .select("type, sent_at, status")
    .eq("tenant_id", tenantId)
    .order("sent_at", { ascending: true })

  const property = (tenant as { properties?: { name?: string; address?: string } }).properties

  const pdfBytes = await generateLegalPacket({
    tenant: {
      name: tenant.name,
      unit: tenant.unit,
      email: tenant.email || "",
      phone: tenant.phone || "",
      move_in_date: tenant.move_in_date || "",
      lease_start: tenant.lease_start || "",
      lease_end: tenant.lease_end || "",
      rent_amount: tenant.rent_amount || 0,
      balance_due: tenant.balance_due || 0,
      late_payment_count: tenant.late_payment_count || 0,
      previous_delinquency: tenant.previous_delinquency || false,
      last_payment_date: tenant.last_payment_date || "",
    },
    property: {
      name: property?.name || "Unknown Property",
      address: property?.address || "",
    },
    interventions: (interventions || []).map(i => ({
      type: i.type,
      sent_at: i.sent_at,
      status: i.status,
    })),
    generatedDate: new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric"
    }),
  })

  // Log the legal packet generation as an intervention
  await supabase.from("interventions").insert({
    tenant_id: tenantId,
    user_id: user.id,
    type: "legal_packet",
    status: "completed",
    sent_at: new Date().toISOString(),
  })

  const safeName = tenant.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="legal_packet_${safeName}_${Date.now()}.pdf"`,
    },
  })
}
