import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import twilio from "twilio"
import { normalizePhone } from "@/lib/phone"
import { classifyTenantProfile } from "@/lib/tenant-profiles"
import { planFollowupSms, planEscalationSms } from "@/lib/sms-templates"

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!

interface BatchItem {
  index: number
  tenantId: string
  tenantName: string
  balanceDue: number
  type: 'followup' | 'escalation'
  offerUrl: string | null
  profile: string
  daysSince: number
  status: 'pending' | 'approved' | 'declined'
}

interface BatchSnapshot {
  token: string
  expires_at: string
  items: BatchItem[]
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { index, decision } = await req.json() as { index: number; decision: 'yes' | 'no' }

  if (decision !== 'yes' && decision !== 'no') {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: batches } = await supabase
    .from("interventions")
    .select("id, user_id, snapshot")
    .eq("type", "pm_batch_approval_pending")
    .filter("snapshot->>'token'", "eq", token)
    .limit(1)

  const batch = batches?.[0]
  if (!batch) return NextResponse.json({ error: "Batch not found or expired" }, { status: 404 })

  const snap = batch.snapshot as BatchSnapshot

  if (new Date(snap.expires_at) < new Date()) {
    return NextResponse.json({ error: "Approval link has expired" }, { status: 410 })
  }

  const item = snap.items.find(i => i.index === index)
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: "Already actioned" }, { status: 409 })

  const updatedItems = snap.items.map(i =>
    i.index === index ? { ...i, status: decision === 'yes' ? 'approved' as const : 'declined' as const } : i
  )

  if (decision === 'no') {
    await supabase.from("interventions")
      .update({ snapshot: { ...snap, items: updatedItems } })
      .eq("id", batch.id)
    return NextResponse.json({ ok: true, status: "declined" })
  }

  // YES — fetch tenant, send SMS
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, balance_due, days_late_avg, late_payment_count, previous_delinquency, rent_amount, phone, sms_opted_out")
    .eq("id", item.tenantId)
    .single()

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  if (!tenant.phone || tenant.sms_opted_out) {
    return NextResponse.json({ error: "Tenant has no phone or has opted out" }, { status: 422 })
  }

  const phone = normalizePhone(tenant.phone)
  if (!phone) return NextResponse.json({ error: "Invalid phone number" }, { status: 422 })

  const tenantProfile = classifyTenantProfile(
    tenant.days_late_avg ?? 0, tenant.late_payment_count ?? 0,
    tenant.previous_delinquency ?? false, tenant.balance_due ?? 0, tenant.rent_amount ?? 0,
  )
  const firstName = (tenant.name as string).split(" ")[0]
  const balance = (tenant.balance_due ?? 0) > 0 ? (tenant.balance_due as number) : item.balanceDue

  const smsBody = item.type === 'escalation'
    ? planEscalationSms(tenantProfile, firstName, balance, item.daysSince)
    : planFollowupSms(tenantProfile, firstName, balance, item.offerUrl ?? null)

  try {
    await twilioClient.messages.create({ from: FROM_NUMBER, to: phone, body: smsBody })

    await supabase.from("interventions").insert({
      tenant_id: item.tenantId,
      user_id: batch.user_id,
      type: item.type === 'escalation' ? "plan_escalation" : "plan_followup",
      status: "sent",
      sent_at: new Date().toISOString(),
      snapshot: { balance_due: balance, profile: tenantProfile, initiated_by: "pm_web_approval" },
    })

    await supabase.from("interventions")
      .update({ snapshot: { ...snap, items: updatedItems } })
      .eq("id", batch.id)

    const allDone = updatedItems.every(i => i.status !== 'pending')
    if (allDone) {
      await supabase.from("interventions").update({ status: "resolved" }).eq("id", batch.id)
    }

    return NextResponse.json({ ok: true, status: "sent" })
  } catch (e) {
    console.error(`approve-api: SMS send failed — tenant ${item.tenantId}:`, e)
    return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 })
  }
}
