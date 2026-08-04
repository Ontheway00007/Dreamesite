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

  it("has no image at all rather than a generic one", () => {
    // No hero and no override: the result must be undefined, not a site banner.
    expect(resolvePropertyMetadata(withSeo(undefined)).imageUrl).toBeUndefined();
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
  });
});
