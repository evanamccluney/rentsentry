import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  // Count active units for this user
  const { count } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active")

  const unitCount = count || 0

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "RentSentry — Revenue Protection",
            description: `${unitCount} active units × $4.00/unit/month`,
          },
          unit_amount: 400, // $4.00 in cents
          recurring: { interval: "month" },
        },
        quantity: Math.max(unitCount, 1),
      },
    ],
    metadata: {
      user_id: user.id,
      unit_count: String(unitCount),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  })

  return NextResponse.json({ url: session.url })
}
