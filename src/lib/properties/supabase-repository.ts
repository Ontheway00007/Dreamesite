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

/**
 * Enough for cards, the map and the list.
 *
 * The embedded image selection is narrowed twice over: to the hero row by the
 * `image_type` filter applied at each call site, and to the handful of columns
 * a card actually reads. A card shows one image, so pulling a property's
 * entire gallery to render a thumbnail is work nobody asked for — and on the
 * explorer, that is every property's gallery on one page.
 *
 * No description body, no resources, no testimonials.
 */
const SUMMARY_SELECT = `
  id, slug, name, summary, status, suburb, state,
  bedrooms, bathrooms, car_spaces, land_size_sqm, house_size_sqm,
  price_display, completion_label, is_featured, display_priority,
  display_is_home, display_opening_note, current_stage_id,
  description_source,
  property_public_locations (
    location_visibility, public_latitude, public_longitude,
    public_address, marker_mode, location_label, accuracy_note,
    allow_directions
  ),
  property_images (id, image_type, storage_path, external_url, alt_text, is_published)
`;

/**
 * Restricts the embedded images to the hero row.
 *
 * PostgREST filters embedded resources without excluding parents, so a
 * property with no hero still comes back — it simply arrives with an empty
 * image list and renders the architectural placeholder.
 *
 * This is an optimisation, not a correctness control. `mapPropertyRow` locates
 * the hero among whatever rows it receives and ignores the rest, so if this
 * filter were removed the output would be identical, only more expensive.
 */
const HERO_ONLY_FILTER = { column: "property_images.image_type", value: "hero" } as const;

/**
 * Everything the detail page needs, including description and children.
 *
 * The embedded resources are deliberately **not** aliased. PostgREST names the
 * returned key after the alias when one is given, and `mapPropertyRow` reads
 * `property_images`, `property_public_locations`, `property_resources` and
 * `property_testimonials`. An earlier version aliased all four to shorter
 * names, so every one of those lookups found `undefined`: locations fell back
 * to "hidden", and no image, document or testimonial ever reached a page. The
 * fixtures used in development and CI do not go through this query, which is
 * why it went unnoticed.
 *
 * The key names here are part of the contract with the mapper. Renaming one
 * means renaming it in `PropertyJoinedRow` too.
 */
const DETAIL_SELECT = `
  *,
  property_public_locations (*),
  property_images (*),
  property_resources (*),
  property_testimonials (*),
  construction_updates (*),
  property_features (*)
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
      .eq(HERO_ONLY_FILTER.column, HERO_ONLY_FILTER.value)
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
      .eq(HERO_ONLY_FILTER.column, HERO_ONLY_FILTER.value)
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

  // Only need the suburb for ordering — avoid loading the full detail graph.
  const client = createSupabaseCatalogClient();
  const result = await client
    .from("properties")
    .select("suburb")
    .eq("is_published", true)
    .eq("slug", slug)
    .maybeSingle();

  if (result.error || !result.data) {
    return [];
  }

  const currentSuburb = (result.data as { suburb: string }).suburb;

  const rows = await maybeRows(
    `Failed to load related properties for "${slug}" from Supabase.`,
    client
      .from("properties")
      .select(SUMMARY_SELECT)
      .eq("is_published", true)
      .eq(HERO_ONLY_FILTER.column, HERO_ONLY_FILTER.value)
      .neq("slug", slug)
      .order("display_priority", { ascending: true })
      .order("name", { ascending: true }),
  );

  const others = (rows as unknown as SummaryRow[]).map(mapSummaryRow);
  const sameSuburb = others.filter(
    (property) => property.suburb === currentSuburb,
  );
  const elsewhere = others.filter(
    (property) => property.suburb !== currentSuburb,
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
