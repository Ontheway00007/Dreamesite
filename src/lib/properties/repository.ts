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
 * Two sources implement the same contract, and this module dispatches between
 * them:
 *
 * - **Local fixtures** — the committed demonstration data. Used for unit
 *   tests, CI, and development before a Supabase project is connected.
 * - **Supabase** — the real catalogue, whenever both public env values are
 *   present. Reads go through the anon key + RLS, so the browser-facing
 *   surface cannot touch a private table no matter what this code does wrong.
 *
 * Every consumer goes through these functions, and they all return published
 * properties — coordinates already reduced by the privacy rules or, with
 * Supabase, read straight out of the pre-computed
 * `property_public_locations` projection. When the private data changes, only
 * the projection regeneration script runs again.
 */

function activeSource(): PropertySource {
  return isSupabaseSourceAvailable() ? supabaseSource : localSource;
}

/**
 * Which source the app is currently reading. Exposed for tests and for any
 * future "demo data" badge on internal tooling.
 */
export function getActivePropertySourceName(): "supabase" | "local" {
  return isSupabaseSourceAvailable() ? "supabase" : "local";
}

/** Statuses first in showcase order, then newest, then alphabetically. */
function compareProperties(a: Property, b: Property): number {
  const statusDelta =
    propertyStatusOrder.indexOf(a.status) - propertyStatusOrder.indexOf(b.status);

  return statusDelta !== 0 ? statusDelta : a.name.localeCompare(b.name);
}

function sortedProperties(source: PropertySource): Promise<Property[]> {
  return source.getProperties().then((properties) =>
    [...properties].sort(compareProperties),
  );
}

/** Every property that may be shown publicly. */
export async function getProperties(): Promise<Property[]> {
  return sortedProperties(activeSource());
}

/** The subset promoted on the homepage. */
export async function getFeaturedProperties(): Promise<Property[]> {
  return (await sortedProperties(activeSource())).filter(
    (property) => property.isFeatured,
  );
}

/** A single property, or null when the slug does not exist. */
export async function getPropertyBySlug(
  slug: string,
): Promise<Property | null> {
  return activeSource().getPropertyBySlug(slug);
}

/** Slugs for static generation of property routes. */
export async function getPropertySlugs(): Promise<string[]> {
  return activeSource().getPropertySlugs();
}

/**
 * Other homes to show on a property page: same suburb first, then anything
 * else, so a page never ends without somewhere to go next.
 */
export async function getRelatedProperties(
  slug: string,
  limit = 3,
): Promise<Property[]> {
  if (isSupabaseSourceAvailable()) {
    return getSupabaseRelated(slug, limit);
  }

  const all = await sortedProperties(activeSource());
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
 * Normalises a stored description into keyed render blocks.
 *
 * `PropertyDescription.paragraphs` stores plain strings so existing local
 * content stays unchanged, but this shape detaches the UI from array indexes:
 * the render consumes `(key, text)` pairs rather than `(paragraph, index)`.
 * When CMS-managed paragraphs move to `PropertyParagraph` entries with `id`,
 * only this function changes — the JSX and the keys stay stable.
 */
export function descriptionBlocks(
  description: PropertyDescription,
): readonly DescriptionBlock[] {
  return description.paragraphs.map((text) => ({ key: text, text }));
}
