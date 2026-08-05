import { describe, expect, it } from "vitest";

import {
  validateLocation,
  type LocationInput,
} from "@/lib/admin/validation/location";

/**
 * These rules mirror the CHECK constraints in migration 0005. The tests
 * therefore serve two purposes: they verify the validator, and they document
 * which database constraint each rule is standing in for.
 */

function input(overrides: Partial<LocationInput> = {}): LocationInput {
  return {
    privateLatitude: -37.5312,
    privateLongitude: 144.8861,
    postcode: "3064",
    locationVisibility: "suburb",
    privacyRadiusMeters: 500,
    publicMarkerMode: "automatic",
    showHouseNumber: false,
    showStreet: false,
    showSuburb: true,
    showPostcode: true,
    ...overrides,
  };
}

function fields(result: ReturnType<typeof validateLocation>): string[] {
  return result.ok ? [] : result.errors.map((error) => error.field);
}

describe("stored position", () => {
  it("accepts a valid coordinate", () => {
    expect(validateLocation(input()).ok).toBe(true);
  });

  it("rejects a latitude outside -90..90", () => {
    expect(fields(validateLocation(input({ privateLatitude: 91 })))).toContain(
      "privateLatitude",
    );
    expect(fields(validateLocation(input({ privateLatitude: -91 })))).toContain(
      "privateLatitude",
    );
  });

  it("rejects a longitude outside -180..180", () => {
    expect(fields(validateLocation(input({ privateLongitude: 181 })))).toContain(
      "privateLongitude",
    );
    expect(fields(validateLocation(input({ privateLongitude: -181 })))).toContain(
      "privateLongitude",
    );
  });

  it("accepts the exact boundaries", () => {
    expect(
      validateLocation(input({ privateLatitude: 90, privateLongitude: 180 })).ok,
    ).toBe(true);
    expect(
      validateLocation(input({ privateLatitude: -90, privateLongitude: -180 })).ok,
    ).toBe(true);
  });

  it("rejects NaN and Infinity", () => {
    expect(
      fields(validateLocation(input({ privateLatitude: Number.NaN }))),
    ).toContain("privateLatitude");
    expect(
      fields(
        validateLocation(input({ privateLongitude: Number.POSITIVE_INFINITY })),
      ),
    ).toContain("privateLongitude");
  });

  it("rejects 0,0", () => {
    // Within range, but in the Atlantic — almost always an unfilled form.
    expect(
      fields(validateLocation(input({ privateLatitude: 0, privateLongitude: 0 }))),
    ).toContain("privateLatitude");
  });
});

describe("postcode", () => {
  it("accepts four digits", () => {
    expect(validateLocation(input({ postcode: "3064" })).ok).toBe(true);
  });

  it("treats it as optional", () => {
    expect(validateLocation(input({ postcode: undefined })).ok).toBe(true);
    expect(validateLocation(input({ postcode: "" })).ok).toBe(true);
    expect(validateLocation(input({ postcode: "  " })).ok).toBe(true);
  });

  it("rejects anything that is not four digits", () => {
    for (const postcode of ["306", "30644", "ABCD", "30 64", "3o64"]) {
      expect(fields(validateLocation(input({ postcode }))), postcode).toContain(
        "postcode",
      );
    }
  });
});

describe("approximate_requires_radius", () => {
  it("accepts approximate with a valid radius", () => {
    for (const radius of [100, 250, 500, 1000, 2000, 5000] as const) {
      expect(
        validateLocation(
          input({ locationVisibility: "approximate", privacyRadiusMeters: radius }),
        ).ok,
        String(radius),
      ).toBe(true);
    }
  });

  it("rejects approximate with a radius the schema does not allow", () => {
    expect(
      fields(
        validateLocation(
          input({
            locationVisibility: "approximate",
            privacyRadiusMeters: 750 as never,
          }),
        ),
      ),
    ).toContain("privacyRadiusMeters");
  });

  it("does not require a radius for the other precisions", () => {
    for (const visibility of ["exact", "suburb", "hidden"] as const) {
      expect(
        validateLocation(
          input({ locationVisibility: visibility, privacyRadiusMeters: 750 as never }),
        ).ok,
        visibility,
      ).toBe(true);
    }
  });
});

describe("manual_requires_coordinates", () => {
  it("accepts manual placement with both coordinates", () => {
    expect(
      validateLocation(
        input({
          locationVisibility: "approximate",
          publicMarkerMode: "manual",
          manualPublicLatitude: -37.4995,
          manualPublicLongitude: 144.9563,
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects manual placement with neither", () => {
    expect(
      fields(validateLocation(input({ publicMarkerMode: "manual" }))),
    ).toContain("manualPublicLatitude");
  });

  it("rejects manual placement with only one", () => {
    expect(
      fields(
        validateLocation(
          input({ publicMarkerMode: "manual", manualPublicLatitude: -37.5 }),
        ),
      ),
    ).toContain("manualPublicLatitude");

    expect(
      fields(
        validateLocation(
          input({ publicMarkerMode: "manual", manualPublicLongitude: 144.9 }),
        ),
      ),
    ).toContain("manualPublicLatitude");
  });

  it("range-checks the manual coordinates too", () => {
    expect(
      fields(
        validateLocation(
          input({
            publicMarkerMode: "manual",
            manualPublicLatitude: 91,
            manualPublicLongitude: 144.9,
          }),
        ),
      ),
    ).toContain("manualPublicLatitude");

    expect(
      fields(
        validateLocation(
          input({
            publicMarkerMode: "manual",
            manualPublicLatitude: -37.5,
            manualPublicLongitude: 181,
          }),
        ),
      ),
    ).toContain("manualPublicLongitude");
  });

  it("explains that manual placement is pointless while hidden", () => {
    // Legal at the database, but the marker is never published, so saying so
    // is more useful than accepting it silently.
    const result = validateLocation(
      input({
        locationVisibility: "hidden",
        publicMarkerMode: "manual",
        manualPublicLatitude: -37.5,
        manualPublicLongitude: 144.9,
      }),
    );

    expect(fields(result)).toContain("publicMarkerMode");
    if (!result.ok) {
      const message = result.errors.find(
        (error) => error.field === "publicMarkerMode",
      )?.message;
      expect(message).toContain("hidden");
    }
  });
});

describe("visibility and marker mode values", () => {
  it("accepts all four precisions", () => {
    for (const visibility of ["exact", "approximate", "suburb", "hidden"] as const) {
      expect(
        validateLocation(input({ locationVisibility: visibility })).ok,
        visibility,
      ).toBe(true);
    }
  });

  it("rejects an unknown precision", () => {
    expect(
      fields(validateLocation(input({ locationVisibility: "street" as never }))),
    ).toContain("locationVisibility");
  });

  it("rejects an unknown marker mode", () => {
    expect(
      fields(validateLocation(input({ publicMarkerMode: "guess" as never }))),
    ).toContain("publicMarkerMode");
  });
});

describe("normalisation", () => {
  it("trims address parts and drops empty ones", () => {
    const result = validateLocation(
      input({
        houseNumber: "  27  ",
        street: "  Example Street  ",
        postcode: "  3064  ",
        suburbReference: "   ",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.houseNumber).toBe("27");
    expect(result.value.street).toBe("Example Street");
    expect(result.value.postcode).toBe("3064");
    expect(result.value.suburbReference).toBeUndefined();
  });
});

describe("reporting", () => {
  it("reports every problem at once", () => {
    const result = validateLocation(
      input({
        privateLatitude: 91,
        privateLongitude: 181,
        postcode: "bad",
        publicMarkerMode: "manual",
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("never mentions a constraint name", () => {
    const result = validateLocation(
      input({ locationVisibility: "approximate", privacyRadiusMeters: 750 as never }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    for (const error of result.errors) {
      expect(error.message).not.toMatch(/constraint|check_|_requires_/i);
    }
  });
});
