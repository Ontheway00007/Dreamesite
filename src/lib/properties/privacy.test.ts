import { describe, expect, it } from "vitest";

import {
  isMappable,
  resolveLocationPrecision,
  snapCoordinate,
  toPublicProperty,
} from "@/lib/properties/privacy";
import type { PropertyRecord } from "@/types";

const baseRecord: PropertyRecord = {
  id: "test",
  slug: "test",
  name: "Test concept",
  summary: "A test property.",
  suburb: "Mickleham",
  state: "VIC",
  postcode: "3064",
  status: "move-in-ready",
  bedrooms: 4,
  bathrooms: 2,
  carSpaces: 2,
  landSize: 400,
  placeholderVariant: "single-storey",
  locationPrecision: "exact",
  latitude: -37.531234,
  longitude: 144.886789,
  isFeatured: false,
};

describe("resolveLocationPrecision", () => {
  it("keeps exact precision for a home on the market", () => {
    expect(
      resolveLocationPrecision({
        status: "move-in-ready",
        locationPrecision: "exact",
      }),
    ).toBe("exact");
  });

  it("downgrades exact to approximate for occupied homes", () => {
    for (const status of ["sold", "completed"] as const) {
      expect(
        resolveLocationPrecision({ status, locationPrecision: "exact" }),
      ).toBe("approximate");
    }
  });

  it("never upgrades a private location", () => {
    expect(
      resolveLocationPrecision({
        status: "move-in-ready",
        locationPrecision: "private",
      }),
    ).toBe("private");
  });
});

describe("snapCoordinate", () => {
  it("reduces a coordinate to the neighbourhood grid", () => {
    expect(snapCoordinate(-37.531234)).toBe(-37.531);
    expect(snapCoordinate(144.886789)).toBe(144.887);
  });
});

describe("toPublicProperty", () => {
  it("passes exact coordinates through for an available home", () => {
    const published = toPublicProperty(baseRecord);

    expect(published.locationPrecision).toBe("exact");
    expect(published.latitude).toBe(baseRecord.latitude);
    expect(published.longitude).toBe(baseRecord.longitude);
  });

  it("removes coordinates entirely for a private location", () => {
    const published = toPublicProperty({
      ...baseRecord,
      locationPrecision: "private",
    });

    expect(published.latitude).toBeUndefined();
    expect(published.longitude).toBeUndefined();
    expect(isMappable(published)).toBe(false);
  });

  it("reduces precision for an approximate location", () => {
    const published = toPublicProperty({
      ...baseRecord,
      locationPrecision: "approximate",
    });

    expect(published.latitude).toBe(-37.531);
    expect(published.longitude).toBe(144.887);
  });

  it("reduces precision for a sold home even when the record says exact", () => {
    const published = toPublicProperty({
      ...baseRecord,
      status: "sold",
      locationPrecision: "exact",
    });

    expect(published.locationPrecision).toBe("approximate");
    expect(published.latitude).not.toBe(baseRecord.latitude);
    expect(published.latitude).toBe(-37.531);
  });

  it("drops unusable coordinates rather than publishing a broken pin", () => {
    const published = toPublicProperty({
      ...baseRecord,
      latitude: Number.NaN,
      longitude: 1000,
    });

    expect(isMappable(published)).toBe(false);
  });
});
