import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("auto_mode")
    .eq("id", user.id)
    .single()

  return NextResponse.json({ auto_mode: profile?.auto_mode ?? false })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { auto_mode } = await req.json()

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, auto_mode }, { onConflict: "id" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, auto_mode })
}
