import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateSmsDraft } from "@/lib/generate-sms-draft"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { actionType, tenant } = await req.json()
  if (!actionType || !tenant?.name) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  // Pull latest situation intake logged by the landlord for this tenant
  const { data: intakeRows } = await supabase
    .from("interventions")
    .select("notes")
    .eq("tenant_id", tenant.id)
    .eq("type", "situation_intake")
    .order("sent_at", { ascending: false })
    .limit(1)
  const situationNotes = intakeRows?.[0]?.notes ?? null

  const draft = await generateSmsDraft(actionType, tenant, situationNotes)
  if (!draft) {
    return NextResponse.json({ error: "Draft generation failed" }, { status: 500 })
  }

  return NextResponse.json({ draft })
}
