import { describe, expect, it } from "vitest";

import {
  breadcrumbSchema,
  organisationSchema,
  residenceSchema,
  serialiseJsonLd,
} from "@/lib/seo/structured-data";
import type { Property } from "@/types";

/**
 * The guarantee under test: structured data claims nothing the page does not
 * show, and never republishes a private coordinate.
 *
 * A rating with no reviews, a price parsed out of marketing copy, or a
 * coordinate for a property whose privacy setting hides it are all
 * misrepresentation — the fact that only machines read it does not change that.
 */

const property = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "single-storey-concept",
  name: "Single storey concept",
  summary: "Single level, north-facing living.",
  suburb: "Mickleham",
  state: "VIC",
  status: "under-construction",
  bedrooms: 4,
  bathrooms: 2,
  carSpaces: 2,
  landSize: 448,
  houseSize: 232,
  isFeatured: true,
  priceDisplay: "From $780,000",
  location: {
    visibility: "exact",
    publicLatitude: -37.53,
    publicLongitude: 144.9,
    publicAddress: "10 Example Street, Mickleham VIC",
    markerMode: "automatic",
    allowDirections: true,
  },
} as unknown as Property;

const CONTACT = {
  companyName: "Dreame",
  contactEmail: "hello@example.com",
  contactPhone: "+61 3 9000 0000",
  addressDisplay: "1 Example Street, Mickleham VIC 3064",
  social: { instagram: "https://instagram.com/example" },
};

/** Anything a schema must never contain. */
function expectNoInventedClaims(json: string) {
  for (const forbidden of [
    "aggregateRating",
    "ratingValue",
    "reviewCount",
    "review",
    "offers",
    "price",
    "priceCurrency",
    "availability",
    "datePosted",
    "award",
    "numberOfEmployees",
    "foundingDate",
  ]) {
    expect(json, forbidden).not.toContain(forbidden);
  }
}

describe("organisationSchema", () => {
  it("describes the business without inventing credentials", () => {
    const json = JSON.stringify(organisationSchema(CONTACT));

    expect(json).toContain("HomeAndConstructionBusiness");
    expect(json).toContain("Dreame");
    expectNoInventedClaims(json);
  });

  it("lists only the confirmed service areas", () => {
    const schema = organisationSchema(CONTACT) as {
      areaServed: Array<{ name: string }>;
    };

    // The same three suburbs the locations section publishes.
    expect(schema.areaServed.map((place) => place.name)).toEqual([
      "Mickleham, Victoria, Australia",
      "Craigieburn, Victoria, Australia",
      "Donnybrook, Victoria, Australia",
    ]);
  });

  it("omits sameAs entirely when no social profile is configured", () => {
    const schema = organisationSchema({ ...CONTACT, social: {} });

    expect(schema).not.toHaveProperty("sameAs");
  });

  it("omits the address when the business has not published one", () => {
    const schema = organisationSchema({
      ...CONTACT,
      addressDisplay: undefined,
    });

    expect(schema).not.toHaveProperty("address");
  });
});

describe("residenceSchema", () => {
  it("uses a residence type rather than a product", () => {
    // Product invites price and rating fields that must stay empty.
    expect(residenceSchema(property)["@type"]).toBe("SingleFamilyResidence");
  });

  it("never publishes a coordinate, even when the property has a public one", () => {
    // The property above is `exact` visibility with a public coordinate, and it
    // still must not appear here: a scraped JSON-LD geo block would republish the
    // privacy decision in the most machine-readable form available.
    const json = JSON.stringify(residenceSchema(property));

    expect(json).not.toContain("geo");
    expect(json).not.toContain("latitude");
    expect(json).not.toContain("longitude");
    expect(json).not.toContain("-37.53");
    expect(json).not.toContain("144.9");
  });

  it("publishes the suburb, which is always public", () => {
    const schema = residenceSchema(property) as {
      address: Record<string, string>;
    };

    expect(schema.address.addressLocality).toBe("Mickleham");
    expect(schema.address.addressRegion).toBe("VIC");
    // And not the street address, which the privacy pipeline governs.
    expect(schema.address).not.toHaveProperty("streetAddress");
  });

  it("never turns a price display string into an offer", () => {
    // "From $780,000" is marketing copy. `offers` needs a number and a
    // currency, and inventing them would state a commitment nobody made.
    const json = JSON.stringify(residenceSchema(property));

    expectNoInventedClaims(json);
    expect(json).not.toContain("780");
  });

  it("emits measurements with units when they exist", () => {
    const schema = residenceSchema(property) as Record<string, { value: number; unitCode: string }>;

    expect(schema.lotSize).toMatchObject({ value: 448, unitCode: "MTK" });
    expect(schema.floorSize).toMatchObject({ value: 232, unitCode: "MTK" });
  });

  it("omits a measurement rather than defaulting it to zero", () => {
    const schema = residenceSchema({
      ...property,
      houseSize: undefined,
    } as unknown as Property);

    expect(schema).not.toHaveProperty("floorSize");
  });

  it("states the build status using the label the page shows", () => {
    const schema = residenceSchema(property) as {
      additionalProperty: Array<{ name: string; value: string }>;
    };

    expect(schema.additionalProperty[0]).toMatchObject({
      name: "Build status",
      value: "Under construction",
    });
  });

  it("references the organisation rather than repeating it", () => {
    const schema = residenceSchema(property) as { provider: { "@id": string } };

    expect(schema.provider["@id"]).toContain("#organisation");
  });
});

describe("breadcrumbSchema", () => {
  it("describes the trail the page actually shows", () => {
    const schema = breadcrumbSchema(property) as {
      itemListElement: Array<{ position: number; name: string; item: string }>;
    };

    expect(schema.itemListElement.map((item) => item.name)).toEqual([
      "Home",
      "Homes",
      "Single storey concept",
    ]);
    expect(schema.itemListElement.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(schema.itemListElement[2].item).toContain(
      "/properties/single-storey-concept",
    );
  });
});

describe("serialiseJsonLd", () => {
  it("escapes < so a description cannot close the script tag", () => {
    // A property description is administrator input. An unescaped `</script>`
    // would end the tag and turn the rest of the payload into live markup.
    const output = serialiseJsonLd({
      name: "</script><img src=x onerror=alert(1)>",
    });

    expect(output).not.toContain("</script>");
    expect(output).not.toContain("<img");
    expect(output).toContain("\\u003c");
  });

  it("still produces valid JSON", () => {
    const output = serialiseJsonLd({ name: "A <b>home</b>" });

    expect(JSON.parse(output)).toEqual({ name: "A <b>home</b>" });
  });
});
