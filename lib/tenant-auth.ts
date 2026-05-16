import { cookies } from "next/headers"

export const TENANT_COOKIE = "rs_tenant"
export const PENDING_PHONE_COOKIE = "rs_pending_phone"
export const SESSION_DAYS = 7

async function hmacHex(data: string): Promise<string> {
  const secret = process.env.TENANT_SESSION_SECRET
  if (!secret) throw new Error("TENANT_SESSION_SECRET env var is not set")
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
}

export async function createSessionToken(tenantId: string): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 86400000
  const payload = `${tenantId}.${expires}`
  const sig = await hmacHex(payload)
  return `${payload}.${sig}`
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const lastDot = token.lastIndexOf(".")
    if (lastDot === -1) return null
    const payload = token.slice(0, lastDot)
    const sig = token.slice(lastDot + 1)
    const firstDot = payload.indexOf(".")
    if (firstDot === -1) return null
    const tenantId = payload.slice(0, firstDot)
    const expires = parseInt(payload.slice(firstDot + 1))
    if (isNaN(expires) || Date.now() > expires) return null
    const expectedSig = await hmacHex(payload)
    if (sig !== expectedSig) return null
    return tenantId
  } catch {
    return null
  }
}

export async function getTenantIdFromSession(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TENANT_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}
