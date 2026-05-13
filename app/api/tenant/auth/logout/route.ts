import { NextResponse } from "next/server"
import { TENANT_COOKIE } from "@/lib/tenant-auth"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(TENANT_COOKIE)
  return res
}
