import { describe, expect, it } from "vitest";

import { propertyRecords } from "@/content/properties";
import { getSuburbReference } from "@/content/suburb-references";
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

  it("only uses confirmed build areas", async () => {
    for (const property of await getProperties()) {
      expect(serviceAreas).toContain(property.suburb);
    }
  });

  it("gives every property a resolved public location", async () => {
    for (const property of await getProperties()) {
      expect(property.location.visibility).toBeDefined();
      expect(property.location).toHaveProperty("allowDirections");
    }
  });
});

/**
 * The guarantee that matters: whatever the demonstration data says, nothing the
 * repository returns may carry a stored position or the settings that produced
 * the published one.
 */
describe("published properties never carry private data", () => {
  it("omits private fields from every property", async () => {
    for (const property of await getProperties()) {
      const keys = Object.keys(property);

      expect(keys).not.toContain("privateLatitude");
      expect(keys).not.toContain("privateLongitude");
      expect(keys).not.toContain("privacy");
      expect(keys).not.toContain("address");
    }
  });

  it("never serialises a stored coordinate that should have been reduced", async () => {
    const serialised = JSON.stringify(await getProperties());

    for (const stored of propertyRecords) {
      if (stored.privacy.locationVisibility === "exact") {
        continue;
      }

      expect(serialised).not.toContain(String(stored.privateLatitude));
      expect(serialised).not.toContain(String(stored.privateLongitude));
    }
  });

  it("publishes no coordinates for hidden properties", async () => {
    const hidden = (await getProperties()).filter(
      (property) => property.location.visibility === "hidden",
    );

    expect(hidden.length).toBeGreaterThan(0);
    for (const property of hidden) {
      expect(isMappable(property)).toBe(false);
      expect(property.location.label).toBe("Location available on enquiry");
    }
  });

  it("publishes suburb centres for suburb-only properties", async () => {
    const suburbOnly = (await getProperties()).filter(
      (property) => property.location.visibility === "suburb",
    );

    expect(suburbOnly.length).toBeGreaterThan(0);
    for (const property of suburbOnly) {
      const reference = getSuburbReference(property.suburb);

      expect(property.location.publicLatitude).toBe(reference?.latitude);
      expect(property.location.publicLongitude).toBe(reference?.longitude);
    }
  });

  it("covers all four visibility modes in the demonstration data", async () => {
    const modes = new Set(
      (await getProperties()).map((property) => property.location.visibility),
    );

    expect([...modes].sort()).toEqual([
      "approximate",
      "exact",
      "hidden",
      "suburb",
    ]);
  });

  it("shows privacy is independent of status", async () => {
    const properties = await getProperties();
    const soldExact = properties.find(
      (property) =>
        property.status === "sold" && property.location.visibility === "exact",
    );
    const completedHidden = properties.find(
      (property) =>
        property.status === "completed" &&
        property.location.visibility === "hidden",
    );

    expect(soldExact).toBeDefined();
    expect(completedHidden).toBeDefined();
  });
});

describe("getFeaturedProperties", () => {
  it("returns only the flagged properties", async () => {
    const featured = await getFeaturedProperties();

    expect(featured.length).toBeGreaterThan(0);
    expect(featured.every((property) => property.isFeatured)).toBe(true);
  });
});
