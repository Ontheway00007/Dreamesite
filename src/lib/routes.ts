/**
 * Central place for route construction, so a route can change in one edit.
 */

/**
 * Property detail pages arrive with the Supabase-backed property system in the
 * next phase. Until that route exists, property links land on the enquiry
 * section instead of a dead URL. Flip this to true when `/properties/[slug]`
 * ships — the slugs in the property data are already the real identifiers.
 */
const PROPERTY_DETAIL_ROUTES_LIVE = false;

/** Canonical anchor for the homepage enquiry section. */
export const ENQUIRY_ANCHOR = "/#contact";

export function propertyHref(slug: string): string {
  return PROPERTY_DETAIL_ROUTES_LIVE ? `/properties/${slug}` : ENQUIRY_ANCHOR;
}
