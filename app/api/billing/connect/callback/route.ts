import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const userId = searchParams.get("state")

  if (!code || !userId) {
    return NextResponse.redirect(new URL("/dashboard/settings?connect=error", req.url))
  }

  try {
    const response = await stripe.oauth.token({ grant_type: "authorization_code", code })
    const stripeAccountId = response.stripe_user_id!

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase.from("profiles").update({
      stripe_account_id: stripeAccountId,
      stripe_connect_at: new Date().toISOString(),
    }).eq("id", userId)

    return NextResponse.redirect(new URL("/dashboard/settings?connect=success", req.url))
  } catch {
    return NextResponse.redirect(new URL("/dashboard/settings?connect=error", req.url))
  }
}
