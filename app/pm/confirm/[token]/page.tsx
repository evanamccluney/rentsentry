import { createClient } from "@supabase/supabase-js"
import ConfirmClient, { type ConfirmItem } from "./client"

interface ConfirmSnapshot {
  token: string
  expires_at: string
  confirmations: ConfirmItem[]
  date: string
}

function Expired({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-zinc-400 text-sm">{message}</p>
        <p className="text-zinc-600 text-xs mt-1">Log into RentSentry to view tenant status.</p>
      </div>
    </div>
  )
}

export default async function PmConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: rows } = await supabase
    .from("interventions")
    .select("id, snapshot")
    .eq("type", "pm_confirmation_sent")
    .filter("snapshot->>'token'", "eq", token)
    .limit(1)

  const row = rows?.[0]
  if (!row) return <Expired message="This link doesn't exist or has already been used." />

  const snap = row.snapshot as ConfirmSnapshot
  if (new Date(snap.expires_at) < new Date()) {
    return <Expired message="This confirmation link has expired (links are valid for 24 hours)." />
  }

  return <ConfirmClient token={token} initialItems={snap.confirmations} />
}
