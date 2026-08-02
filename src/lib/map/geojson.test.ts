import { describe, expect, it } from "vitest";

import {
  boundsOfProperties,
  countMappable,
  propertiesToGeoJson,
} from "@/lib/map/geojson";
import type { Property, PublicPropertyLocation } from "@/types";

function location(
  overrides: Partial<PublicPropertyLocation> = {},
): PublicPropertyLocation {
  return {
    visibility: "exact",
    publicLatitude: -37.53,
    publicLongitude: 144.88,
    markerMode: "automatic",
    address: null,
    allowDirections: false,
    label: null,
    accuracyNote: null,
    ...overrides,
  };
}

function property(overrides: Partial<Property> & { id: string }): Property {
  return {
    slug: overrides.id,
    name: `Concept ${overrides.id}`,
    summary: "Summary",
    suburb: "Mickleham",
    state: "VIC",
    status: "move-in-ready",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 400,
    placeholderVariant: "single-storey",
    isFeatured: false,
    location: location(),
    ...overrides,
  };
}

describe("propertiesToGeoJson", () => {
  it("builds one point feature per mappable property", () => {
    const collection = propertiesToGeoJson([
      property({ id: "a" }),
      property({ id: "b", location: location({ publicLatitude: -37.6, publicLongitude: 144.94 }) }),
    ]);

    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(2);
  });

  it("writes coordinates in GeoJSON order, longitude first", () => {
    const [feature] = propertiesToGeoJson([
      property({ id: "a", location: location({ publicLatitude: -37.53, publicLongitude: 144.88 }) }),
    ]).features;

    expect(feature.geometry.coordinates).toEqual([144.88, -37.53]);
  });

  it("promotes the property id so hover and selection can filter on it", () => {
    const [feature] = propertiesToGeoJson([property({ id: "a" })]).features;

    expect(feature.id).toBe("a");
    expect(feature.properties.id).toBe("a");
  });

  it("omits properties with no published position", () => {
    const collection = propertiesToGeoJson([
      property({ id: "a" }),
      property({
        id: "hidden",
        location: location({
          visibility: "hidden",
          publicLatitude: undefined,
          publicLongitude: undefined,
        }),
      }),
    ]);

    expect(collection.features.map((feature) => feature.id)).toEqual(["a"]);
  });

  it("carries only presentational fields into feature properties", () => {
    const [feature] = propertiesToGeoJson([property({ id: "a" })]).features;

    expect(Object.keys(feature.properties).sort()).toEqual([
      "id",
      "name",
      "slug",
      "status",
      "suburb",
    ]);
  });

  it("returns an empty collection for an empty list", () => {
    expect(propertiesToGeoJson([]).features).toEqual([]);
  });
});

describe("boundsOfProperties", () => {
  it("returns the south-west and north-east corners", () => {
    const bounds = boundsOfProperties([
      property({
        id: "a",
        location: location({ publicLatitude: -37.53, publicLongitude: 144.88 }),
      }),
      property({
        id: "b",
        location: location({ publicLatitude: -37.61, publicLongitude: 144.96 }),
      }),
    ]);

    expect(bounds).toEqual([
      [144.88, -37.61],
      [144.96, -37.53],
    ]);
  });

  it("returns null when nothing can be mapped", () => {
    expect(boundsOfProperties([])).toBeNull();
    expect(
      boundsOfProperties([
        property({
          id: "hidden",
          location: location({
            visibility: "hidden",
            publicLatitude: undefined,
            publicLongitude: undefined,
          }),
        }),
      ]),
    ).toBeNull();
  });
});

describe("countMappable", () => {
  it("counts only properties with a published position", () => {
    expect(
      countMappable([
        property({ id: "a" }),
        property({
          id: "b",
          location: location({
            publicLatitude: undefined,
            publicLongitude: undefined,
          }),
        }),
      ]),
    ).toBe(1);
  });
});
