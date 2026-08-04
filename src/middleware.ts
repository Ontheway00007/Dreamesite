import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";

/**
 * Middleware for Supabase Auth session refresh.
 *
 * Runs on every request to /admin/* routes. Its job is to refresh the
 * auth session cookie before the request reaches a Server Component or
 * Action. Without this, expired tokens would cause silent auth failures.
 *
 * This middleware does NOT perform authorization — that happens in
 * `requireAdmin()` inside Server Components and Actions.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Supabase not configured — let the page handle it
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Update request cookies for downstream Server Components
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Create a new response that carries the updated cookies back
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session. This writes updated cookies if the token was refreshed.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*"],
};
