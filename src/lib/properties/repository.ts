import { env } from "@/lib/env";
import { propertyStatusOrder } from "@/lib/design/property-status";
import { localSource } from "@/lib/properties/local-repository";
import {
  getSupabaseRelated,
  isSupabaseSourceAvailable,
  supabaseSource,
} from "@/lib/properties/supabase-repository";
import type { Property, PropertyDescription } from "@/types";
import type { PropertySource } from "@/lib/properties/source";

/**
 * Data access boundary for properties.
 *
 * Three sources implement the same public contract:
 *
 * - **Local fixtures** — the committed demonstration data. Used for unit
 *   tests, CI and development before a Supabase project is wired up.
 * - **Supabase** — the real catalogue, whenever both public env values are
 *   present. Reads go through the anon key plus RLS, so this file never
 *   needs to know what is safe — the database enforces it.
 * - **Empty** — chosen when Supabase is expected but unavailable in a
 *   production deployment, so a misconfigured launch never silently shows
 *   fictional homes. The empty catalogue already has a polished UI.
 */

type SourceChoice = "supabase" | "local" | "empty";

function chooseSource(): SourceChoice {
  if (isSupabaseSourceAvailable()) {
    return "supabase";
  }

  // Fictional data is helpful while developing, but a real deploy must never
  // pass it off as listings. Preview and test environments stay on fixtures.
  if (env.isProductionDeployment) {
    return "empty";
  }

  return "local";
}

function activeSource(): PropertySource | null {
  const choice = chooseSource();

  return choice === "empty" ? null : choice === "supabase" ? supabaseSource : localSource;
}

/**
 * Exposed for the richer state API in `catalogue.ts`. Never call this from a
 * component — go through the repository functions or `getCatalogue`.
 */
export function activePropertySource(): PropertySource | null {
  return activeSource();
}

/**
 * Which source the app is currently reading. Exposed for tests and any
 * future "demo data" badge on internal tooling.
 */
export function getActivePropertySourceName(): SourceChoice {
  return chooseSource();
}

/** Statuses first in showcase order, then alphabetically by name. */
function compareProperties(a: Property, b: Property): number {
  const statusDelta =
    propertyStatusOrder.indexOf(a.status) - propertyStatusOrder.indexOf(b.status);

  return statusDelta !== 0 ? statusDelta : a.name.localeCompare(b.name);
}

/**
 * The homepage subset. The source applies its own ordering — display priority
 * first when Supabase is active (that is the administrator's intent), or the
 * catalog order defined by the fixtures otherwise.
 */
export async function getFeaturedProperties(): Promise<Property[]> {
  const source = activeSource();

  if (source === null) {
    return [];
  }

  return source.getFeaturedProperties();
}

/**
 * The full published catalogue, in display order.
 *
 * When Supabase is active, the source returns properties in the
 * administrator's priority order (display_priority ASC, name ASC) — that
 * ordering is the admin's intent and must not be overridden.
 *
 * When local fixtures are active, the status showcase order (move-in-ready
 * first, sold last) is applied since the fixtures have no admin context.
 */
export async function getProperties(): Promise<Property[]> {
  const source = activeSource();

  if (source === null) {
    return [];
  }

  const properties = await source.getProperties();

  // Supabase source already returns in admin-defined order.
  if (isSupabaseSourceAvailable()) {
    return properties;
  }

  // Local fixtures: sort by status showcase order, then name.
  return properties.sort(compareProperties);
}

/** A single property, or null when the slug does not exist. */
export async function getPropertyBySlug(
  slug: string,
): Promise<Property | null> {
  const source = activeSource();

  if (source === null) {
    return null;
  }

  return source.getPropertyBySlug(slug);
}

/** Slugs for static generation of property routes. */
export async function getPropertySlugs(): Promise<string[]> {
  const source = activeSource();

  if (source === null) {
    return [];
  }

  return source.getPropertySlugs();
}

/**
 * Other homes to show on a property page: same suburb first, then anything
 * else. The current home is always excluded.
 */
export async function getRelatedProperties(
  slug: string,
  limit = 3,
): Promise<Property[]> {
  if (!slug) {
    return [];
  }

  if (isSupabaseSourceAvailable()) {
    return getSupabaseRelated(slug, limit);
  }

  const all = await getProperties();
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

export interface DescriptionBlock {
  readonly key: string;
  readonly text: string;
}

/**
 * Normalises a description into keyed render blocks.
 *
 * Local fixtures store plain strings; the Supabase path stores
 * `PropertyParagraph[]` blocks with stable IDs. Both normalise to the same
 * render shape — `id` when it exists, the paragraph text otherwise — so
 * React keys never depend on array index.
 */
export function descriptionBlocks(
  description: PropertyDescription,
): readonly DescriptionBlock[] {
  return description.paragraphs.map((paragraph) => ({
    key: paragraph.id,
    text: paragraph.text,
  }));
}
