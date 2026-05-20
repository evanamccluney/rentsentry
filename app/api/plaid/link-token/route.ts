import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getPlaidClient } from "@/lib/plaid"
import { Products, CountryCode } from "plaid"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user }, error } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ).auth.getUser(authHeader.replace("Bearer ", ""))

  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const plaid = getPlaidClient()
  const response = await plaid.linkTokenCreate({
    user: { client_user_id: user.id },
    client_name: "RentSentry",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/plaid`,
  })

  return NextResponse.json({ link_token: response.data.link_token })
}
