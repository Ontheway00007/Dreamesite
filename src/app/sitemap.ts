import type { MetadataRoute } from "next";

import { env } from "@/lib/env";
import { getSitemapEntries } from "@/lib/properties/sitemap-entries";
import { PROPERTIES_ROUTE, propertyHref } from "@/lib/routes";

/**
 * `sitemap.xml`.
 *
 * Lists the two static public routes and every published property.
 *
 * ## Only what a visitor can reach
 *
 * `getProperties()` returns published properties — drafts are excluded by RLS
 * and again by the row mapper — so a draft cannot appear here. That matters more
 * than it sounds: a sitemap is a public document, and listing a draft slug would
 * announce an unfinished property's URL to every crawler that reads it, weeks
 * before anyone decided to publish it.
 *
 * A property carrying its own `noindex` override is also dropped. Including a
 * URL in the sitemap while asking search engines not to index it is a
 * contradiction — the sitemap says "please index this" — and it is the kind that
 * shows up in Search Console as a warning nobody can explain.
 *
 * ## Dates
 *
 * `lastModified` uses the property's own `updatedAt` where it exists. Emitting
 * "now" for every entry on every crawl, which is the tempting shortcut, tells a
 * crawler that the whole site changed every time it looks — after which it stops
 * believing the field.
 *
 * ## Failure
 *
 * If the properties cannot be read, the static routes are still returned. A
 * sitemap listing two real URLs is useful; a 500 teaches the crawler to stop
 * asking.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: env.siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${env.siteUrl}${PROPERTIES_ROUTE}`,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  // A preview deployment disallows everything in robots.txt, so its sitemap
  // should not advertise content either.
  if (!env.isIndexable) {
    return staticRoutes;
  }

  let entries: Awaited<ReturnType<typeof getSitemapEntries>>;

  try {
    entries = await getSitemapEntries();
  } catch (cause) {
    console.error("[sitemap] Could not list properties", cause);
    return staticRoutes;
  }

  const propertyRoutes: MetadataRoute.Sitemap = entries
    .filter((entry) => !entry.noindex)
    .map((entry) => ({
      url: `${env.siteUrl}${propertyHref(entry.slug)}`,
      lastModified: entry.updatedAt ? new Date(entry.updatedAt) : undefined,
      changeFrequency: "weekly" as const,
      // Featured homes are the ones the business is actively selling. Priority
      // is a hint and a weak one, but it costs nothing to make it honest.
      priority: entry.isFeatured ? 0.8 : 0.7,
    }));

  return [...staticRoutes, ...propertyRoutes];
}
