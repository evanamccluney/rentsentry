import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const VALID_STATUSES = [
  "paid", "payment_plan", "eviction_filed", "vacated", "collections",
  "cfk_accepted", "cfk_declined", "cfk_in_discussion", "cfk_switched", "cfk_paused",
  null,
]

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId, resolution_status } = await req.json()
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 })
  if (!VALID_STATUSES.includes(resolution_status)) {
    return NextResponse.json({ error: "Invalid resolution_status" }, { status: 400 })
  }

  const { error } = await supabase
    .from("tenants")
    .update({ resolution_status })
    .eq("id", tenantId)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, resolution_status })
}
