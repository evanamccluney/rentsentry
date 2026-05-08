import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get("account_id")
  const userId = searchParams.get("user_id")

  if (!accountId || !userId) {
    return NextResponse.redirect(new URL("/dashboard/settings?connect=error", req.url))
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/connect/refresh?account_id=${accountId}&user_id=${userId}`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?connect=success`,
    type: "account_onboarding",
  })

  return NextResponse.redirect(accountLink.url)
}
