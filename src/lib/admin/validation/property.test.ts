import { describe, expect, it } from "vitest";

import {
  LIMITS,
  PROPERTY_STATUSES,
  slugify,
  validateProperty,
  validateSlug,
  type PropertyInput,
} from "@/lib/admin/validation/property";

/**
 * These test the real validation module — the one the Server Actions call —
 * rather than a copy of its rules. Any drift between what is tested and what
 * runs is therefore impossible.
 */

function input(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    name: "Single storey concept",
    slug: "single-storey-concept",
    summary: "Single level, north-facing living.",
    status: "move-in-ready",
    suburb: "Mickleham",
    state: "VIC",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    landSizeSqm: 448,
    houseSizeSqm: 212,
    isFeatured: false,
    isPublished: false,
    displayPriority: 10,
    displayIsHome: false,
    ...overrides,
  };
}

/** Fields carrying an error, for concise assertions. */
function fields(result: ReturnType<typeof validateProperty>): string[] {
  return result.ok ? [] : result.errors.map((error) => error.field);
}

describe("validateSlug", () => {
  it("accepts the shapes the database constraint allows", () => {
    for (const slug of ["a", "abc", "abc-123", "single-storey-concept", "x1-y2-z3"]) {
      expect(validateSlug(slug).ok, slug).toBe(true);
    }
  });

  it("rejects what the database constraint rejects", () => {
    // Each of these would fail `properties_slug_format` at the database.
    const rejected = [
      "",
      "Hello",
      "with space",
      "-leading",
      "trailing-",
      "double--hyphen",
      "under_score",
      "punctuation!",
      "slash/es",
      "accentué",
    ];

    for (const slug of rejected) {
      expect(validateSlug(slug).ok, slug).toBe(false);
    }
  });

  it("rejects an over-long slug", () => {
    expect(validateSlug("a".repeat(LIMITS.slug + 1)).ok).toBe(false);
    expect(validateSlug("a".repeat(LIMITS.slug)).ok).toBe(true);
  });

  it("reports against the slug field", () => {
    const result = validateSlug("Not Valid");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].field).toBe("slug");
    }
  });
});

describe("slugify", () => {
  it("produces a slug the validator accepts", () => {
    const cases = [
      "Single Storey Concept",
      "  Padded  Name  ",
      "Punctuation! Here?",
      "Café Résumé",
      "UPPERCASE",
      "multiple---hyphens",
      "trailing-",
    ];

    for (const value of cases) {
      const slug = slugify(value);
      expect(validateSlug(slug).ok, `${value} -> ${slug}`).toBe(true);
    }
  });

  it("strips accents rather than dropping the letter", () => {
    expect(slugify("Café")).toBe("cafe");
    expect(slugify("Résumé")).toBe("resume");
  });

  it("never exceeds the slug limit or ends in a hyphen", () => {
    const slug = slugify("word ".repeat(60));

    expect(slug.length).toBeLessThanOrEqual(LIMITS.slug);
    expect(slug.endsWith("-")).toBe(false);
    expect(validateSlug(slug).ok).toBe(true);
  });
});

describe("validateProperty", () => {
  it("accepts a complete record", () => {
    expect(validateProperty(input()).ok).toBe(true);
  });

  it("accepts every status the schema allows", () => {
    for (const status of PROPERTY_STATUSES) {
      expect(validateProperty(input({ status })).ok, status).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    expect(fields(validateProperty(input({ status: "on-fire" })))).toContain("status");
  });

  /* --- Required text ---------------------------------------------------- */

  it("requires a name, summary, suburb and state", () => {
    expect(fields(validateProperty(input({ name: "" })))).toContain("name");
    expect(fields(validateProperty(input({ name: "   " })))).toContain("name");
    expect(fields(validateProperty(input({ summary: "" })))).toContain("summary");
    expect(fields(validateProperty(input({ suburb: "" })))).toContain("suburb");
    expect(fields(validateProperty(input({ state: "" })))).toContain("state");
  });

  it("enforces the text length limits", () => {
    expect(
      fields(validateProperty(input({ name: "x".repeat(LIMITS.name + 1) }))),
    ).toContain("name");
    expect(
      fields(validateProperty(input({ summary: "x".repeat(LIMITS.summary + 1) }))),
    ).toContain("summary");
    expect(
      fields(
        validateProperty(
          input({ priceDisplay: "x".repeat(LIMITS.priceDisplay + 1) }),
        ),
      ),
    ).toContain("priceDisplay");
  });

  /* --- Measurements ----------------------------------------------------- */

  it("rejects negative measurements", () => {
    expect(fields(validateProperty(input({ bedrooms: -1 })))).toContain("bedrooms");
    expect(fields(validateProperty(input({ bathrooms: -1 })))).toContain("bathrooms");
    expect(fields(validateProperty(input({ carSpaces: -1 })))).toContain("carSpaces");
    expect(fields(validateProperty(input({ landSizeSqm: -1 })))).toContain(
      "landSizeSqm",
    );
    expect(fields(validateProperty(input({ houseSizeSqm: -1 })))).toContain(
      "houseSizeSqm",
    );
    expect(fields(validateProperty(input({ displayPriority: -1 })))).toContain(
      "displayPriority",
    );
  });

  it("rejects implausibly large measurements", () => {
    expect(fields(validateProperty(input({ bedrooms: 21 })))).toContain("bedrooms");
    expect(fields(validateProperty(input({ carSpaces: 11 })))).toContain("carSpaces");
  });

  it("rejects fractional room counts", () => {
    // The columns are smallint; 2.5 would be silently rounded.
    expect(fields(validateProperty(input({ bedrooms: 2.5 })))).toContain("bedrooms");
  });

  it("rejects NaN and Infinity", () => {
    expect(fields(validateProperty(input({ bedrooms: Number.NaN })))).toContain(
      "bedrooms",
    );
    expect(
      fields(validateProperty(input({ landSizeSqm: Number.POSITIVE_INFINITY }))),
    ).toContain("landSizeSqm");
  });

  it("treats house size as optional", () => {
    expect(validateProperty(input({ houseSizeSqm: undefined })).ok).toBe(true);
  });

  it("accepts zero where zero is meaningful", () => {
    // A studio has no separate bedroom; priority zero is the first slot.
    expect(
      validateProperty(input({ bedrooms: 0, carSpaces: 0, displayPriority: 0 })).ok,
    ).toBe(true);
  });

  /* --- Description blocks ---------------------------------------------- */

  it("requires description block ids to be present and unique", () => {
    expect(
      fields(
        validateProperty(
          input({ descriptionBlocks: [{ id: "", text: "Some copy." }] }),
        ),
      ),
    ).toContain("description");

    expect(
      fields(
        validateProperty(
          input({
            descriptionBlocks: [
              { id: "p1", text: "First." },
              { id: "p1", text: "Second." },
            ],
          }),
        ),
      ),
    ).toContain("description");
  });

  it("accepts well-formed description blocks", () => {
    expect(
      validateProperty(
        input({
          descriptionBlocks: [
            { id: "p1", text: "First." },
            { id: "p2", text: "Second." },
          ],
          descriptionSource: "written",
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects blocks that are all empty", () => {
    expect(
      fields(
        validateProperty(
          input({ descriptionBlocks: [{ id: "p1", text: "  " }] }),
        ),
      ),
    ).toContain("description");
  });

  /* --- Normalisation ---------------------------------------------------- */

  it("trims text and drops empty optional strings", () => {
    const result = validateProperty(
      input({
        name: "  Padded name  ",
        summary: "  Padded summary.  ",
        suburb: "  Mickleham  ",
        priceDisplay: "   ",
        completionLabel: "",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.name).toBe("Padded name");
    expect(result.value.summary).toBe("Padded summary.");
    expect(result.value.suburb).toBe("Mickleham");
    // An empty optional must become undefined, not "" — the column means
    // "not set", and an empty string is a value.
    expect(result.value.priceDisplay).toBeUndefined();
    expect(result.value.completionLabel).toBeUndefined();
  });

  it("drops empty description blocks during normalisation", () => {
    const result = validateProperty(
      input({
        descriptionBlocks: [
          { id: "p1", text: "Kept." },
          { id: "p2", text: "   " },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.descriptionBlocks).toHaveLength(1);
    expect(result.value.descriptionBlocks?.[0].id).toBe("p1");
  });

  /* --- Reporting -------------------------------------------------------- */

  it("reports every problem at once rather than one at a time", () => {
    const result = validateProperty(
      input({ name: "", summary: "", slug: "Bad Slug", bedrooms: -1 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    // Filling in a long form one error per submit is a poor experience.
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    expect(fields(result)).toEqual(
      expect.arrayContaining(["name", "summary", "slug", "bedrooms"]),
    );
  });

  it("writes messages for an administrator, not an engineer", () => {
    const result = validateProperty(input({ slug: "Bad Slug" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const message = result.errors[0].message;

    expect(message).not.toMatch(/regex|pattern|constraint|\^|\$/i);
    expect(message).toContain("lowercase");
  });
});
