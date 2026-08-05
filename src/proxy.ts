import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { buildContentSecurityPolicy, cspHeaderName } from "@/lib/security/headers";

/**
 * Two jobs, in order: the Content-Security-Policy, then the Supabase session.
 *
 * Named `proxy` rather than `middleware` because Next.js 16.3 deprecated the
 * middleware file convention in favour of this one. Same execution model, same
 * `config.matcher`; only the file and function names changed.
 *
 * ## The policy
 *
 * This runs on every page so that *some* policy is always applied, but only the
 * admin gets a nonce. Next.js reads the nonce out of the CSP header on the
 * *request* and stamps it onto the inline scripts it emits, so those are allowed
 * while an injected script is not. That is only possible from here —
 * `next.config.ts` runs once at build time and cannot produce a per-request
 * value.
 *
 * The nonce is written to both the request and the response: the request copy is
 * what Next reads while rendering, and the response copy is what the browser
 * enforces.
 *
 * ## The session
 *
 * `getUser()` refreshes the auth cookie before the request reaches a Server
 * Component or Action, so an expired token becomes a refreshed one rather than a
 * silent authorization failure. Only attempted on `/admin` paths: the public site
 * has no session, and doing it everywhere would add a Supabase round trip to
 * every page view.
 *
 * This performs **no authorization**. That is `requireAdmin()`'s job, in the
 * Server Component or Action, against the `admin_users` table. A proxy runs
 * before the route is resolved and cannot be the security boundary.
 */
export async function proxy(request: NextRequest) {
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");

  /*
    A nonce only for the admin, because only the admin renders dynamically.

    Next stamps the nonce from the request header onto the inline scripts it
    emits while rendering. A statically generated page was rendered at build
    time, so there is nothing to stamp and a nonce policy would block Next's own
    scripts. Every admin route is dynamic; the public catalogue is static by
    design. See `buildContentSecurityPolicy`.
  */
  const nonce = isAdminRoute
    ? // base64 rather than hex: shorter header, same entropy. `crypto` is
      // available in the edge runtime.
      Buffer.from(crypto.randomUUID()).toString("base64")
    : null;

  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);

  // So `requireAdmin()` can send an unauthenticated administrator to the page
  // they asked for after signing in. Next does not expose the pathname to a
  // Server Component any other way.
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
    // Next reads this while rendering to stamp its own scripts.
    requestHeaders.set("Content-Security-Policy", csp);
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeaderName(), csp);

  if (!isAdminRoute) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Supabase not configured — the page itself reports it.
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        // Rebuilding the response drops the headers set above, so they are
        // reapplied. Forgetting this is how a refreshed session silently
        // arrives with no CSP.
        response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set(cspHeaderName(), csp);

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  /**
   * Every page, so the policy is universal — but not the things that are not
   * pages. Static assets, images and the favicon are served from the build
   * output and carry the constant headers from `next.config.ts`; running
   * this for them would add latency to every asset for a header they
   * cannot use.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
