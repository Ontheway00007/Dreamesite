import { describe, expect, it } from "vitest";

import {
  TEXT_LIMITS,
  checkHeroEligibility,
  checkPathOwnership,
  describePathFailure,
  requiresAltTextToPublish,
  validateExternalUrl,
  validateImageMetadata,
  validateReorderIds,
  validateResourceMetadata,
  validateUploadRequest,
  type UploadRequest,
} from "@/lib/media/validation";

const PROPERTY = "0192f3c1-6a2b-4d5e-8f70-1a2b3c4d5e6f";
const OTHER_PROPERTY = "0192f3c1-6a2b-4d5e-8f70-aaaabbbbcccc";
const OBJECT = "abcdef01-2345-6789-abcd-ef0123456789";

/** Fields carrying an error, for concise assertions. */
function fields(result: { ok: boolean; errors?: readonly { field: string }[] }) {
  return result.ok ? [] : (result.errors ?? []).map((error) => error.field);
}

/* ====================================================================== */
/* External URLs — the stored-XSS boundary                                */
/* ====================================================================== */

describe("validateExternalUrl", () => {
  it("accepts an https link and returns it normalised", () => {
    const result = validateExternalUrl("https://my.matterport.com/show/?m=abc");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.url).toBe("https://my.matterport.com/show/?m=abc");
    expect(result.value.host).toBe("my.matterport.com");
  });

  it("trims and normalises casing in the scheme and host", () => {
    const result = validateExternalUrl("  HTTPS://Www.YouTube.com/watch?v=x  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.url.startsWith("https://www.youtube.com/")).toBe(true);
    expect(result.value.host).toBe("www.youtube.com");
  });

  /**
   * The protocols below all execute or read something the visitor did not
   * intend, and an `href` is enough to trigger it. None has a legitimate use
   * for a tour or video link, so only https is allowed through rather than
   * these being blocked individually.
   */
  it("refuses javascript:, which executes on click", () => {
    for (const attempt of [
      "javascript:alert(document.cookie)",
      "JavaScript:alert(1)",
      "  javascript:void(0)  ",
      // Tab inside the scheme — browsers historically stripped it before
      // dispatch, so a naive prefix check would let it through.
      "java\tscript:alert(1)",
    ]) {
      expect(validateExternalUrl(attempt).ok, attempt).toBe(false);
    }
  });

  it("refuses data:, which can carry an HTML document", () => {
    expect(
      validateExternalUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")
        .ok,
    ).toBe(false);
    expect(validateExternalUrl("data:image/png;base64,iVBORw0KGgo=").ok).toBe(
      false,
    );
  });

  it("refuses file:, which points at the visitor's own disk", () => {
    expect(validateExternalUrl("file:///etc/passwd").ok).toBe(false);
  });

  it("refuses other schemes that are not web links", () => {
    for (const attempt of [
      "mailto:someone@example.com",
      "tel:+61400000000",
      "ftp://files.example.com/a.pdf",
      "vbscript:msgbox(1)",
      "blob:https://example.com/uuid",
    ]) {
      expect(validateExternalUrl(attempt).ok, attempt).toBe(false);
    }
  });

  it("refuses plain http", () => {
    // The site is served over HTTPS: an http embed is blocked as mixed
    // content, and an http link downgrades the visitor's connection.
    expect(validateExternalUrl("http://example.com/tour").ok).toBe(false);
  });

  it("refuses credentials in the URL", () => {
    // They would appear in the page source and in the referrer.
    expect(validateExternalUrl("https://user:pass@example.com/tour").ok).toBe(
      false,
    );
    expect(validateExternalUrl("https://user@example.com/tour").ok).toBe(false);
  });

  it("refuses a link to the local machine", () => {
    for (const attempt of [
      "https://localhost/tour",
      "https://localhost:3000/tour",
      "https://app.localhost/tour",
      "https://127.0.0.1/tour",
    ]) {
      expect(validateExternalUrl(attempt).ok, attempt).toBe(false);
    }
  });

  it("refuses something that is not a URL at all", () => {
    for (const attempt of ["", "   ", "not a url", "example.com", "//example.com"]) {
      expect(validateExternalUrl(attempt).ok, attempt).toBe(false);
    }
  });

  it("does not echo the rejected scheme back", () => {
    // Naming the scheme in the error invites another attempt at the same idea.
    const result = validateExternalUrl("javascript:alert(1)");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors[0].message).not.toContain("javascript");
    expect(result.errors[0].message).toContain("https://");
  });

  it("reports against the field it was given", () => {
    const result = validateExternalUrl("nonsense", "externalUrl");

    expect(fields(result)).toEqual(["externalUrl"]);
  });
});

/* ====================================================================== */
/* Upload requests                                                        */
/* ====================================================================== */

function uploadRequest(overrides: Partial<UploadRequest> = {}): UploadRequest {
  return {
    propertyId: PROPERTY,
    category: "gallery",
    filename: "kitchen.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 2 * 1024 * 1024,
    ...overrides,
  };
}

describe("validateUploadRequest", () => {
  it("accepts a reasonable image", () => {
    expect(validateUploadRequest(uploadRequest()).ok).toBe(true);
  });

  it("accepts a PDF for the documents category", () => {
    expect(
      validateUploadRequest(
        uploadRequest({
          category: "documents",
          filename: "brochure.pdf",
          mimeType: "application/pdf",
        }),
      ).ok,
    ).toBe(true);
  });

  it("refuses an image where a document is expected", () => {
    expect(
      fields(
        validateUploadRequest(
          uploadRequest({ category: "documents", filename: "a.jpg" }),
        ),
      ),
    ).toContain("file");
  });

  it("refuses a PDF where an image is expected", () => {
    expect(
      fields(
        validateUploadRequest(
          uploadRequest({ filename: "a.pdf", mimeType: "application/pdf" }),
        ),
      ),
    ).toContain("file");
  });

  it("refuses SVG", () => {
    const result = validateUploadRequest(
      uploadRequest({ filename: "logo.svg", mimeType: "image/svg+xml" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors[0].message).toContain("SVG");
  });

  it("refuses a file whose extension contradicts its type", () => {
    expect(
      fields(validateUploadRequest(uploadRequest({ filename: "kitchen.png" }))),
    ).toContain("file");
  });

  it("refuses an empty file", () => {
    expect(
      fields(validateUploadRequest(uploadRequest({ sizeBytes: 0 }))),
    ).toContain("file");
    expect(
      fields(validateUploadRequest(uploadRequest({ sizeBytes: -1 }))),
    ).toContain("file");
    expect(
      fields(validateUploadRequest(uploadRequest({ sizeBytes: Number.NaN }))),
    ).toContain("file");
  });

  it("enforces the per-category size limit", () => {
    // 18 MB is over the image limit but under the floor-plan one, so the same
    // file is refused in one section and accepted in another.
    const eighteenMb = 18 * 1024 * 1024;

    expect(
      validateUploadRequest(uploadRequest({ sizeBytes: eighteenMb })).ok,
    ).toBe(false);
    expect(
      validateUploadRequest(
        uploadRequest({ category: "floor-plans", sizeBytes: eighteenMb }),
      ).ok,
    ).toBe(true);
  });

  it("states the actual size and the limit in the message", () => {
    const result = validateUploadRequest(
      uploadRequest({ sizeBytes: 40 * 1024 * 1024 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors[0].message).toContain("40 MB");
    expect(result.errors[0].message).toContain("15 MB");
  });

  it("refuses a missing property or filename", () => {
    expect(
      fields(validateUploadRequest(uploadRequest({ propertyId: "" }))),
    ).toContain("propertyId");
    expect(
      fields(validateUploadRequest(uploadRequest({ filename: "" }))),
    ).toContain("file");
  });

  it("refuses an absurdly long filename", () => {
    expect(
      fields(
        validateUploadRequest(
          uploadRequest({ filename: `${"a".repeat(400)}.jpg` }),
        ),
      ),
    ).toContain("file");
  });
});

/* ====================================================================== */
/* Path ownership — the IDOR guard                                        */
/* ====================================================================== */

describe("checkPathOwnership", () => {
  const validPath = `properties/${PROPERTY}/gallery/${OBJECT}.jpg`;

  it("accepts a path belonging to the property", () => {
    expect(checkPathOwnership(validPath, PROPERTY)).toEqual({ ok: true });
  });

  it("refuses a path belonging to a different property", () => {
    // The attack this prevents: an administrator editing property A naming an
    // object under property B, and having it deleted or reattached.
    const foreign = `properties/${OTHER_PROPERTY}/gallery/${OBJECT}.jpg`;

    expect(checkPathOwnership(foreign, PROPERTY)).toEqual({
      ok: false,
      reason: "wrong-property",
    });
  });

  it("is insensitive to the casing of the property id", () => {
    expect(checkPathOwnership(validPath, PROPERTY.toUpperCase()).ok).toBe(true);
  });

  it("refuses a malformed path", () => {
    for (const attempt of [
      "",
      "not-a-path",
      `properties/${PROPERTY}/gallery/kitchen.jpg`,
      "properties/../../etc/passwd",
    ]) {
      expect(checkPathOwnership(attempt, PROPERTY), attempt).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });

  it("pins the category when one is required", () => {
    // Stops a file under documents/ being attached as a gallery image, which
    // would put a PDF where an <img> is rendered.
    expect(
      checkPathOwnership(
        `properties/${PROPERTY}/documents/${OBJECT}.pdf`,
        PROPERTY,
        "gallery",
      ),
    ).toEqual({ ok: false, reason: "wrong-category" });

    expect(
      checkPathOwnership(validPath, PROPERTY, "gallery"),
    ).toEqual({ ok: true });
  });

  it("checks the property before the category", () => {
    // A foreign path in the right folder is still foreign, and the message
    // should say so.
    expect(
      checkPathOwnership(
        `properties/${OTHER_PROPERTY}/gallery/${OBJECT}.jpg`,
        PROPERTY,
        "gallery",
      ).reason,
    ).toBe("wrong-property");
  });
});

describe("describePathFailure", () => {
  it("explains each failure without describing the layout", () => {
    for (const reason of ["malformed", "wrong-property", "wrong-category"] as const) {
      const message = describePathFailure(reason);

      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain("properties/");
      expect(message).not.toContain("uuid");
    }
  });
});

/* ====================================================================== */
/* Alt-text policy                                                        */
/* ====================================================================== */

describe("validateImageMetadata", () => {
  it("accepts a draft with no description", () => {
    // The requirement applies at publication, so a batch can be uploaded and
    // described afterwards.
    expect(
      validateImageMetadata({
        imageType: "gallery",
        isPublished: false,
      }).ok,
    ).toBe(true);
  });

  it("refuses publishing without a description", () => {
    const result = validateImageMetadata({
      imageType: "gallery",
      isPublished: true,
    });

    expect(fields(result)).toContain("altText");
  });

  it("applies the requirement to every image category, with no exceptions", () => {
    expect(requiresAltTextToPublish()).toBe(true);

    for (const imageType of [
      "hero",
      "gallery",
      "facade",
      "construction",
      "floor_plan",
      "drone",
    ]) {
      expect(
        validateImageMetadata({ imageType, isPublished: true }).ok,
        imageType,
      ).toBe(false);
    }
  });

  it("treats whitespace as no description", () => {
    expect(
      validateImageMetadata({
        imageType: "gallery",
        altText: "   ",
        isPublished: true,
      }).ok,
    ).toBe(false);
  });

  it("does not accept a caption in place of a description", () => {
    // A caption is written for everyone and often adds context rather than
    // describing the picture.
    expect(
      validateImageMetadata({
        imageType: "gallery",
        caption: "Designed with the owners",
        isPublished: true,
      }).ok,
    ).toBe(false);
  });

  it("accepts publishing once described", () => {
    const result = validateImageMetadata({
      imageType: "gallery",
      altText: "Kitchen island beneath a skylight",
      isPublished: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.altText).toBe("Kitchen island beneath a skylight");
  });

  it("refuses markup in text shown publicly", () => {
    expect(
      fields(
        validateImageMetadata({
          imageType: "gallery",
          altText: "<script>alert(1)</script>",
          isPublished: true,
        }),
      ),
    ).toContain("altText");

    expect(
      fields(
        validateImageMetadata({
          imageType: "gallery",
          altText: "Kitchen",
          caption: "<b>bold</b>",
          isPublished: true,
        }),
      ),
    ).toContain("caption");
  });

  it("enforces text length limits", () => {
    expect(
      fields(
        validateImageMetadata({
          imageType: "gallery",
          altText: "a".repeat(TEXT_LIMITS.altText + 1),
          isPublished: true,
        }),
      ),
    ).toContain("altText");
  });

  it("refuses an unknown category", () => {
    expect(
      fields(
        validateImageMetadata({ imageType: "banner", isPublished: false }),
      ),
    ).toContain("imageType");
  });

  it("normalises empty optional text to undefined", () => {
    const result = validateImageMetadata({
      imageType: "gallery",
      altText: "  Described  ",
      caption: "   ",
      isPublished: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.altText).toBe("Described");
    // An empty string stored where the column means "not set" would later
    // read as a present-but-blank caption.
    expect(result.value.caption).toBeUndefined();
  });
});

describe("validateResourceMetadata", () => {
  it("requires a title, because it becomes the link text", () => {
    expect(
      fields(
        validateResourceMetadata({
          resourceType: "brochure",
          title: "",
          isPublished: false,
        }),
      ),
    ).toContain("title");
  });

  it("accepts a titled resource", () => {
    expect(
      validateResourceMetadata({
        resourceType: "virtual-tour",
        title: "Walk through this home",
        isPublished: true,
      }).ok,
    ).toBe(true);
  });

  it("refuses markup in the title", () => {
    expect(
      fields(
        validateResourceMetadata({
          resourceType: "brochure",
          title: "<img onerror=alert(1) src=x>",
          isPublished: false,
        }),
      ),
    ).toContain("title");
  });

  it("refuses an unknown type", () => {
    expect(
      fields(
        validateResourceMetadata({
          resourceType: "podcast",
          title: "Listen",
          isPublished: false,
        }),
      ),
    ).toContain("resourceType");
  });

  it("does not require a description, unlike an image", () => {
    // A document is represented by its title, which is required; there is no
    // picture to describe.
    expect(
      validateResourceMetadata({
        resourceType: "brochure",
        title: "Brochure",
        isPublished: true,
      }).ok,
    ).toBe(true);
  });
});

/* ====================================================================== */
/* Hero eligibility                                                       */
/* ====================================================================== */

describe("checkHeroEligibility", () => {
  it("accepts a described, published photograph", () => {
    expect(
      checkHeroEligibility({
        imageType: "gallery",
        hasSource: true,
        altText: "Street view of the completed home",
        isPublished: true,
      }).ok,
    ).toBe(true);
  });

  it("accepts a draft photograph without a description", () => {
    // It cannot be seen publicly yet, so the description is not required
    // until it is published.
    expect(
      checkHeroEligibility({
        imageType: "gallery",
        hasSource: true,
        isPublished: false,
      }).ok,
    ).toBe(true);
  });

  it("refuses a floor plan", () => {
    // A card showing a line drawing where every other card shows a
    // photograph reads as a fault.
    const result = checkHeroEligibility({
      imageType: "floor_plan",
      hasSource: true,
      altText: "Floor plan",
      isPublished: true,
    });

    expect(fields(result)).toContain("imageType");
  });

  it("refuses an image with no file or link", () => {
    expect(
      fields(
        checkHeroEligibility({
          imageType: "gallery",
          hasSource: false,
          altText: "Described",
          isPublished: true,
        }),
      ),
    ).toContain("source");
  });

  it("refuses a published image with no description", () => {
    expect(
      fields(
        checkHeroEligibility({
          imageType: "gallery",
          hasSource: true,
          altText: null,
          isPublished: true,
        }),
      ),
    ).toContain("altText");
  });

  it("refuses something that is not an image type", () => {
    expect(
      fields(
        checkHeroEligibility({
          imageType: "virtual-tour",
          hasSource: true,
          isPublished: false,
        }),
      ),
    ).toContain("imageType");
  });
});

/* ====================================================================== */
/* Reorder requests                                                       */
/* ====================================================================== */

describe("validateReorderIds", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";

  it("accepts a list of distinct ids", () => {
    expect(validateReorderIds([a, b]).ok).toBe(true);
  });

  it("refuses an empty list", () => {
    expect(validateReorderIds([]).ok).toBe(false);
  });

  it("refuses duplicates", () => {
    // A duplicate would leave one item unpositioned and another with two
    // positions.
    expect(validateReorderIds([a, b, a]).ok).toBe(false);
  });

  it("refuses anything that is not an id", () => {
    for (const attempt of ["", "1", "not-a-uuid", "'; drop table --"]) {
      expect(validateReorderIds([a, attempt]).ok, attempt).toBe(false);
    }
  });

  it("accepts either casing", () => {
    expect(validateReorderIds([a.toUpperCase()]).ok).toBe(true);
  });
});
