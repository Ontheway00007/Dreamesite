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

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Resolves the canonical origin without ever falling back to localhost in a
 * deployed environment:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` when set — the only value used in production.
 * 2. The Vercel production domain, so a deploy without step 1 still emits
 *    absolute URLs that resolve.
 * 3. The per-deployment Vercel URL for preview builds.
 * 4. localhost, which is only ever reached during local development.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (explicit) {
    return stripTrailingSlash(
      explicit.startsWith("http") ? explicit : `https://${explicit}`,
    );
  }

  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (process.env.VERCEL_ENV === "production" && productionDomain) {
    return `https://${productionDomain}`;
  }

  const deploymentDomain = process.env.VERCEL_URL;

  if (deploymentDomain) {
    return `https://${deploymentDomain}`;
  }

  return "http://localhost:3000";
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

  /**
   * True when both Supabase values are present — the repositories switch on
   * this rather than letting a partial configuration hard-fail a page load.
   */
  get isSupabaseConfigured(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    );
  },

  /**
   * True only for a real production deployment — never for local dev, CI or
   * preview builds. Production detection comes from `VERCEL_ENV`: in Next.js,
   * `NODE_ENV` is a compile-time constant the build bakes in, so it cannot be
   * toggled by runtime decisions. Repositories use this to decide whether a
   * missing Supabase configuration is acceptable (fixtures) or not (empty).
   */
  get isProductionDeployment(): boolean {
    return process.env.VERCEL_ENV === "production";
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
    return resolveSiteUrl();
  },

  /**
   * True only for the production deployment. Preview and local builds ask
   * search engines not to index them.
   */
  get isIndexable(): boolean {
    if (process.env.VERCEL_ENV) {
      return process.env.VERCEL_ENV === "production";
    }

    return process.env.NODE_ENV === "production";
  },
} as const;
