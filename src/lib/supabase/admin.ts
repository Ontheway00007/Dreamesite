import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Authenticated Supabase client for admin Server Actions and Route Handlers.
 *
 * Unlike the catalog client (cookie-free, anon-key-only), this client:
 * - Reads the user's auth session from cookies
 * - Operates under the `authenticated` role
 * - RLS policies determine what this user can see/do based on admin_users membership
 *
 * This is NOT a service-role client. It respects RLS.
 * The service-role client remains isolated in generate-public-locations.ts.
 */
export async function createAdminClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies — safe to ignore.
        }
      },
    },
  });
}
