import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const PLANS = {
  starter:   { amount: 2900, name: "RentSentry Starter",   desc: "Up to 5 units · All features included" },
  pro:       { amount: 5900, name: "RentSentry Pro",        desc: "Up to 20 units · All features included" },
  portfolio: { amount: 9900, name: "RentSentry Portfolio",  desc: "Up to 100 units · All features included" },
} as const

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const plan = (body.plan ?? "starter") as keyof typeof PLANS
  const config = PLANS[plan] ?? PLANS.starter

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: config.name, description: config.desc },
          unit_amount: config.amount,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: { user_id: user.id, plan },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  })

  return NextResponse.json({ url: session.url })
}
