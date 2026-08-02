import { describe, expect, it } from "vitest";

import { propertyRecords } from "@/content/properties";
import { defaultPropertyPrivacy } from "@/lib/properties/privacy";
import {
  hasPrivacyWarnings,
  validatePropertyPrivacy,
  type PrivacyWarningCode,
  type PrivacyValidationInput,
} from "@/lib/properties/privacy-validation";
import type {
  AddressVisibility,
  PropertyPrivacySettings,
} from "@/types";

const fullAddress: AddressVisibility = {
  houseNumber: true,
  street: true,
  suburb: true,
  postcode: true,
};

const suburbOnly: AddressVisibility = {
  houseNumber: false,
  street: false,
  suburb: true,
  postcode: false,
};

function input(
  privacy: Partial<PropertyPrivacySettings> = {},
  hasStreet = true,
): PrivacyValidationInput {
  return {
    suburb: "Craigieburn",
    address: hasStreet
      ? { houseNumber: "27", street: "Example Street", postcode: "3064" }
      : { postcode: "3064" },
    privacy: { ...defaultPropertyPrivacy, ...privacy },
  };
}

function codes(result: ReturnType<typeof validatePropertyPrivacy>) {
  return result.map((warning) => warning.code).sort();
}

describe("address against marker", () => {
  it("warns when a street address is published with a hidden marker", () => {
    const result = validatePropertyPrivacy(
      input({ locationVisibility: "hidden", addressVisibility: fullAddress }),
    );

    expect(codes(result)).toContain("address-contradicts-hidden-marker");
    expect(hasPrivacyWarnings(result)).toBe(true);
  });

  it("warns when a street address is published with a suburb-only marker", () => {
    expect(
      codes(
        validatePropertyPrivacy(
          input({
            locationVisibility: "suburb",
            addressVisibility: fullAddress,
          }),
        ),
      ),
    ).toContain("address-contradicts-suburb-marker");
  });

  it("warns when a street address is published with a generalised marker", () => {
    expect(
      codes(
        validatePropertyPrivacy(
          input({
            locationVisibility: "approximate",
            addressVisibility: fullAddress,
          }),
        ),
      ),
    ).toContain("address-contradicts-approximate-marker");
  });

  it("does not warn when the record has no street to publish", () => {
    expect(
      codes(
        validatePropertyPrivacy(
          input(
            {
              locationVisibility: "hidden",
              addressVisibility: fullAddress,
            },
            false,
          ),
        ),
      ),
    ).not.toContain("address-contradicts-hidden-marker");
  });

  it("notes a house number that cannot be published without its street", () => {
    const result = validatePropertyPrivacy(
      input({
        locationVisibility: "exact",
        addressVisibility: { ...suburbOnly, houseNumber: true },
      }),
    );

    expect(codes(result)).toContain("house-number-without-street");
    expect(hasPrivacyWarnings(result)).toBe(false);
  });
});

describe("directions", () => {
  it("warns when directions are enabled for a generalised marker", () => {
    expect(
      codes(
        validatePropertyPrivacy(
          input({
            locationVisibility: "approximate",
            addressVisibility: suburbOnly,
            allowDirections: true,
          }),
        ),
      ),
    ).toContain("directions-reveal-approximate-marker");
  });

  it("warns when directions are enabled for a suburb-only marker", () => {
    expect(
      codes(
        validatePropertyPrivacy(
          input({
            locationVisibility: "suburb",
            addressVisibility: suburbOnly,
            allowDirections: true,
          }),
        ),
      ),
    ).toContain("directions-reveal-suburb-marker");
  });

  it("notes that directions are ignored while the location is hidden", () => {
    const result = validatePropertyPrivacy(
      input({
        locationVisibility: "hidden",
        addressVisibility: suburbOnly,
        allowDirections: true,
      }),
    );

    expect(codes(result)).toContain("directions-ignored-while-hidden");
    expect(hasPrivacyWarnings(result)).toBe(false);
  });

  it("says nothing about directions left at their default", () => {
    for (const visibility of [
      "exact",
      "approximate",
      "suburb",
      "hidden",
    ] as const) {
      const result = codes(
        validatePropertyPrivacy(
          input({
            locationVisibility: visibility,
            addressVisibility: suburbOnly,
          }),
        ),
      );

      expect(
        result.filter((code: PrivacyWarningCode) =>
          code.startsWith("directions"),
        ),
      ).toEqual([]);
    }
  });
});

describe("manual marker", () => {
  it("warns when manual mode has no position placed", () => {
    const result = validatePropertyPrivacy(
      input({
        locationVisibility: "exact",
        addressVisibility: suburbOnly,
        publicMarkerMode: "manual",
      }),
    );

    expect(codes(result)).toContain("manual-marker-without-coordinates");
    expect(hasPrivacyWarnings(result)).toBe(true);
  });

  it("notes a saved position that the automatic mode will not use", () => {
    expect(
      codes(
        validatePropertyPrivacy(
          input({
            locationVisibility: "exact",
            addressVisibility: suburbOnly,
            manualLatitude: -37.5,
            manualLongitude: 144.9,
          }),
        ),
      ),
    ).toContain("manual-coordinates-unused");
  });

  it("notes a manual position that is hidden anyway", () => {
    expect(
      codes(
        validatePropertyPrivacy(
          input({
            locationVisibility: "hidden",
            addressVisibility: suburbOnly,
            publicMarkerMode: "manual",
            manualLatitude: -37.5,
            manualLongitude: 144.9,
          }),
        ),
      ),
    ).toContain("manual-marker-ignored-while-hidden");
  });
});

describe("suburb reference", () => {
  it("warns when the suburb has no reference position", () => {
    const result = validatePropertyPrivacy({
      suburb: "Nowhere",
      address: { postcode: "0000" },
      privacy: { ...defaultPropertyPrivacy, locationVisibility: "suburb" },
    });

    expect(codes(result)).toContain("suburb-without-reference");
    expect(result[0].message).toContain("Nowhere");
  });

  it("is quiet for a suburb that has one", () => {
    expect(
      codes(
        validatePropertyPrivacy(
          input({
            locationVisibility: "suburb",
            addressVisibility: suburbOnly,
          }),
        ),
      ),
    ).not.toContain("suburb-without-reference");
  });
});

describe("coherent configurations", () => {
  it("reports nothing for an exact location with a full address", () => {
    expect(
      validatePropertyPrivacy(
        input({
          locationVisibility: "exact",
          addressVisibility: fullAddress,
          allowDirections: true,
        }),
      ),
    ).toEqual([]);
  });

  it("reports nothing for a hidden location with no address", () => {
    expect(
      validatePropertyPrivacy(
        input({
          locationVisibility: "hidden",
          addressVisibility: {
            houseNumber: false,
            street: false,
            suburb: false,
            postcode: false,
          },
        }),
      ),
    ).toEqual([]);
  });

  it("finds no warnings in the shipped property data", () => {
    for (const stored of propertyRecords) {
      const warnings = validatePropertyPrivacy(stored);

      expect(
        warnings,
        `${stored.slug}: ${warnings.map((w) => w.code).join(", ")}`,
      ).toEqual([]);
    }
  });
});
