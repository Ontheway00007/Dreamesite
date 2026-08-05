import { describe, expect, it } from "vitest";

import {
  derivePropertyMetadata,
  propertyMetadata,
  resolvePropertyMetadata,
} from "@/lib/seo/metadata";
import type { Property, PropertySeo } from "@/types";

/**
 * The three-level chain is the whole point of this module, so the tests are
 * organised by level: what an override does, what the property's own content
 * produces, and what happens when neither says anything.
 */

const baseProperty = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "single-storey-concept",
  name: "Single storey concept",
  summary: "Single level, north-facing living, courtyard to the rear boundary.",
  suburb: "Mickleham",
  state: "VIC",
  status: "under-construction",
  bedrooms: 4,
  bathrooms: 2,
  carSpaces: 2,
  landSize: 448,
  isFeatured: false,
  images: [],
} as unknown as Property;

/**
 * An externally hosted hero, so the resolved URL is the literal below and the
 * test does not depend on Supabase configuration.
 */
const HERO_URL = "https://cdn.example.com/hero.jpg";

const HERO_IMAGE = {
  id: "hero-1",
  category: "hero",
  source: { kind: "external", url: HERO_URL },
  altText: "Street view",
} as unknown as Property["heroImage"];

function withSeo(seo: Partial<PropertySeo> | undefined): Property {
  return {
    ...baseProperty,
    seo: seo ? ({ noindex: false, ...seo } as PropertySeo) : undefined,
  } as Property;
}

describe("derivePropertyMetadata", () => {
  it("builds a title from the name and suburb", () => {
    expect(derivePropertyMetadata(baseProperty).title).toBe(
      "Single storey concept, Mickleham",
    );
  });

  it("appends the status and location to the summary", () => {
    expect(derivePropertyMetadata(baseProperty).description).toBe(
      "Single level, north-facing living, courtyard to the rear boundary. Under construction in Mickleham VIC.",
    );
  });

  it("clamps a long description without splitting a word", () => {
    const summary = "An unusually detailed summary of this home. ".repeat(10);
    const { description } = derivePropertyMetadata({
      ...baseProperty,
      summary,
    });

    expect(description.length).toBeLessThanOrEqual(200);
    expect(description.endsWith("…")).toBe(true);

    // The kept text must be a prefix of the original that stops at a space,
    // which is what "did not split a word" actually means.
    const kept = description.slice(0, -1);
    const original = `${summary} Under construction in Mickleham VIC.`.replace(
      /\s+/g,
      " ",
    );

    expect(original.startsWith(kept)).toBe(true);
    expect(original.charAt(kept.length)).toBe(" ");
  });

  it("points the canonical URL at the property's own route", () => {
    expect(derivePropertyMetadata(baseProperty).canonicalUrl).toMatch(
      /\/properties\/single-storey-concept$/,
    );
  });
});

describe("resolvePropertyMetadata", () => {
  it("falls back to derived content when there is no override", () => {
    const derived = derivePropertyMetadata(baseProperty);
    const resolved = resolvePropertyMetadata(withSeo(undefined));

    expect(resolved.title).toBe(derived.title);
    expect(resolved.description).toBe(derived.description);
    expect(resolved.canonicalUrl).toBe(derived.canonicalUrl);
    expect(resolved.noindex).toBe(false);
  });

  it("prefers an override title over the derived one", () => {
    const resolved = resolvePropertyMetadata(
      withSeo({ metaTitle: "Four bedroom home in Mickleham" }),
    );

    expect(resolved.title).toBe("Four bedroom home in Mickleham");
    // The description was not overridden, so it still derives.
    expect(resolved.description).toBe(
      derivePropertyMetadata(baseProperty).description,
    );
  });

  it("overrides each field independently", () => {
    const resolved = resolvePropertyMetadata(
      withSeo({ metaDescription: "A short, deliberate description." }),
    );

    expect(resolved.description).toBe("A short, deliberate description.");
    expect(resolved.title).toBe(derivePropertyMetadata(baseProperty).title);
  });

  it("honours a canonical override", () => {
    const resolved = resolvePropertyMetadata(
      withSeo({ canonicalUrl: "https://example.com/homes/mickleham" }),
    );

    expect(resolved.canonicalUrl).toBe("https://example.com/homes/mickleham");
  });

  it("carries the noindex flag through", () => {
    expect(resolvePropertyMetadata(withSeo({ noindex: true })).noindex).toBe(
      true,
    );
  });

  it("prefers the chosen social image over the hero", () => {
    const resolved = resolvePropertyMetadata(
      withSeo({ ogImageUrl: "https://cdn.example.com/chosen.jpg" }),
    );

    expect(resolved.imageUrl).toBe("https://cdn.example.com/chosen.jpg");
  });

  it("has no image when nothing supplies one", () => {
    // No override, no hero, no site default: no image, not an invented one.
    const resolved = resolvePropertyMetadata(withSeo(undefined));

    expect(resolved.imageUrl).toBeUndefined();
    expect(resolved.imageSource).toBe("none");
  });
});

/* ---------------------------------------------------------------------- */
/* Level 3 — the site-wide default                                        */
/* ---------------------------------------------------------------------- */

const SITE_DEFAULTS = {
  defaultMetaTitle: "Dreame — considered homes",
  defaultMetaDescription: "A site-wide description.",
  defaultOgImageUrl: "https://cdn.example.com/site-banner.jpg",
};

describe("the site-wide default level", () => {
  it("uses the configured default image when the property has none", () => {
    const resolved = resolvePropertyMetadata(withSeo(undefined), SITE_DEFAULTS);

    expect(resolved.imageUrl).toBe(SITE_DEFAULTS.defaultOgImageUrl);
    expect(resolved.imageSource).toBe("site-default");
  });

  it("prefers the property hero over the site default", () => {
    const resolved = resolvePropertyMetadata(
      { ...withSeo(undefined), heroImage: HERO_IMAGE } as Property,
      SITE_DEFAULTS,
    );

    expect(resolved.imageUrl).toBe(HERO_URL);
    expect(resolved.imageSource).toBe("hero");
  });

  it("prefers the property override over both", () => {
    const resolved = resolvePropertyMetadata(
      {
        ...withSeo({ ogImageUrl: "https://cdn.example.com/chosen.jpg" }),
        heroImage: HERO_IMAGE,
      } as Property,
      SITE_DEFAULTS,
    );

    expect(resolved.imageUrl).toBe("https://cdn.example.com/chosen.jpg");
    expect(resolved.imageSource).toBe("override");
  });

  it("falls through to the hero when the override no longer resolves", () => {
    // A draft, deleted or recategorised override arrives as undefined from the
    // mapper, which is what makes the fallback automatic.
    const resolved = resolvePropertyMetadata(
      { ...withSeo({ ogImageUrl: undefined }), heroImage: HERO_IMAGE } as Property,
      SITE_DEFAULTS,
    );

    expect(resolved.imageUrl).toBe(HERO_URL);
    expect(resolved.imageSource).toBe("hero");
  });

  it("treats a blank site default as absent", () => {
    const resolved = resolvePropertyMetadata(withSeo(undefined), {
      defaultOgImageUrl: "   ",
    });

    expect(resolved.imageUrl).toBeUndefined();
    expect(resolved.imageSource).toBe("none");
  });

  it("does not let the site default displace the property's own title", () => {
    // Level 2 always produces a title for a property, so level 3 is only ever
    // reached for the image in practice.
    const resolved = resolvePropertyMetadata(withSeo(undefined), SITE_DEFAULTS);

    expect(resolved.title).toBe(derivePropertyMetadata(baseProperty).title);
    expect(resolved.description).toBe(
      derivePropertyMetadata(baseProperty).description,
    );
  });
});

describe("propertyMetadata", () => {
  it("sets robots only when the property is noindex", () => {
    expect(propertyMetadata(withSeo(undefined)).robots).toBeUndefined();
    expect(propertyMetadata(withSeo({ noindex: true })).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it("never emits index: true, so a preview deployment stays noindex", () => {
    // The root layout asks preview and local deployments not to be indexed.
    // Next merges metadata field by field, so a page emitting index: true would
    // override that and publish every property from a preview URL. A property
    // setting may restrict indexing further; it must not widen it.
    for (const seo of [undefined, { noindex: false }, { noindex: true }]) {
      const robots = propertyMetadata(withSeo(seo)).robots;

      if (robots) {
        expect(robots).toMatchObject({ index: false });
      }
    }
  });

  it("keeps the Open Graph values in step with the page's own", () => {
    const property = withSeo({ metaTitle: "Overridden" });
    const metadata = propertyMetadata(property);

    expect(metadata.openGraph).toMatchObject({
      title: "Overridden",
      description: resolvePropertyMetadata(property).description,
      url: resolvePropertyMetadata(property).canonicalUrl,
    });
  });

  it("omits the image key entirely when there is no image", () => {
    const metadata = propertyMetadata(withSeo(undefined));

    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).not.toHaveProperty("images");
  });

  it("uses the site default image when the property has none", () => {
    const metadata = propertyMetadata(withSeo(undefined), SITE_DEFAULTS);

    expect(metadata.openGraph).toMatchObject({
      images: [{ url: SITE_DEFAULTS.defaultOgImageUrl }],
    });
  });
});

describe("Twitter card", () => {
  it("matches the Open Graph title, description and image exactly", () => {
    const property = { ...withSeo(undefined), heroImage: HERO_IMAGE } as Property;
    const metadata = propertyMetadata(property, SITE_DEFAULTS);
    const resolved = resolvePropertyMetadata(property, SITE_DEFAULTS);

    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: resolved.title,
      description: resolved.description,
      images: [resolved.imageUrl],
    });

    // And the two networks agree with each other.
    expect(metadata.twitter?.title).toBe(metadata.openGraph?.title);
    expect(metadata.twitter?.description).toBe(metadata.openGraph?.description);
  });

  it("uses the plain summary card when there is no image", () => {
    // Claiming a large image and supplying none renders an empty banner.
    expect(propertyMetadata(withSeo(undefined)).twitter).toMatchObject({
      card: "summary",
    });
  });

  it("claims no Twitter account, because none is configured", () => {
    const twitter = propertyMetadata(withSeo(undefined), SITE_DEFAULTS)
      .twitter as Record<string, unknown>;

    expect(twitter.site).toBeUndefined();
    expect(twitter.creator).toBeUndefined();
  });
});
