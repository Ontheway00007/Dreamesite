import { describe, expect, it } from "vitest";

import {
  SEO_LIMITS,
  checkOgImageEligibility,
  truncateForSearchPreview,
  validateSeo,
} from "@/lib/admin/validation/seo";

/**
 * The SEO validator's distinguishing feature is that it separates errors from
 * advice. A short title is not wrong; a 200-character title is. These tests are
 * mostly about which side of that line each case falls on.
 */

function submit(overrides: Record<string, unknown> = {}) {
  return validateSeo({ noindex: false, ...overrides });
}

function fieldsOf(result: ReturnType<typeof validateSeo>) {
  return result.ok ? [] : result.errors.map((error) => error.field);
}

function advisoryFieldsOf(result: ReturnType<typeof validateSeo>) {
  return result.ok ? result.value.advisories.map((item) => item.field) : [];
}

describe("validateSeo", () => {
  it("accepts an entirely empty override", () => {
    const result = submit();

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.value.metaTitle).toBeUndefined();
  });

  it("rejects a title past the limit", () => {
    expect(
      fieldsOf(submit({ metaTitle: "x".repeat(SEO_LIMITS.metaTitle + 1) })),
    ).toContain("metaTitle");
  });

  it("advises on a short title rather than refusing it", () => {
    const result = submit({ metaTitle: "Short" });

    expect(result.ok).toBe(true);
    expect(advisoryFieldsOf(result)).toContain("metaTitle");
  });

  it("rejects a description past the limit", () => {
    expect(
      fieldsOf(
        submit({
          metaDescription: "x".repeat(SEO_LIMITS.metaDescription + 1),
        }),
      ),
    ).toContain("metaDescription");
  });

  it("rejects markup in either text field", () => {
    expect(fieldsOf(submit({ metaTitle: "<b>Home</b>" }))).toContain(
      "metaTitle",
    );
    expect(
      fieldsOf(submit({ metaDescription: "A <em>lovely</em> home in Mickleham" })),
    ).toContain("metaDescription");
  });

  it("requires a canonical override to be a complete https address", () => {
    expect(fieldsOf(submit({ canonicalUrl: "example.com/home" }))).toContain(
      "canonicalUrl",
    );
    expect(
      fieldsOf(submit({ canonicalUrl: "http://example.com/home" })),
    ).toContain("canonicalUrl");
  });

  it("warns about a valid canonical override, because it usually is a mistake", () => {
    const result = submit({ canonicalUrl: "https://example.com/home" });

    expect(result.ok).toBe(true);
    expect(advisoryFieldsOf(result)).toContain("canonicalUrl");
  });

  it("rejects an image reference that is not a uuid", () => {
    expect(fieldsOf(submit({ ogImageId: "17" }))).toContain("ogImageId");
  });

  it("warns while noindex is on", () => {
    expect(advisoryFieldsOf(submit({ noindex: true }))).toContain("noindex");
  });

  it("turns empty strings into undefined so a cleared field stores null", () => {
    const result = submit({
      metaTitle: "   ",
      metaDescription: "",
      canonicalUrl: "",
      ogImageId: "",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.value.metaTitle).toBeUndefined();
      expect(result.value.value.metaDescription).toBeUndefined();
      expect(result.value.value.canonicalUrl).toBeUndefined();
      expect(result.value.value.ogImageId).toBeUndefined();
    }
  });
});

describe("checkOgImageEligibility", () => {
  const propertyId = "11111111-1111-4111-8111-111111111111";

  const eligible = {
    propertyId,
    isPublished: true,
    hasSource: true,
    imageType: "facade",
  };

  it("accepts a published photograph belonging to the property", () => {
    expect(checkOgImageEligibility(eligible, propertyId).ok).toBe(true);
  });

  it("refuses an image from another property", () => {
    const result = checkOgImageEligibility(
      { ...eligible, propertyId: "22222222-2222-4222-8222-222222222222" },
      propertyId,
    );

    expect(result.ok).toBe(false);
  });

  it("refuses a draft image, because a shared link would break everywhere", () => {
    expect(
      checkOgImageEligibility({ ...eligible, isPublished: false }, propertyId).ok,
    ).toBe(false);
  });

  it("refuses an image with no file or link", () => {
    expect(
      checkOgImageEligibility({ ...eligible, hasSource: false }, propertyId).ok,
    ).toBe(false);
  });

  it("refuses a floor plan", () => {
    expect(
      checkOgImageEligibility(
        { ...eligible, imageType: "floor_plan" },
        propertyId,
      ).ok,
    ).toBe(false);
  });

  it("reports every reason at once rather than the first", () => {
    const result = checkOgImageEligibility(
      {
        propertyId: "22222222-2222-4222-8222-222222222222",
        isPublished: false,
        hasSource: false,
        imageType: "floor_plan",
      },
      propertyId,
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? 0 : result.errors.length).toBe(4);
  });
});

describe("truncateForSearchPreview", () => {
  it("leaves a short value alone", () => {
    expect(truncateForSearchPreview("A short title", 70)).toEqual({
      text: "A short title",
      truncated: false,
    });
  });

  it("clips on a word boundary", () => {
    const { text, truncated } = truncateForSearchPreview(
      "A considered home in Melbourne's northern growth corridor",
      30,
    );

    expect(truncated).toBe(true);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(31);
    // The kept text stops at a space in the original.
    expect(
      "A considered home in Melbourne's northern growth corridor".startsWith(
        text.slice(0, -1),
      ),
    ).toBe(true);
  });
});
