import { propertyRecords } from "@/content/properties";
import { toPublicProperty } from "@/lib/properties/privacy";
import { propertyStatusOrder } from "@/lib/design/property-status";
import type { Property } from "@/types";

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
