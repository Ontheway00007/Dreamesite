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
  /** Which level of the chain supplied the image. Asserted in tests. */
  readonly imageSource: "override" | "hero" | "site-default" | "none";
}

/**
 * The site-wide level of the chain.
 *
 * Passed in rather than read here. A resolver that reached for the database
 * would be untestable without mocking one, and would issue a query from
 * whatever component happened to call it — including several times per page.
 * The caller already has these values: `getPublicSettings()` is request-cached,
 * so fetching them costs one read for the whole render.
 */
export interface SiteMetadataDefaults {
  readonly defaultMetaTitle?: string;
  readonly defaultMetaDescription?: string;
  readonly defaultOgImageUrl?: string;
}

/** Treats blank strings as absent, so an empty setting falls through. */
function present(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Resolves the three-level chain into plain values.
 *
 * Separate from `propertyMetadata` below so the result can be asserted directly
 * in tests without unpicking Next's `Metadata` shape.
 *
 * Every field runs override → property content → site default. In practice only
 * the image reaches the third level: a property always has a name, a suburb and
 * a summary, so levels 1 and 2 always produce a title and a description. The
 * site default is still consulted for them, because "the property has no
 * content" should degrade to the site's wording rather than to an empty tag, and
 * because a chain with a hole in it is one refactor away from being wrong.
 */
export function resolvePropertyMetadata(
  property: Property,
  siteDefaults: SiteMetadataDefaults = {},
): ResolvedPropertyMetadata {
  const seo = property.seo;
  const derived = derivePropertyMetadata(property);

  /*
    The Open Graph image, in order:

    1. The administrator's chosen image. `updatePropertySeo` verified it is
       published, has a source, belongs to this property and is not a floor plan
       before storing it, and the mapper stops resolving it if it stops being
       any of those — so an override that has since been unpublished or deleted
       arrives here as undefined and falls through.
    2. The hero photograph. `heroImageUrl` returns nothing for a floor plan or an
       unpublished image, so this cannot degrade into sharing a drawing.
    3. The site-wide default from Settings.

    Level 3 was previously omitted, on the reasoning that a generic banner on
    every property link looks like the wrong home rather than none. That argument
    holds for an image the code invents; it does not hold for one the business
    went to Settings and chose. Opting in is the difference, and a business that
    has opted in gets a branded card instead of a bare link.

    There is still no built-in image. With nothing configured and no photograph,
    the result is no image at all.
  */
  const overrideImage = present(seo?.ogImageUrl);
  const heroImage = present(heroImageUrl(property) ?? undefined);
  const siteImage = present(siteDefaults.defaultOgImageUrl);

  const imageUrl = overrideImage ?? heroImage ?? siteImage;

  return {
    title:
      present(seo?.metaTitle) ??
      present(derived.title) ??
      present(siteDefaults.defaultMetaTitle) ??
      siteConfig.name,
    description:
      present(seo?.metaDescription) ??
      present(derived.description) ??
      present(siteDefaults.defaultMetaDescription) ??
      siteConfig.description,
    canonicalUrl: present(seo?.canonicalUrl) ?? derived.canonicalUrl,
    imageUrl,
    noindex: seo?.noindex ?? false,
    imageSource: overrideImage
      ? "override"
      : heroImage
        ? "hero"
        : siteImage
          ? "site-default"
          : "none",
  };
}

/**
 * The `Metadata` object for a property page.
 *
 * ## `robots`
 *
 * Set only when the property is marked noindex, and then only ever to
 * `index: false`. Next merges metadata field by field, so leaving it unset lets
 * the root layout's rule apply — and that rule is what keeps preview and local
 * deployments out of search results.
 *
 * `index: true` is never emitted from here. Emitting it would override the
 * layout, and a property marked indexable would then be indexed *from a preview
 * URL*, which is the one outcome the deployment-level rule exists to prevent. A
 * per-property setting can restrict indexing beyond the deployment default; it
 * cannot widen it.
 *
 * ## Open Graph and Twitter
 *
 * Both are built from the same resolved values, so a card cannot disagree with
 * the page or with the other network. `summary_large_image` is used when there
 * is an image and `summary` when there is not — claiming a large image and then
 * supplying none produces an empty banner.
 *
 * No `site` or `creator` handle: none is configured, and inventing one would
 * attribute the business's pages to an account it does not own.
 */
export function propertyMetadata(
  property: Property,
  siteDefaults: SiteMetadataDefaults = {},
): Metadata {
  const resolved = resolvePropertyMetadata(property, siteDefaults);
  const images = resolved.imageUrl ? [{ url: resolved.imageUrl }] : undefined;

  return {
    title: resolved.title,
    description: resolved.description,
    alternates: { canonical: resolved.canonicalUrl },
    ...(resolved.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "website",
      title: resolved.title,
      description: resolved.description,
      url: resolved.canonicalUrl,
      siteName: siteConfig.name,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: resolved.imageUrl ? "summary_large_image" : "summary",
      title: resolved.title,
      description: resolved.description,
      ...(resolved.imageUrl ? { images: [resolved.imageUrl] } : {}),
    },
  };
}
