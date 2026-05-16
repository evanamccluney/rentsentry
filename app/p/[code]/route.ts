import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from("link_redirects")
    .select("url, expires_at")
    .eq("code", code)
    .single()

  if (!data) {
    return NextResponse.redirect(new URL("/pay/expired", req.url))
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.redirect(new URL("/pay/expired", req.url))
  }

  return NextResponse.redirect(data.url, { status: 302 })
}
