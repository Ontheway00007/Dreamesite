import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/**
 * `robots.txt`.
 *
 * Two states, and the distinction is the point.
 *
 * **A production deployment** allows crawling of the public site and disallows
 * `/admin`. The admin pages already send `noindex` from their own layout, but a
 * `noindex` only works after the page has been fetched — a crawler still
 * requests it, follows the login redirect, and spends budget discovering that a
 * private area exists. Disallowing the path is cheaper for both sides.
 *
 * **Anything else** — preview deployments, local development — disallows
 * everything. A preview URL is a full copy of the site, and one indexed preview
 * competing with production for the same content is a self-inflicted duplicate
 * content problem that is tedious to undo.
 *
 * `env.isIndexable` is the same flag the root layout uses for its `robots`
 * metadata, so the two cannot disagree.
 */
export default function robots(): MetadataRoute.Robots {
  if (!env.isIndexable) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // `/api/` is listed although none is public yet: adding a route later
        // should not silently make it crawlable.
        //
        // `/lab/` holds prototype surfaces used to review a feature before it
        // ships. They send `noindex` themselves, but they also carry synthetic
        // property data, and a crawler that fetches one before reading the tag
        // has already seen it.
        disallow: ["/admin", "/admin/", "/api/", "/lab/"],
      },
    ],
    sitemap: `${env.siteUrl}/sitemap.xml`,
    host: env.siteUrl,
  };
}
