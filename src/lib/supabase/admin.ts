import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Authenticated Supabase client for admin Server Actions and Route Handlers.
 *
 * Unlike the catalogue client (cookie-free, anon-key-only), this client:
 *
 * - reads the signed-in user's auth session from cookies,
 * - operates as the `authenticated` role,
 * - and is therefore subject to RLS, which decides what this particular
 *   administrator may see and do based on their `admin_users` row.
 *
 * ## There is no service-role client
 *
 * This client uses the **anon key plus the user's session**. It is not, and has
 * never been, a service-role client.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` is read by **no module in this application**. The
 * one module that used to need it — the public-location projection generator —
 * was rewritten in migration 0012 to run as the signed-in administrator and
 * write through `save_regenerated_public_location`, an admin-checked,
 * version-checked function. `.env.example` asks for the key to be left unset.
 *
 * That is a deliberate position, not an accident of refactoring: a key that
 * bypasses RLS cannot leak from an application that never loads it.
 *
 * ## How privileged work happens instead
 *
 * Operations that need more than an administrator's own RLS grants go through
 * `SECURITY DEFINER` functions, each of which checks `is_admin()` first and pins
 * its `search_path`. The location tables are the clearest example: direct
 * INSERT, UPDATE and DELETE are revoked, so `save_property_location`,
 * `clear_property_location` and `save_regenerated_public_location` are the only
 * way in. The function is the privilege, and the privilege is auditable.
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
