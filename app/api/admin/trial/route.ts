import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const ADMIN_ID = "b9988721-6b42-4387-a3be-a62920a3b46f"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { targetUserId, action, days } = await req.json()
  if (!targetUserId || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get current user metadata to read existing trial_ends_at
  const { data: { user: target } } = await service.auth.admin.getUserById(targetUserId)
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const currentEndsAt = target.user_metadata?.trial_ends_at
    ? new Date(target.user_metadata.trial_ends_at)
    : new Date(new Date(target.created_at).getTime() + 30 * 24 * 60 * 60 * 1000)

  let newMetadata: Record<string, unknown> = { ...target.user_metadata }

  if (action === "add_days") {
    const base = currentEndsAt > new Date() ? currentEndsAt : new Date()
    const newEnd = new Date(base.getTime() + (days ?? 7) * 24 * 60 * 60 * 1000)
    newMetadata.trial_ends_at = newEnd.toISOString()
    newMetadata.access_revoked = false
  } else if (action === "revoke") {
    // Set trial end to the past — immediately blocks access
    newMetadata.trial_ends_at = new Date(Date.now() - 1000).toISOString()
    newMetadata.access_revoked = true
  } else if (action === "reset") {
    delete newMetadata.trial_ends_at
    delete newMetadata.access_revoked
  }

  const { error } = await service.auth.admin.updateUserById(targetUserId, {
    user_metadata: newMetadata,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
