import { env } from "@/lib/env";
import { localSource } from "@/lib/properties/local-repository";
import { isSupabaseSourceAvailable } from "@/lib/properties/supabase-repository";
import { createSupabaseCatalogClient } from "@/lib/supabase/catalog";

/**
 * The four fields a sitemap entry needs, and nothing else.
 *
 * A separate read rather than reusing `getProperties()`, which returns the full
 * detail graph — images, resources, features, construction updates, testimonials
 * and the location projection — for every property. The sitemap uses a slug and
 * a timestamp, so fetching the rest is a large query issued hourly to discard
 * almost all of it.
 *
 * `is_published` is filtered here as well as by RLS. The sitemap is a public
 * document that hands crawlers a list of URLs, so a draft slug appearing in it
 * would announce an unfinished property weeks before anyone chose to publish it.
 * Stating the condition in the query means it is visible at the point it matters
 * rather than only in a policy file.
 */
export interface SitemapEntry {
  readonly slug: string;
  readonly updatedAt: string | null;
  readonly isFeatured: boolean;
  /** A property asking not to be indexed is left out of the sitemap. */
  readonly noindex: boolean;
}

export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  if (!isSupabaseSourceAvailable()) {
    // Fixtures. A production deployment without Supabase configured shows an
    // empty catalogue, so its sitemap is empty too.
    if (env.isProductionDeployment) {
      return [];
    }

    const properties = await localSource.getProperties();

    return properties.map((property) => ({
      slug: property.slug,
      updatedAt: null,
      isFeatured: property.isFeatured,
      noindex: property.seo?.noindex === true,
    }));
  }

  const client = createSupabaseCatalogClient();

  const { data, error } = await client
    .from("properties")
    .select("slug, updated_at, is_featured, seo_noindex")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (error) {
    // Codes only. A sitemap failure is not worth a stack trace in production
    // logs, and the caller degrades to the static routes.
    console.error("[sitemap] Could not read properties", {
      code: error.code,
      message: error.message,
    });

    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    slug: string;
    updated_at: string | null;
    is_featured: boolean;
    seo_noindex: boolean | null;
  }>;

  return rows.map((row) => ({
    slug: row.slug,
    updatedAt: row.updated_at,
    isFeatured: row.is_featured,
    noindex: row.seo_noindex === true,
  }));
}
