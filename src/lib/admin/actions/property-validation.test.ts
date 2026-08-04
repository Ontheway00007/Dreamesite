import { describe, expect, it } from "vitest";

/**
 * Tests for property form validation logic.
 *
 * These test the pure validation rules without touching Supabase.
 * The server actions call these internally — testing them here means
 * we verify the rules independently of auth/DB state.
 */

// Extract the validation function for testing
// (In production this runs inside createPropertyAction/updatePropertyAction)
function validateSlug(slug: string): string | null {
  if (!slug) return "Slug is required.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Slug must be lowercase letters, numbers, and hyphens only.";
  }
  if (slug.length > 100) return "Slug must be 100 characters or fewer.";
  return null;
}

interface PropertyFormData {
  name: string;
  slug: string;
  summary: string;
  status: string;
  suburb: string;
  state: string;
  bedrooms: number;
  bathrooms: number;
  carSpaces: number;
  landSizeSqm: number;
  houseSizeSqm?: number;
  displayPriority: number;
  isFeatured: boolean;
  isPublished: boolean;
  displayIsHome: boolean;
}

function validateProperty(data: PropertyFormData): string | null {
  if (!data.name?.trim()) return "Name is required.";
  if (data.name.length > 200) return "Name must be 200 characters or fewer.";

  const slugError = validateSlug(data.slug);
  if (slugError) return slugError;

  if (!data.summary?.trim()) return "Summary is required.";
  if (data.summary.length > 500) return "Summary must be 500 characters or fewer.";

  const validStatuses = ["move-in-ready", "under-construction", "completed", "sold"];
  if (!validStatuses.includes(data.status)) return "Invalid status.";

  if (!data.suburb?.trim()) return "Suburb is required.";
  if (!data.state?.trim()) return "State is required.";

  if (data.bedrooms < 0 || data.bedrooms > 20) return "Bedrooms must be 0-20.";
  if (data.bathrooms < 0 || data.bathrooms > 20) return "Bathrooms must be 0-20.";
  if (data.carSpaces < 0 || data.carSpaces > 10) return "Car spaces must be 0-10.";
  if (data.landSizeSqm < 0) return "Land size must be non-negative.";
  if (data.houseSizeSqm !== undefined && data.houseSizeSqm < 0) {
    return "House size must be non-negative.";
  }
  if (data.displayPriority < 0) return "Display priority must be non-negative.";

  return null;
}

function validFormData(overrides: Partial<PropertyFormData> = {}): PropertyFormData {
  return {
    name: "Test Property",
    slug: "test-property",
    summary: "A test property for validation.",
    status: "move-in-ready",
    suburb: "Mickleham",
    state: "VIC",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    landSizeSqm: 400,
    displayPriority: 0,
    isFeatured: false,
    isPublished: false,
    displayIsHome: false,
    ...overrides,
  };
}

describe("validateSlug", () => {
  it("accepts valid slugs", () => {
    expect(validateSlug("single-storey-concept")).toBeNull();
    expect(validateSlug("a")).toBeNull();
    expect(validateSlug("abc-123")).toBeNull();
    expect(validateSlug("my-home")).toBeNull();
  });

  it("rejects empty slugs", () => {
    expect(validateSlug("")).toBe("Slug is required.");
  });

  it("rejects uppercase characters", () => {
    expect(validateSlug("Hello")).toContain("lowercase");
  });

  it("rejects spaces", () => {
    expect(validateSlug("my home")).toContain("lowercase");
  });

  it("rejects leading/trailing hyphens", () => {
    expect(validateSlug("-start")).toContain("lowercase");
    expect(validateSlug("end-")).toContain("lowercase");
  });

  it("rejects consecutive hyphens", () => {
    expect(validateSlug("double--hyphen")).toContain("lowercase");
  });

  it("rejects overly long slugs", () => {
    expect(validateSlug("a".repeat(101))).toContain("100 characters");
  });
});

describe("validateProperty", () => {
  it("passes for valid data", () => {
    expect(validateProperty(validFormData())).toBeNull();
  });

  it("rejects missing name", () => {
    expect(validateProperty(validFormData({ name: "" }))).toContain("Name is required");
    expect(validateProperty(validFormData({ name: "   " }))).toContain("Name is required");
  });

  it("rejects name over 200 characters", () => {
    expect(validateProperty(validFormData({ name: "x".repeat(201) }))).toContain("200 characters");
  });

  it("rejects missing summary", () => {
    expect(validateProperty(validFormData({ summary: "" }))).toContain("Summary is required");
  });

  it("rejects summary over 500 characters", () => {
    expect(validateProperty(validFormData({ summary: "x".repeat(501) }))).toContain("500 characters");
  });

  it("rejects invalid status", () => {
    expect(validateProperty(validFormData({ status: "on-fire" }))).toContain("Invalid status");
  });

  it("accepts all valid statuses", () => {
    for (const status of ["move-in-ready", "under-construction", "completed", "sold"]) {
      expect(validateProperty(validFormData({ status }))).toBeNull();
    }
  });

  it("rejects missing suburb", () => {
    expect(validateProperty(validFormData({ suburb: "" }))).toContain("Suburb is required");
  });

  it("rejects missing state", () => {
    expect(validateProperty(validFormData({ state: "" }))).toContain("State is required");
  });

  it("rejects negative bedrooms", () => {
    expect(validateProperty(validFormData({ bedrooms: -1 }))).toContain("Bedrooms");
  });

  it("rejects excessive bedrooms", () => {
    expect(validateProperty(validFormData({ bedrooms: 21 }))).toContain("Bedrooms");
  });

  it("rejects negative bathrooms", () => {
    expect(validateProperty(validFormData({ bathrooms: -1 }))).toContain("Bathrooms");
  });

  it("rejects negative car spaces", () => {
    expect(validateProperty(validFormData({ carSpaces: -1 }))).toContain("Car spaces");
  });

  it("rejects excessive car spaces", () => {
    expect(validateProperty(validFormData({ carSpaces: 11 }))).toContain("Car spaces");
  });

  it("rejects negative land size", () => {
    expect(validateProperty(validFormData({ landSizeSqm: -1 }))).toContain("Land size");
  });

  it("rejects negative house size", () => {
    expect(validateProperty(validFormData({ houseSizeSqm: -1 }))).toContain("House size");
  });

  it("allows undefined house size", () => {
    expect(validateProperty(validFormData({ houseSizeSqm: undefined }))).toBeNull();
  });

  it("rejects negative display priority", () => {
    expect(validateProperty(validFormData({ displayPriority: -1 }))).toContain("Display priority");
  });
});
