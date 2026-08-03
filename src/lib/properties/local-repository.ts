import { propertyRecords } from "@/content/properties";
import { toPublicProperty } from "@/lib/properties/privacy";
import type { Property } from "@/types";
import type { PropertySource } from "@/lib/properties/source";

/**
 * Reads properties from the committed demonstration records.
 *
 * This is the source three places rely on even once Supabase exists:
 * unit tests, local development before a project is connected, and CI. In
 * production with Supabase configured but unreachable it is never used — the
 * site degrades to the empty state instead of pretending demonstration homes
 * are real listings.
 */

function publishedProperties(): Property[] {
  return propertyRecords.map(toPublicProperty);
}

/** Every property that may be shown publicly, unsorted. */
export async function getLocalProperties(): Promise<Property[]> {
  return publishedProperties();
}

/** Homepage subset: featured properties only. */
export async function getLocalFeaturedProperties(): Promise<Property[]> {
  return publishedProperties().filter((property) => property.isFeatured);
}

/** A single property, or null when the slug does not exist. */
export async function getLocalPropertyBySlug(
  slug: string,
): Promise<Property | null> {
  const match = propertyRecords.find((record) => record.slug === slug);

  return match ? toPublicProperty(match) : null;
}

/** Slugs for static generation of property routes. */
export async function getLocalPropertySlugs(): Promise<string[]> {
  return propertyRecords.map((record) => record.slug);
}

export const localSource: PropertySource = {
  getProperties: getLocalProperties,
  getFeaturedProperties: getLocalFeaturedProperties,
  getPropertyBySlug: getLocalPropertyBySlug,
  getPropertySlugs: getLocalPropertySlugs,
};
