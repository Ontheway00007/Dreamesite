import "server-only";

import { logAdminError } from "@/lib/admin/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dashboard counts and the global media overview.
 *
 * ## Why `head: true` everywhere in the metrics
 *
 * A count is one integer. Reading the rows to length them transfers the whole
 * table to compute a number PostgreSQL already knows, and on `enquiries` that
 * means moving names, email addresses and message bodies across the network to
 * draw a card that says "12". `select("id", { count: "exact", head: true })`
 * sends no rows at all — the count arrives in the `Content-Range` header.
 *
 * ## Why the media overview is different
 *
 * It genuinely needs per-property figures, and PostgREST cannot group. Rather
 * than one request per property — which is a query per row, growing with the
 * catalogue — it reads two narrow projections (`property_id`, `is_published`,
 * and for images `alt_text` and `image_type`) and aggregates them in one pass.
 * Those columns are small and the row count is bounded by how much media a
 * builder actually has. The cap below makes the bound explicit rather than
 * hoping.
 */

/**
 * Ceiling on the media rows the overview reads.
 *
 * Generous — a builder with 40 homes and 25 images each is at 1,000. If a
 * catalogue ever passes this, the page says so rather than quietly reporting
 * counts that are too low.
 */
const MEDIA_ROW_CAP = 5_000;

export interface DashboardMetrics {
  readonly properties: {
    readonly total: number;
    readonly published: number;
    readonly draft: number;
    /**
     * Properties with no location configured. `property_location_settings` is
     * at most one row per property, so the difference between the two counts is
     * exactly the number with none — and publishing is blocked without one.
     */
    readonly missingLocation: number;
  };
  readonly enquiries: {
    readonly total: number;
    readonly unread: number;
  };
  readonly images: {
    readonly total: number;
    readonly published: number;
    /**
     * Images with no alt text. These cannot be published — the publish guard
     * refuses them — so this is a queue of work, not a warning.
     */
    readonly missingAltText: number;
  };
  readonly content: {
    readonly constructionUpdates: number;
    readonly features: number;
  };
  readonly failed: boolean;
}

const EMPTY_METRICS: DashboardMetrics = {
  properties: { total: 0, published: 0, draft: 0, missingLocation: 0 },
  enquiries: { total: 0, unread: 0 },
  images: { total: 0, published: 0, missingAltText: 0 },
  content: { constructionUpdates: 0, features: 0 },
  failed: true,
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = await createAdminClient();

  /** One `head` count. Returns null on failure so a partial page is honest. */
  const count = async (
    table:
      | "properties"
      | "property_location_settings"
      | "enquiries"
      | "property_images"
      | "construction_updates"
      | "property_features",
    apply?: (
      query: ReturnType<ReturnType<typeof supabase.from>["select"]>,
    ) => unknown,
  ): Promise<number | null> => {
    const base = supabase
      .from(table)
      .select("id", { count: "exact", head: true });

    const query = (apply ? apply(base) : base) as typeof base;
    const { count: total, error } = await query;

    if (error) {
      logAdminError(`Counting ${table}`, error);
      return null;
    }

    return total ?? 0;
  };

  const [
    propertiesTotal,
    propertiesPublished,
    locationsConfigured,
    enquiriesTotal,
    enquiriesUnread,
    imagesTotal,
    imagesPublished,
    imagesMissingAlt,
    constructionUpdates,
    features,
  ] = await Promise.all([
    count("properties"),
    count("properties", (query) => query.eq("is_published", true)),
    count("property_location_settings"),
    count("enquiries"),
    count("enquiries", (query) => query.eq("status", "new")),
    count("property_images"),
    count("property_images", (query) => query.eq("is_published", true)),
    count("property_images", (query) => query.is("alt_text", null)),
    count("construction_updates"),
    count("property_features"),
  ]);

  // Any failure makes the whole set untrustworthy — a dashboard showing three
  // real numbers and one zero is worse than one that says it could not load.
  const results = [
    propertiesTotal,
    propertiesPublished,
    locationsConfigured,
    enquiriesTotal,
    enquiriesUnread,
    imagesTotal,
    imagesPublished,
    imagesMissingAlt,
    constructionUpdates,
    features,
  ];

  if (results.some((value) => value === null)) {
    return EMPTY_METRICS;
  }

  const total = propertiesTotal ?? 0;
  const published = propertiesPublished ?? 0;

  return {
    properties: {
      total,
      published,
      draft: total - published,
      // Clamped: a negative would mean settings rows outnumber properties,
      // which the foreign key makes impossible, but a metric should never
      // display a nonsense number if it somehow did.
      missingLocation: Math.max(0, total - (locationsConfigured ?? 0)),
    },
    enquiries: {
      total: enquiriesTotal ?? 0,
      unread: enquiriesUnread ?? 0,
    },
    images: {
      total: imagesTotal ?? 0,
      published: imagesPublished ?? 0,
      missingAltText: imagesMissingAlt ?? 0,
    },
    content: {
      constructionUpdates: constructionUpdates ?? 0,
      features: features ?? 0,
    },
    failed: false,
  };
}

/* ---------------------------------------------------------------------- */
/* Global media overview                                                  */
/* ---------------------------------------------------------------------- */

export interface PropertyMediaSummary {
  readonly id: string;
  readonly name: string;
  readonly isPublished: boolean;
  readonly images: number;
  readonly publishedImages: number;
  readonly missingAltText: number;
  /** Whether a hero image exists at all, published or not. */
  readonly hasHero: boolean;
  /** Whether the hero is one a visitor can actually see. */
  readonly hasPublishedHero: boolean;
  readonly resources: number;
  readonly publishedResources: number;
}

export interface MediaOverview {
  readonly properties: readonly PropertyMediaSummary[];
  readonly totals: {
    readonly images: number;
    readonly publishedImages: number;
    readonly resources: number;
    readonly publishedResources: number;
  };
  /** True when the catalogue exceeded the row cap, so figures are partial. */
  readonly truncated: boolean;
  readonly failed: boolean;
}

const EMPTY_OVERVIEW: MediaOverview = {
  properties: [],
  totals: { images: 0, publishedImages: 0, resources: 0, publishedResources: 0 },
  truncated: false,
  failed: true,
};

type ImageProjection = {
  property_id: string;
  is_published: boolean;
  alt_text: string | null;
  image_type: string;
};

type ResourceProjection = {
  property_id: string;
  is_published: boolean;
};

export async function getMediaOverview(): Promise<MediaOverview> {
  const supabase = await createAdminClient();

  const [propertyResult, imageResult, resourceResult] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, is_published")
      .order("name", { ascending: true }),
    supabase
      .from("property_images")
      .select("property_id, is_published, alt_text, image_type")
      .limit(MEDIA_ROW_CAP),
    supabase
      .from("property_resources")
      .select("property_id, is_published")
      .limit(MEDIA_ROW_CAP),
  ]);

  if (propertyResult.error || imageResult.error || resourceResult.error) {
    logAdminError(
      "Loading the media overview",
      propertyResult.error ?? imageResult.error ?? resourceResult.error,
    );
    return EMPTY_OVERVIEW;
  }

  const properties = (propertyResult.data ?? []) as unknown as ReadonlyArray<{
    id: string;
    name: string;
    is_published: boolean;
  }>;
  const images = (imageResult.data ?? []) as unknown as ImageProjection[];
  const resources = (resourceResult.data ?? []) as unknown as ResourceProjection[];

  // Accumulate per property in one pass rather than filtering the arrays once
  // per property, which would be quadratic on the catalogue.
  const byProperty = new Map<
    string,
    {
      images: number;
      publishedImages: number;
      missingAltText: number;
      hasHero: boolean;
      hasPublishedHero: boolean;
      resources: number;
      publishedResources: number;
    }
  >();

  const bucket = (propertyId: string) => {
    const existing = byProperty.get(propertyId);

    if (existing) return existing;

    const created = {
      images: 0,
      publishedImages: 0,
      missingAltText: 0,
      hasHero: false,
      hasPublishedHero: false,
      resources: 0,
      publishedResources: 0,
    };

    byProperty.set(propertyId, created);
    return created;
  };

  for (const image of images) {
    const entry = bucket(image.property_id);

    entry.images += 1;

    if (image.is_published) {
      entry.publishedImages += 1;
    }

    if (image.alt_text === null || image.alt_text.trim() === "") {
      entry.missingAltText += 1;
    }

    if (image.image_type === "hero") {
      entry.hasHero = true;

      if (image.is_published) {
        entry.hasPublishedHero = true;
      }
    }
  }

  for (const resource of resources) {
    const entry = bucket(resource.property_id);

    entry.resources += 1;

    if (resource.is_published) {
      entry.publishedResources += 1;
    }
  }

  const summaries = properties.map((property) => {
    const entry = byProperty.get(property.id);

    return {
      id: property.id,
      name: property.name,
      isPublished: property.is_published,
      images: entry?.images ?? 0,
      publishedImages: entry?.publishedImages ?? 0,
      missingAltText: entry?.missingAltText ?? 0,
      hasHero: entry?.hasHero ?? false,
      hasPublishedHero: entry?.hasPublishedHero ?? false,
      resources: entry?.resources ?? 0,
      publishedResources: entry?.publishedResources ?? 0,
    };
  });

  return {
    properties: summaries,
    totals: {
      images: images.length,
      publishedImages: images.filter((image) => image.is_published).length,
      resources: resources.length,
      publishedResources: resources.filter((resource) => resource.is_published)
        .length,
    },
    truncated:
      images.length >= MEDIA_ROW_CAP || resources.length >= MEDIA_ROW_CAP,
    failed: false,
  };
}
