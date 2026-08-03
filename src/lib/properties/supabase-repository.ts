import { env } from "@/lib/env";
import { createSupabaseCatalogClient } from "@/lib/supabase/catalog";
import { mapPropertyRow } from "@/lib/properties/row-mappers";
import type { PropertyJoinedRow } from "@/types/database";
import type { Property } from "@/types";
import type { PropertySource } from "@/lib/properties/source";

/**
 * Supabase-backed property source.
 *
 * One query per repository call, with related rows embedded by PostgREST —
 * no N+1, no client-side stitching. Errors degrade to an empty result rather
 * than throwing, because a public catalogue page must never surface a
 * database error, and a temporarily offline database must not break the
 * build either.
 */

const PROPERTY_SELECT = `
  *,
  location: property_public_locations (*),
  images: property_images (*),
  resources: property_resources (*),
  testimonials: property_testimonials (*)
`;

async function fetchRows(): Promise<PropertyJoinedRow[]> {
  const client = createSupabaseCatalogClient();

  const { data, error } = await client
    .from("properties")
    .select(PROPERTY_SELECT)
    .eq("is_published", true)
    .order("display_priority", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    // Server-side only: the failure is logged with context but the caller
    // receives an empty set — the browser never learns why.
    console.error("Failed to load published properties from Supabase.", error);
    return [];
  }

  return (data ?? []) as unknown as PropertyJoinedRow[];
}

async function getSupabaseProperties(): Promise<Property[]> {
  return (await fetchRows()).map(mapPropertyRow);
}

async function getSupabasePropertyBySlug(
  slug: string,
): Promise<Property | null> {
  if (!slug) {
    return null;
  }

  const client = createSupabaseCatalogClient();

  const { data, error } = await client
    .from("properties")
    .select(PROPERTY_SELECT)
    .eq("is_published", true)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error(
      `Failed to load property "${slug}" from Supabase.`,
      error,
    );
    return null;
  }

  return data ? mapPropertyRow(data as unknown as PropertyJoinedRow) : null;
}

async function getSupabasePropertySlugs(): Promise<string[]> {
  const rows = await fetchRows();

  return rows.map((row) => row.slug);
}

async function getSupabaseRelated(
  slug: string,
  limit: number,
): Promise<Property[]> {
  if (!slug) {
    return [];
  }

  const all = await getSupabaseProperties();
  const current = all.find((property) => property.slug === slug);

  if (!current) {
    return all.slice(0, limit);
  }

  const others = all.filter((property) => property.slug !== slug);
  const sameSuburb = others.filter(
    (property) => property.suburb === current.suburb,
  );
  const elsewhere = others.filter(
    (property) => property.suburb !== current.suburb,
  );

  return [...sameSuburb, ...elsewhere].slice(0, limit);
}

/**
 * Purposely no-throw: when Supabase is configured but unavailable, callers
 * see an empty catalogue, not a crashed page. The only hard failure is a
 * missing configuration, which means the wrong backend was selected.
 */
export const supabaseSource: PropertySource = {
  getProperties: getSupabaseProperties,
  getPropertyBySlug: getSupabasePropertyBySlug,
  getPropertySlugs: getSupabasePropertySlugs,
};

export { getSupabaseRelated };

/** True when the Supabase backend is usable. */
export function isSupabaseSourceAvailable(): boolean {
  return env.isSupabaseConfigured;
}
