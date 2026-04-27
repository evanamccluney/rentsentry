import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { tenantId, offerAmount, vacateDate, customNote } = await req.json()

  const [{ data: tenant }, { data: profile }] = await Promise.all([
    supabase
      .from("tenants")
      .select("name, unit, rent_amount, balance_due, previous_delinquency, late_payment_count, properties(name, address, state)")
      .eq("id", tenantId)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("profiles")
      .select("pm_display_name, pm_phone")
      .eq("id", user.id)
      .single(),
  ])

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const prop = tenant.properties as { name?: string; address?: string; state?: string } | null
  const pmName = profile?.pm_display_name || "Property Manager"
  const pmPhone = profile?.pm_phone || ""
  const pmEmail = user.email || ""
  const propertyAddress = prop?.address ? `${prop.address}` : prop?.name || "the property"
  const unitStr = `Unit ${tenant.unit}${prop?.name ? `, ${prop.name}` : ""}`
  const monthsOwed = tenant.rent_amount > 0 ? Math.round((tenant.balance_due / tenant.rent_amount) * 10) / 10 : 0
  const vacateDateFormatted = new Date(vacateDate).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  })
  const todayFormatted = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })

  const prompt = `Write a professional Cash for Keys offer letter from a property manager to a tenant.

Output ONLY the letter body — no preamble, no "here is the letter", no explanation. Start directly with the date line.

Use this exact data — do not invent any details not provided:
- Date: ${todayFormatted}
- Property manager / sender: ${pmName}
- PM phone: ${pmPhone || "[Phone]"}
- PM email: ${pmEmail || "[Email]"}
- Tenant name: ${tenant.name}
- Unit / property: ${unitStr}
- Property address: ${propertyAddress}
- Current balance owed: $${(tenant.balance_due || 0).toLocaleString()} (approximately ${monthsOwed} months)
- Cash for Keys offer amount: $${Number(offerAmount).toLocaleString()}
- Vacate-by date: ${vacateDateFormatted}
${customNote ? `- Additional note from PM: ${customNote}` : ""}

Letter requirements:
1. Open with the date, then the tenant's name and unit as the address block
2. RE: line: "Cash for Keys Agreement Offer"
3. Tone: professional, respectful, and non-threatening — this is a business offer, not a threat
4. Clearly state the offer amount and vacate date in the first body paragraph
5. List the conditions to receive payment (3–4 bullet points): vacate on or before the date, leave unit clean and undamaged beyond normal wear, remove all belongings, return all keys and access devices
6. State that payment will be made upon key return and satisfactory walk-through inspection
7. State the offer expires in 7 days from the date of the letter
8. Invite the tenant to contact the PM to discuss or accept
9. Close with a professional sign-off, PM name, phone, and email
10. Keep the letter under 350 words — clear and direct
11. Do NOT include any legal disclaimer — that will be added separately`

  const openai = getOpenAI()
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  })

  const letterText = response.choices[0].message.content || ""

  return NextResponse.json({
    letter: letterText,
    meta: {
      tenantName: tenant.name,
      unit: unitStr,
      propertyAddress,
      pmName,
      pmPhone,
      pmEmail,
      offerAmount,
      vacateDate: vacateDateFormatted,
    },
  })
}
