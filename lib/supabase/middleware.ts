import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionToken, TENANT_COOKIE } from '@/lib/tenant-auth'

export async function updateSession(request: NextRequest) {
  // Protect /tenant/portal routes with tenant session
  if (request.nextUrl.pathname.startsWith('/tenant/portal')) {
    const token = request.cookies.get(TENANT_COOKIE)?.value
    const tenantId = token ? await verifySessionToken(token) : null
    if (!tenantId) {
      const url = request.nextUrl.clone()
      url.pathname = '/tenant/login'
      return NextResponse.redirect(url)
    }
  }
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protect all /dashboard routes
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  supabaseResponse.headers.set("x-pathname", request.nextUrl.pathname)
  return supabaseResponse
}
