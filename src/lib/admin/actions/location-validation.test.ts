import { describe, expect, it } from "vitest";

/**
 * Tests for location form validation logic.
 *
 * These validate the same rules enforced by saveLocationAction
 * without needing a Supabase connection.
 */

interface LocationFormData {
  privateLatitude: number;
  privateLongitude: number;
  locationVisibility: "exact" | "approximate" | "suburb" | "hidden";
  privacyRadiusMeters: number | null;
  publicMarkerMode: "automatic" | "manual";
  manualPublicLatitude?: number;
  manualPublicLongitude?: number;
}

function validateLocation(data: LocationFormData): string | null {
  if (
    !Number.isFinite(data.privateLatitude) ||
    Math.abs(data.privateLatitude) > 90
  ) {
    return "Latitude must be between -90 and 90.";
  }
  if (
    !Number.isFinite(data.privateLongitude) ||
    Math.abs(data.privateLongitude) > 180
  ) {
    return "Longitude must be between -180 and 180.";
  }

  if (data.locationVisibility === "approximate" && !data.privacyRadiusMeters) {
    return "Approximate visibility requires a privacy radius.";
  }

  if (data.publicMarkerMode === "manual") {
    if (data.manualPublicLatitude === undefined || data.manualPublicLongitude === undefined) {
      return "Manual marker mode requires manual coordinates.";
    }
  }

  return null;
}

describe("validateLocation", () => {
  it("passes for valid exact coordinates", () => {
    expect(
      validateLocation({
        privateLatitude: -37.53,
        privateLongitude: 144.88,
        locationVisibility: "exact",
        privacyRadiusMeters: null,
        publicMarkerMode: "automatic",
      }),
    ).toBeNull();
  });

  it("rejects latitude out of range", () => {
    expect(
      validateLocation({
        privateLatitude: 91,
        privateLongitude: 144.88,
        locationVisibility: "exact",
        privacyRadiusMeters: null,
        publicMarkerMode: "automatic",
      }),
    ).toContain("Latitude");

    expect(
      validateLocation({
        privateLatitude: -91,
        privateLongitude: 144.88,
        locationVisibility: "exact",
        privacyRadiusMeters: null,
        publicMarkerMode: "automatic",
      }),
    ).toContain("Latitude");
  });

  it("rejects longitude out of range", () => {
    expect(
      validateLocation({
        privateLatitude: -37.53,
        privateLongitude: 181,
        locationVisibility: "exact",
        privacyRadiusMeters: null,
        publicMarkerMode: "automatic",
      }),
    ).toContain("Longitude");
  });

  it("rejects NaN coordinates", () => {
    expect(
      validateLocation({
        privateLatitude: NaN,
        privateLongitude: 144.88,
        locationVisibility: "exact",
        privacyRadiusMeters: null,
        publicMarkerMode: "automatic",
      }),
    ).toContain("Latitude");
  });

  it("rejects approximate without radius", () => {
    expect(
      validateLocation({
        privateLatitude: -37.53,
        privateLongitude: 144.88,
        locationVisibility: "approximate",
        privacyRadiusMeters: null,
        publicMarkerMode: "automatic",
      }),
    ).toContain("radius");
  });

  it("passes approximate with radius", () => {
    expect(
      validateLocation({
        privateLatitude: -37.53,
        privateLongitude: 144.88,
        locationVisibility: "approximate",
        privacyRadiusMeters: 500,
        publicMarkerMode: "automatic",
      }),
    ).toBeNull();
  });

  it("rejects manual mode without coordinates", () => {
    expect(
      validateLocation({
        privateLatitude: -37.53,
        privateLongitude: 144.88,
        locationVisibility: "exact",
        privacyRadiusMeters: null,
        publicMarkerMode: "manual",
        manualPublicLatitude: undefined,
        manualPublicLongitude: undefined,
      }),
    ).toContain("Manual marker");
  });

  it("passes manual mode with coordinates", () => {
    expect(
      validateLocation({
        privateLatitude: -37.53,
        privateLongitude: 144.88,
        locationVisibility: "approximate",
        privacyRadiusMeters: 1000,
        publicMarkerMode: "manual",
        manualPublicLatitude: -37.5,
        manualPublicLongitude: 144.9,
      }),
    ).toBeNull();
  });

  it("passes for hidden visibility", () => {
    expect(
      validateLocation({
        privateLatitude: -37.53,
        privateLongitude: 144.88,
        locationVisibility: "hidden",
        privacyRadiusMeters: null,
        publicMarkerMode: "automatic",
      }),
    ).toBeNull();
  });

  it("passes for suburb visibility", () => {
    expect(
      validateLocation({
        privateLatitude: -37.53,
        privateLongitude: 144.88,
        locationVisibility: "suburb",
        privacyRadiusMeters: null,
        publicMarkerMode: "automatic",
      }),
    ).toBeNull();
  });
});
