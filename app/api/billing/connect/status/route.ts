import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, stripe_charges_enabled")
    .eq("id", user.id)
    .single()

  if (!profile?.stripe_account_id) {
    return NextResponse.json({ connected: false, chargesEnabled: false })
  }

  try {
    const account = await stripe.accounts.retrieve(profile.stripe_account_id)
    const chargesEnabled = account.charges_enabled ?? false

    if (chargesEnabled !== (profile.stripe_charges_enabled ?? false)) {
      const svc = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      await svc.from("profiles").update({ stripe_charges_enabled: chargesEnabled }).eq("id", user.id)
    }

    return NextResponse.json({ connected: true, chargesEnabled })
  } catch {
    return NextResponse.json({ connected: true, chargesEnabled: profile.stripe_charges_enabled ?? false })
  }
}
