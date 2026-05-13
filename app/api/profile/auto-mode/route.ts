import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { revalidateTag } from "next/cache"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { enabled } = await req.json() as { enabled: boolean }

  const { error } = await supabase
    .from("profiles")
    .update({ auto_mode: enabled, updated_at: new Date().toISOString() })
    .eq("id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`profile-${user.id}`, 'max')

  return NextResponse.json({ ok: true, auto_mode: enabled })
}
