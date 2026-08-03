import { propertyRecords } from "@/content/properties";
import { toPublicProperty } from "@/lib/properties/privacy";
import { propertyStatusOrder } from "@/lib/design/property-status";
import type { Property, PropertyDescription } from "@/types";

/**
 * Data access boundary for properties.
 *
 * Every consumer goes through these functions, and they all return published
 * properties — coordinates already reduced by the privacy rules. When Supabase
 * replaces the local file, only this module changes: the functions are already
 * asynchronous so no caller has to be rewritten.
 */

/** Statuses first in showcase order, then alphabetically by name. */
function compareProperties(a: Property, b: Property): number {
  const statusDelta =
    propertyStatusOrder.indexOf(a.status) - propertyStatusOrder.indexOf(b.status);

  return statusDelta !== 0 ? statusDelta : a.name.localeCompare(b.name);
}

function publishedProperties(): Property[] {
  return propertyRecords.map(toPublicProperty).sort(compareProperties);
}

/** Every property that may be shown publicly. */
export async function getProperties(): Promise<Property[]> {
  return publishedProperties();
}

/** The subset promoted on the homepage. */
export async function getFeaturedProperties(): Promise<Property[]> {
  return publishedProperties().filter((property) => property.isFeatured);
}

/** A single property, or null when the slug does not exist. */
export async function getPropertyBySlug(
  slug: string,
): Promise<Property | null> {
  const match = propertyRecords.find((record) => record.slug === slug);

  return match ? toPublicProperty(match) : null;
}

/** Slugs for static generation of property routes. */
export async function getPropertySlugs(): Promise<string[]> {
  return propertyRecords.map((record) => record.slug);
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

/**
 * Other homes to show on a property page: same suburb first, then anything else,
 * so a page never ends without somewhere to go next.
 */
export async function getRelatedProperties(
  slug: string,
  limit = 3,
): Promise<Property[]> {
  const all = publishedProperties();
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
