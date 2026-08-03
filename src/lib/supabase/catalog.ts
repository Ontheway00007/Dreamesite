import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Plain Supabase client for public catalogue reads.
 *
 * The repository needs a client that works during `next build` — the cookie
 * store isn't available there, so `@supabase/ssr`'s cookie client can't be
 * used. Public reads are protected by RLS against the anon key, which is the
 * same key the browser would hold anyway, so this client can never reach
 * anything a logged-out visitor shouldn't see.
 *
 * Authentication flows in Phase 6 will continue to use
 * `createSupabaseServerClient` from `@/lib/supabase/server`, where the cookie
 * session actually matters.
 */

let cached: SupabaseClient<Database> | null = null;
let cachedKey: string | null = null;

/**
 * A shared, cookie-free client for public reads. Safe to share — there is no
 * per-request state to leak between renders.
 */
export function createSupabaseCatalogClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cacheKey = `${url}::${key}`;
  if (cached && cachedKey === cacheKey) {
    return cached;
  }

  cached = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  cachedKey = cacheKey;

  return cached;
}

/** Reset the cached client. Tests only. */
export function resetSupabaseCatalogClientForTests(): void {
  cached = null;
  cachedKey = null;
}
