/**
 * Typed access to runtime configuration.
 *
 * Public values are read through direct `process.env.NEXT_PUBLIC_*` references
 * so Next.js can inline them into the client bundle. Each getter fails loudly
 * with an actionable message instead of silently returning `undefined`.
 */

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing environment variable "${name}". Copy .env.example to .env.local and set it.`,
    );
  }

  return value;
}

export const env = {
  /** Supabase project URL, e.g. https://xxxxxxxx.supabase.co */
  get supabaseUrl(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },

  /** Supabase anon key. Safe for the browser; row level security must be on. */
  get supabaseAnonKey(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },

  /** Mapbox public access token (pk.*). */
  get mapboxToken(): string {
    return required(
      "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN",
      process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
    );
  },

  /** Canonical origin used for metadata and absolute URLs. */
  get siteUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  },
} as const;
