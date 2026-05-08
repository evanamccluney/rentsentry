import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getPlaidClient } from "@/lib/plaid"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user }, error } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ).auth.getUser(authHeader.replace("Bearer ", ""))

  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { public_token } = await req.json()
  if (!public_token) return NextResponse.json({ error: "Missing public_token" }, { status: 400 })

  const plaid = getPlaidClient()
  const exchangeRes = await plaid.itemPublicTokenExchange({ public_token })
  const { access_token, item_id } = exchangeRes.data

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.from("profiles").upsert({
    id: user.id,
    plaid_access_token: access_token,
    plaid_item_id: item_id,
    plaid_cursor: null,
    plaid_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
