import { describe, expect, it } from "vitest";

import {
  defaultFilters,
  filterProperties,
  hasActiveFilters,
  parsePropertyFilters,
  parseViewMode,
  propertyFiltersToQuery,
  suburbOptions,
  type PropertyFilters,
} from "@/lib/properties/filters";
import type { Property } from "@/types";

function property(overrides: Partial<Property> & { id: string }): Property {
  return {
    slug: overrides.id,
    name: `Concept ${overrides.id}`,
    summary: "Summary",
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
    isFeatured: false,
    ...overrides,
  };
}

const properties: Property[] = [
  property({ id: "a", suburb: "Mickleham", status: "move-in-ready", bedrooms: 4 }),
  property({ id: "b", suburb: "Craigieburn", status: "under-construction", bedrooms: 5 }),
  property({ id: "c", suburb: "Donnybrook", status: "sold", bedrooms: 3 }),
  property({ id: "d", suburb: "Craigieburn", status: "completed", bedrooms: 4 }),
];

function filters(overrides: Partial<PropertyFilters> = {}): PropertyFilters {
  return { ...defaultFilters, ...overrides };
}

describe("filterProperties", () => {
  it("returns everything by default", () => {
    expect(filterProperties(properties, defaultFilters)).toHaveLength(4);
  });

  it("filters by status", () => {
    const result = filterProperties(properties, filters({ status: "sold" }));

    expect(result.map((item) => item.id)).toEqual(["c"]);
  });

  it("filters by suburb", () => {
    const result = filterProperties(
      properties,
      filters({ suburb: "Craigieburn" }),
    );

    expect(result.map((item) => item.id)).toEqual(["b", "d"]);
  });

  it("treats bedrooms as a minimum", () => {
    expect(
      filterProperties(properties, filters({ beds: "4" })).map((i) => i.id),
    ).toEqual(["a", "b", "d"]);
    expect(
      filterProperties(properties, filters({ beds: "5" })).map((i) => i.id),
    ).toEqual(["b"]);
  });

  it("matches the text query against name and suburb, case-insensitively", () => {
    expect(
      filterProperties(properties, filters({ query: "donny" })).map((i) => i.id),
    ).toEqual(["c"]);
    expect(
      filterProperties(properties, filters({ query: "Concept b" })).map(
        (i) => i.id,
      ),
    ).toEqual(["b"]);
  });

  it("combines filters", () => {
    const result = filterProperties(
      properties,
      filters({ suburb: "Craigieburn", beds: "5" }),
    );

    expect(result.map((item) => item.id)).toEqual(["b"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(
      filterProperties(properties, filters({ status: "sold", beds: "5" })),
    ).toEqual([]);
  });
});

describe("suburbOptions", () => {
  it("derives a sorted, de-duplicated list from the data", () => {
    expect(suburbOptions(properties)).toEqual([
      "Craigieburn",
      "Donnybrook",
      "Mickleham",
    ]);
  });
});

describe("parsePropertyFilters", () => {
  const suburbs = ["Craigieburn", "Mickleham"];

  it("reads valid values", () => {
    const params = new URLSearchParams({
      status: "sold",
      suburb: "Mickleham",
      beds: "4",
    });

    expect(parsePropertyFilters(params, suburbs)).toEqual({
      status: "sold",
      suburb: "Mickleham",
      beds: "4",
      query: "",
    });
  });

  it("falls back to defaults for unknown values", () => {
    const params = new URLSearchParams({
      status: "on-fire",
      suburb: "Atlantis",
      beds: "99",
    });

    expect(parsePropertyFilters(params, suburbs)).toEqual(defaultFilters);
  });

  it("reads the view mode, defaulting to map", () => {
    expect(parseViewMode(new URLSearchParams())).toBe("map");
    expect(parseViewMode(new URLSearchParams({ view: "list" }))).toBe("list");
    expect(parseViewMode(new URLSearchParams({ view: "nonsense" }))).toBe("map");
  });
});

describe("propertyFiltersToQuery", () => {
  it("omits defaults so a clean view has a clean URL", () => {
    expect(propertyFiltersToQuery(defaultFilters, "map")).toBe("");
  });

  it("serialises only what differs, and never the text query", () => {
    const query = propertyFiltersToQuery(
      filters({ status: "sold", beds: "3", query: "secret" }),
      "list",
    );

    expect(query).toBe("status=sold&beds=3&view=list");
  });

  it("round-trips through the parser", () => {
    const original = filters({ status: "completed", suburb: "Craigieburn" });
    const parsed = parsePropertyFilters(
      new URLSearchParams(propertyFiltersToQuery(original, "map")),
      ["Craigieburn"],
    );

    expect(parsed).toEqual(original);
  });
});

describe("hasActiveFilters", () => {
  it("is false only for the default view", () => {
    expect(hasActiveFilters(defaultFilters)).toBe(false);
    expect(hasActiveFilters(filters({ beds: "3" }))).toBe(true);
    expect(hasActiveFilters(filters({ query: "  " }))).toBe(false);
    expect(hasActiveFilters(filters({ query: "mick" }))).toBe(true);
  });
});
