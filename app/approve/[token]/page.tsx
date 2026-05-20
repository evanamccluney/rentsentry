import { createClient } from "@supabase/supabase-js"
import ApprovalClient, { type ApprovalItem } from "./client"

interface BatchSnapshot {
  token: string
  expires_at: string
  items: ApprovalItem[]
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

export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: batches } = await supabase
    .from("interventions")
    .select("id, snapshot")
    .eq("type", "pm_batch_approval_pending")
    .filter("snapshot->>'token'", "eq", token)
    .limit(1)

  const batch = batches?.[0]
  if (!batch) return <Expired message="This link doesn't exist or has already been used." />

  const snap = batch.snapshot as BatchSnapshot
  if (new Date(snap.expires_at) < new Date()) {
    return <Expired message="This approval link has expired (links are valid for 24 hours)." />
  }

  return <ApprovalClient token={token} initialItems={snap.items} />
}
