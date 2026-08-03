import { env } from "@/lib/env";
import { createSupabaseCatalogClient } from "@/lib/supabase/catalog";
import { mapPropertyRow } from "@/lib/properties/row-mappers";
import type { PropertyJoinedRow } from "@/types/database";
import type { Property } from "@/types";
import type { PropertySource } from "@/lib/properties/source";

/**
 * Supabase-backed property source.
 *
 * Read paths are shaped per call site so a slug lookup never pulls every
 * image, and the homepage never waits on the detail-page payload. Every query
 * hits public catalogue tables only — private tables are out of reach under
 * the RLS configuration, and nothing here joins to them anyway.
 *
 * Errors degrade to an empty result rather than throwing, because a public
 * page must never surface a database failure and an offline database must
 * not break the build either.
 */

/* --- Column sets --------------------------------------------------------- */

/** Enough for cards, the map and the list. No description body, no children. */
const SUMMARY_SELECT = `
  id, slug, name, summary, status, suburb, state,
  bedrooms, bathrooms, car_spaces, land_size_sqm, house_size_sqm,
  price_display, completion_label, is_featured, display_priority,
  display_is_home, display_opening_note, current_stage_id,
  location: property_public_locations (
    location_visibility, public_latitude, public_longitude,
    public_address, marker_mode, location_label, accuracy_note,
    allow_directions
  ),
  images: property_images (storage_path)
`;

/** Everything the detail page needs, including description and children. */
const DETAIL_SELECT = `
  *,
  location: property_public_locations (*),
  images: property_images (*),
  resources: property_resources (*),
  testimonials: property_testimonials (*)
`;

/* --- Row mapping ---------------------------------------------------------- */

type SummaryRow = Omit<
  PropertyJoinedRow,
  "property_resources" | "property_testimonials"
>;

function mapSummaryRow(row: SummaryRow): Property {
  return mapPropertyRow({
    ...row,
    property_resources: null,
    property_testimonials: null,
  });
}

/* --- Helpers -------------------------------------------------------------- */

function logServerError(context: string, error: unknown): void {
  // Server-side only: detailed logs stay in infrastructure, never in the
  // browser.
  console.error(context, error);
}

async function maybeRows<T>(
  context: string,
  builder: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await Promise.resolve(builder);

  if (error) {
    logServerError(context, error);
    return [];
  }

  return data ?? [];
}

async function maybeRow<T>(
  context: string,
  builder: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T | null> {
  const { data, error } = await Promise.resolve(builder);

  if (error) {
    logServerError(context, error);
    return null;
  }

  return data;
}

/* --- Public reads --------------------------------------------------------- */

/** Homepage: featured, summary fields only, in admin-defined order. */
async function getSupabaseFeaturedProperties(): Promise<Property[]> {
  const client = createSupabaseCatalogClient();
  const rows = await maybeRows(
    "Failed to load featured properties from Supabase.",
    client
      .from("properties")
      .select(SUMMARY_SELECT)
      .eq("is_published", true)
      .eq("is_featured", true)
      .order("display_priority", { ascending: true })
      .order("name", { ascending: true }),
  );

  return rows.map((row) => mapSummaryRow(row as unknown as SummaryRow));
}

/** List page: summary fields only, in admin-defined order. */
async function getSupabaseProperties(): Promise<Property[]> {
  const client = createSupabaseCatalogClient();
  const rows = await maybeRows(
    "Failed to load published properties from Supabase.",
    client
      .from("properties")
      .select(SUMMARY_SELECT)
      .eq("is_published", true)
      .order("display_priority", { ascending: true })
      .order("name", { ascending: true }),
  );

  return rows.map((row) => mapSummaryRow(row as unknown as SummaryRow));
}

/** Detail page: complete row graph for one slug. */
async function getSupabasePropertyBySlug(
  slug: string,
): Promise<Property | null> {
  if (!slug) {
    return null;
  }

  const client = createSupabaseCatalogClient();
  const row = await maybeRow(
    `Failed to load property "${slug}" from Supabase.`,
    client
      .from("properties")
      .select(DETAIL_SELECT)
      .eq("is_published", true)
      .eq("slug", slug)
      .maybeSingle(),
  );

  return row ? mapPropertyRow(row as unknown as PropertyJoinedRow) : null;
}

/** Slugs only — the smallest possible read. */
async function getSupabasePropertySlugs(): Promise<string[]> {
  const client = createSupabaseCatalogClient();
  const rows = await maybeRows(
    "Failed to load property slugs from Supabase.",
    client
      .from("properties")
      .select("slug")
      .eq("is_published", true),
  );

  return rows.map((row) => (row as { slug: string }).slug);
}

/** Suburb-first related homes, excluding the current one. */
export async function getSupabaseRelated(
  slug: string,
  limit: number,
): Promise<Property[]> {
  if (!slug) {
    return [];
  }

  const current = await getSupabasePropertyBySlug(slug);

  if (!current) {
    return [];
  }

  const client = createSupabaseCatalogClient();
  const rows = await maybeRows(
    `Failed to load related properties for "${slug}" from Supabase.`,
    client
      .from("properties")
      .select(SUMMARY_SELECT)
      .eq("is_published", true)
      .neq("slug", slug)
      .order("display_priority", { ascending: true })
      .order("name", { ascending: true }),
  );

  const others = (rows as unknown as SummaryRow[]).map(mapSummaryRow);
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
 * missing configuration, which means the wrong backend was selected at the
 * dispatcher level.
 */
export const supabaseSource: PropertySource = {
  getProperties: getSupabaseProperties,
  getFeaturedProperties: getSupabaseFeaturedProperties,
  getPropertyBySlug: getSupabasePropertyBySlug,
  getPropertySlugs: getSupabasePropertySlugs,
};

/** True when the Supabase backend is usable. */
export function isSupabaseSourceAvailable(): boolean {
  return env.isSupabaseConfigured;
}
