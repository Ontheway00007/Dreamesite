/**
 * Central place for route construction, so a route can change in one edit.
 */

/** The map and listing experience. */
export const PROPERTIES_ROUTE = "/properties";

/** Canonical anchor for the homepage enquiry section. */
export const ENQUIRY_ANCHOR = "/#contact";

/** Detail route for a single property. */
export function propertyHref(slug: string): string {
  return `${PROPERTIES_ROUTE}/${slug}`;
}
