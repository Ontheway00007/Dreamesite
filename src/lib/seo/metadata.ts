import type { Metadata } from "next";

import { propertyStatusTokens } from "@/lib/design/property-status";
import { env } from "@/lib/env";
import { heroImageUrl } from "@/lib/properties/media";
import { PROPERTIES_ROUTE } from "@/lib/routes";
import { siteConfig } from "@/lib/site-config";
import type { Property } from "@/types";

/**
 * Metadata resolution for property pages.
 *
 * ## The chain
 *
 * Every field resolves in the same order, and the order is the whole design:
 *
 * 1. **The administrator's override**, from the SEO tab. Explicit intent wins.
 * 2. **The property's own content** — its name, suburb, summary and hero
 *    photograph. Correct for almost every home, which is why the override is
 *    usually left blank.
 * 3. **The site default**, so a property with neither still produces a title
 *    and description rather than an empty tag.
 *
 * Extracted from the page so the chain is testable and stated once. It was
 * previously inline in `app/properties/[slug]/page.tsx`, which meant the
 * override could not be honoured without duplicating the fallbacks.
 *
 * ## Why the description is derived rather than the summary verbatim
 *
 * A meta description is read out of context, in a list of ten results. Appending
 * the status and suburb makes it answerable — "is this available, and where" —
 * without the administrator writing it twice.
 */

/** Truncates on a word boundary, so a description never ends mid-word. */
function clamp(value: string, limit: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();

  if (collapsed.length <= limit) {
    return collapsed;
  }

  const clipped = collapsed.slice(0, limit - 1);
  const lastSpace = clipped.lastIndexOf(" ");

  return `${lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped}…`;
}

/** Matches the advisory limit the SEO editor shows. */
const DESCRIPTION_LIMIT = 200;

/**
 * The fields level 2 of the chain is built from.
 *
 * A structural type rather than `Property`, so the admin SEO tab can derive the
 * same values from a database row without first mapping a full public property.
 * Both sides deriving it independently is how the editor's preview and the live
 * page drift apart.
 */
export interface PropertyMetadataFacts {
  readonly name: string;
  readonly slug: string;
  readonly suburb: string;
  readonly state: string;
  readonly summary: string;
  readonly status: Property["status"];
}

export interface DerivedPropertyMetadata {
  readonly title: string;
  readonly description: string;
  readonly canonicalUrl: string;
}

/** Level 2 of the chain: what the property's own content produces. */
export function derivePropertyMetadata(
  facts: PropertyMetadataFacts,
): DerivedPropertyMetadata {
  const status = propertyStatusTokens[facts.status].label;

  return {
    title: `${facts.name}, ${facts.suburb}`,
    description: clamp(
      `${facts.summary} ${status} in ${facts.suburb} ${facts.state}.`,
      DESCRIPTION_LIMIT,
    ),
    canonicalUrl: `${env.siteUrl}${PROPERTIES_ROUTE}/${facts.slug}`,
  };
}

export interface ResolvedPropertyMetadata {
  readonly title: string;
  readonly description: string;
  /** The URL search engines should treat as canonical for this page. */
  readonly canonicalUrl: string;
  /** Absolute URL of the social preview image, when there is a usable one. */
  readonly imageUrl?: string;
  readonly noindex: boolean;
}

/**
 * Resolves the three-level chain into plain values.
 *
 * Separate from `propertyMetadata` below so the result can be asserted directly
 * in tests without unpicking Next's `Metadata` shape.
 */
export function resolvePropertyMetadata(
  property: Property,
): ResolvedPropertyMetadata {
  const seo = property.seo;
  const derived = derivePropertyMetadata(property);

  /*
    The Open Graph image, in order:

    1. The administrator's chosen image, which the action has already verified is
       published, has a source, belongs to this property and is not a floor plan.
    2. The hero photograph. `heroImageUrl` returns nothing for a floor plan or an
       unpublished image, so this cannot degrade into sharing a drawing.

    No site-wide fallback image: a generic banner on every property link is worse
    than no image, because it looks like the wrong home rather than none.
  */
  const imageUrl = seo?.ogImageUrl ?? heroImageUrl(property) ?? undefined;

  return {
    title: seo?.metaTitle ?? derived.title,
    description: seo?.metaDescription ?? derived.description,
    canonicalUrl: seo?.canonicalUrl ?? derived.canonicalUrl,
    imageUrl,
    noindex: seo?.noindex ?? false,
  };
}

/**
 * The `Metadata` object for a property page.
 *
 * `robots` is only set when the property is marked noindex. Leaving it unset
 * otherwise lets the root layout's site-wide rule apply — preview and local
 * deployments ask not to be indexed, and overriding that here would publish
 * every property page from a preview URL.
 */
export function propertyMetadata(property: Property): Metadata {
  const resolved = resolvePropertyMetadata(property);

  return {
    title: resolved.title,
    description: resolved.description,
    alternates: { canonical: resolved.canonicalUrl },
    ...(resolved.noindex
      ? { robots: { index: false, follow: true } }
      : {}),
    openGraph: {
      type: "website",
      title: resolved.title,
      description: resolved.description,
      url: resolved.canonicalUrl,
      siteName: siteConfig.name,
      ...(resolved.imageUrl ? { images: [{ url: resolved.imageUrl }] } : {}),
    },
  };
}
