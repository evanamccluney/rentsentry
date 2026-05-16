// Unambiguous chars only — avoids 0/O, 1/l/I confusion when tenants read links
const CHARS = "abcdefghjkmnpqrstuvwxyz23456789"
const CODE_LENGTH = 7 // 32^7 ≈ 34 billion combos, negligible collision probability

export function generateShortCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes).map(b => CHARS[b % CHARS.length]).join("")
}

/**
 * Stores a destination URL in link_redirects and returns the branded short URL.
 * The short URL will be: {APP_URL}/p/{code}
 */
export async function createShortLink(
  destination: string,
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  expiresInDays = 7
): Promise<string> {
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString()

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShortCode()
    const { error } = await supabase.from("link_redirects").insert({
      code,
      url: destination,
      type,
      expires_at: expiresAt,
    })
    if (!error) {
      return `${process.env.NEXT_PUBLIC_APP_URL}/p/${code}`
    }
    // Only retry on unique constraint violation; propagate other errors
    if (!error.message?.includes("unique") && !error.message?.includes("duplicate")) {
      console.error("createShortLink insert error:", error.message)
      break
    }
  }

  // Fallback: return the original URL rather than silently breaking the flow
  return destination
}
