import { describe, expect, it } from "vitest";

import { propertyRecords } from "@/content/properties";
import { isMappable } from "@/lib/properties/privacy";
import {
  getFeaturedProperties,
  getProperties,
  getPropertyBySlug,
  getPropertySlugs,
} from "@/lib/properties/repository";
import { serviceAreas } from "@/lib/site-config";

describe("getPropertyBySlug", () => {
  it("finds a property by its slug", async () => {
    const property = await getPropertyBySlug("single-storey-concept");

    expect(property?.name).toBe("Single storey concept");
  });

  it("returns null for an unknown slug", async () => {
    expect(await getPropertyBySlug("does-not-exist")).toBeNull();
    expect(await getPropertyBySlug("")).toBeNull();
  });
});

describe("getPropertySlugs", () => {
  it("returns a unique slug for every record", async () => {
    const slugs = await getPropertySlugs();

    expect(slugs).toHaveLength(propertyRecords.length);
    expect(new Set(slugs).size).toBe(propertyRecords.length);
  });
});

describe("getProperties", () => {
  it("publishes every record", async () => {
    expect(await getProperties()).toHaveLength(propertyRecords.length);
  });

  it("never publishes an exact position for an occupied home", async () => {
    const properties = await getProperties();
    const occupied = properties.filter(
      (property) => property.status === "sold" || property.status === "completed",
    );

    expect(occupied.length).toBeGreaterThan(0);
    for (const property of occupied) {
      expect(property.locationPrecision).not.toBe("exact");
    }
  });

  it("never publishes coordinates for a private location", async () => {
    const properties = await getProperties();
    const priv = properties.filter(
      (property) => property.locationPrecision === "private",
    );

    expect(priv.length).toBeGreaterThan(0);
    for (const property of priv) {
      expect(isMappable(property)).toBe(false);
    }
  });

  it("only uses confirmed build areas", async () => {
    const properties = await getProperties();

    for (const property of properties) {
      expect(serviceAreas).toContain(property.suburb);
    }
  });
});

describe("getFeaturedProperties", () => {
  it("returns only the flagged properties", async () => {
    const featured = await getFeaturedProperties();

    expect(featured.length).toBeGreaterThan(0);
    expect(featured.every((property) => property.isFeatured)).toBe(true);
  });
});
