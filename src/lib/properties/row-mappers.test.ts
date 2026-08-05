import { describe, expect, it } from "vitest";

import { mapLocationRow, mapPropertyRow } from "@/lib/properties/row-mappers";
import type {
  PropertyImagesRow,
  PropertyJoinedRow,
  PropertyResourcesRow,
} from "@/types/database";
import type { Property } from "@/types";

describe("mapLocationRow", () => {
  it("returns hidden when the row is missing", () => {
    const location = mapLocationRow(null);

    expect(location.visibility).toBe("hidden");
    expect(location.allowDirections).toBe(false);
    expect(location.publicLatitude).toBeUndefined();
    expect(location.publicLongitude).toBeUndefined();
    expect(location.label).toBe("Location available on enquiry");
  });

  it("passes through a valid coordinate row", () => {
    const location = mapLocationRow({
      property_id: "p1",
      location_visibility: "exact",
      public_latitude: -37.5,
      public_longitude: 144.9,
      public_address: null,
      marker_mode: "automatic",
      location_label: null,
      accuracy_note: null,
      allow_directions: true,
      generated_at: "2026-08-03T00:00:00Z",
      stale_since: null,
    });

    expect(location.visibility).toBe("exact");
    expect(location.publicLatitude).toBe(-37.5);
    expect(location.publicLongitude).toBe(144.9);
    expect(location.allowDirections).toBe(true);
  });

  it("blocks directions for a coordinate-less row", () => {
    const location = mapLocationRow({
      property_id: "p1",
      location_visibility: "hidden",
      public_latitude: null,
      public_longitude: null,
      public_address: null,
      marker_mode: "automatic",
      location_label: "Location available on enquiry",
      accuracy_note: null,
      allow_directions: true, // storage bug — directions must be off
      generated_at: "2026-08-03T00:00:00Z",
      stale_since: null,
    });

    expect(location.allowDirections).toBe(false);
    expect(location.publicLatitude).toBeUndefined();
  });

  it("rejects out-of-range coordinates", () => {
    const location = mapLocationRow({
      property_id: "p1",
      location_visibility: "exact",
      public_latitude: 91, // invalid
      public_longitude: 144.9,
      public_address: null,
      marker_mode: "automatic",
      location_label: null,
      accuracy_note: null,
      allow_directions: true,
      generated_at: "2026-08-03T00:00:00Z",
      stale_since: null,
    });

    expect(location.publicLatitude).toBeUndefined();
    expect(location.allowDirections).toBe(false);
  });
});

function propertyRow(overrides: Partial<PropertyJoinedRow> = {}): PropertyJoinedRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "test-home",
    name: "Test home",
    summary: "A test.",
    description_blocks: null,
    description_source: null,
    status: "move-in-ready",
    suburb: "Mickleham",
    state: "VIC",
    bedrooms: 4,
    bathrooms: 2,
    car_spaces: 2,
    land_size_sqm: 400,
    house_size_sqm: null,
    price_display: null,
    completion_label: null,
    is_featured: false,
    is_published: true,
    display_priority: 0,
    display_is_home: false,
    display_opening_note: null,
    current_stage_id: null,
    created_at: "2026-08-03T00:00:00Z",
    updated_at: "2026-08-03T00:00:00Z",
    seo_meta_title: null,
    seo_meta_description: null,
    seo_og_image_id: null,
    seo_canonical_url: null,
    seo_noindex: false,
    property_public_locations: null,
    property_images: null,
    property_resources: null,
    property_testimonials: null,
    construction_updates: null,
    property_features: null,
    ...overrides,
  };
}

/**
 * Row factories.
 *
 * Media rows carry a dozen columns, most of them irrelevant to any one
 * assertion. These fill the defaults so each test states only what it is
 * actually about, and so a new column added to the schema is a change here
 * rather than in every fixture.
 */
function imageRow(
  overrides: Partial<PropertyImagesRow> & { id: string },
): PropertyImagesRow {
  return {
    property_id: "p1",
    image_type: "gallery",
    storage_path: null,
    external_url: null,
    alt_text: null,
    caption: null,
    sort_order: 0,
    is_published: true,
    original_filename: null,
    mime_type: null,
    width: null,
    height: null,
    file_size_bytes: null,
    created_at: "2026-08-03T00:00:00Z",
    updated_at: "2026-08-03T00:00:00Z",
    ...overrides,
  };
}

function resourceRow(
  overrides: Partial<PropertyResourcesRow> & { id: string },
): PropertyResourcesRow {
  return {
    property_id: "p1",
    resource_type: "document",
    title: "Untitled",
    url: null,
    storage_path: null,
    sort_order: 0,
    is_published: true,
    caption: null,
    original_filename: null,
    mime_type: null,
    file_size_bytes: null,
    created_at: "2026-08-03T00:00:00Z",
    updated_at: "2026-08-03T00:00:00Z",
    ...overrides,
  };
}

describe("mapPropertyRow", () => {
  it("covers the minimum public contract", () => {
    const property: Property = mapPropertyRow(propertyRow());

    expect(property.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(property.slug).toBe("test-home");
    expect(property.location.visibility).toBe("hidden");
    expect(property.bedrooms).toBe(4);
    expect(property.houseSize).toBeUndefined();
  });

  it("maps images, resources, testimonials and documents", () => {
    const property = mapPropertyRow(
      propertyRow({
        property_images: [
          imageRow({
            id: "i1",
            image_type: "hero",
            storage_path: "hero/facade.jpg",
            alt_text: "Hero",
            caption: "Hero shot",
            sort_order: 0,
          }),
          imageRow({
            id: "i2",
            image_type: "floor_plan",
            storage_path: "floor/plan.png",
            alt_text:
              "Floor plan showing three bedrooms, two bathrooms and a garage",
            sort_order: 1,
          }),
        ],
        property_resources: [
          resourceRow({
            id: "r1",
            resource_type: "virtual-tour",
            title: "Take the tour",
            url: "https://tour.example",
            sort_order: 0,
          }),
          resourceRow({
            id: "r2",
            resource_type: "brochure",
            title: "Download the brochure",
            storage_path: "brochures/b.pdf",
            sort_order: 1,
          }),
        ],
        property_testimonials: [
          {
            id: "t1",
            property_id: "p1",
            quote: "We love it.",
            attribution: "J., Mickleham",
            attribution_role: "Owner",
            sort_order: 0,
            is_published: true,
            created_at: "2026-08-03T00:00:00Z",
            updated_at: "2026-08-03T00:00:00Z",
          },
        ],
        property_public_locations: [
          {
            property_id: "p1",
            location_visibility: "exact",
            public_latitude: -37.5,
            public_longitude: 144.9,
            public_address: null,
            marker_mode: "automatic",
            location_label: null,
            accuracy_note: null,
            allow_directions: true,
            generated_at: "2026-08-03T00:00:00Z",
            stale_since: null,
          },
        ],
      }),
    );

    expect(property.heroImage?.source).toEqual({
      kind: "storage",
      path: "hero/facade.jpg",
    });
    expect(property.visuals?.map((v) => v.kind)).toEqual([
      "photo",
      "floorplan",
      "virtual-tour",
    ]);
    expect(property.documents?.map((d) => d.kind)).toEqual(["brochure"]);
    expect(property.testimonials).toHaveLength(1);
    expect(property.location.publicLatitude).toBe(-37.5);
  });

  it("returns undefined collections when relations are missing", () => {
    const property = mapPropertyRow(propertyRow());

    expect(property.description).toBeUndefined();
    expect(property.visuals).toBeUndefined();
    expect(property.documents).toBeUndefined();
    expect(property.testimonials).toBeUndefined();
    expect(property.displayHome).toBeUndefined();
  });

  it("normalises description blocks into stable keyed paragraphs", () => {
    const property = mapPropertyRow(
      propertyRow({
        description_blocks: [
          { id: "para-1", text: "First." },
          { id: "para-2", text: "Second." },
        ],
        description_source: "written",
      }),
    );

    expect(property.description?.source).toBe("written");
    expect(property.description?.paragraphs[0].id).toBe("para-1");
    expect(property.description?.paragraphs[0].text).toBe("First.");
    expect(property.description?.paragraphs[1].id).toBe("para-2");
  });

  it("omits a document that has neither a storage path nor a URL", () => {
    const property = mapPropertyRow(
      propertyRow({
        property_resources: [
          resourceRow({
            id: "r1",
            resource_type: "brochure",
            title: "Broken brochure",
          }),
        ],
      }),
    );

    expect(property.documents).toBeUndefined();
  });

  /* --- Media discipline ------------------------------------------------ */

  it("keeps an external document source external", () => {
    // The bug this guards: an external URL written into the storage-path
    // field, then resolved through the bucket URL builder, producing a dead
    // link inside our own bucket and offering it to visitors as a download.
    const property = mapPropertyRow(
      propertyRow({
        property_resources: [
          resourceRow({
            id: "r1",
            resource_type: "brochure",
            title: "Hosted elsewhere",
            url: "https://files.example.com/brochure.pdf",
          }),
        ],
      }),
    );

    expect(property.documents?.[0].source).toEqual({
      kind: "external",
      url: "https://files.example.com/brochure.pdf",
    });
  });

  it("treats a drone photograph as a photograph", () => {
    // `drone` in property_images is a still. Mapping it to a video kind and
    // then requiring an external URL discarded every uploaded drone image.
    const property = mapPropertyRow(
      propertyRow({
        property_images: [
          imageRow({
            id: "i1",
            image_type: "drone",
            storage_path: "properties/p1/drone/a.jpg",
          }),
        ],
      }),
    );

    expect(property.visuals).toHaveLength(1);
    expect(property.visuals?.[0].kind).toBe("photo");
    expect(property.visuals?.[0].category).toBe("drone");
  });

  it("carries per-image alt text into the domain model", () => {
    const property = mapPropertyRow(
      propertyRow({
        property_images: [
          imageRow({
            id: "i1",
            storage_path: "properties/p1/gallery/a.jpg",
            alt_text: "Kitchen island beneath a skylight",
          }),
        ],
      }),
    );

    expect(property.visuals?.[0].altText).toBe(
      "Kitchen island beneath a skylight",
    );
  });

  it("excludes unpublished media even when the query returned it", () => {
    // RLS is the real control. This asserts the mapper does not depend on it,
    // so a future authenticated caller cannot leak drafts into a public shape.
    const property = mapPropertyRow(
      propertyRow({
        property_images: [
          imageRow({
            id: "draft",
            storage_path: "properties/p1/gallery/draft.jpg",
            is_published: false,
          }),
          imageRow({
            id: "live",
            storage_path: "properties/p1/gallery/live.jpg",
            is_published: true,
          }),
        ],
        property_resources: [
          resourceRow({
            id: "draft-doc",
            resource_type: "brochure",
            title: "Draft brochure",
            storage_path: "properties/p1/documents/draft.pdf",
            is_published: false,
          }),
        ],
      }),
    );

    expect(property.visuals?.map((visual) => visual.id)).toEqual(["live"]);
    expect(property.documents).toBeUndefined();
  });

  it("ignores an unpublished hero rather than publishing it", () => {
    const property = mapPropertyRow(
      propertyRow({
        property_images: [
          imageRow({
            id: "hero",
            image_type: "hero",
            storage_path: "properties/p1/hero/a.jpg",
            is_published: false,
          }),
        ],
      }),
    );

    expect(property.heroImage).toBeUndefined();
  });

  it("accepts an externally hosted hero", () => {
    const property = mapPropertyRow(
      propertyRow({
        property_images: [
          imageRow({
            id: "hero",
            image_type: "hero",
            external_url: "https://images.example.com/hero.jpg",
          }),
        ],
      }),
    );

    expect(property.heroImage?.source).toEqual({
      kind: "external",
      url: "https://images.example.com/hero.jpg",
    });
  });

  it("normalises the legacy non-ASCII facade category", () => {
    const property = mapPropertyRow(
      propertyRow({
        property_images: [
          imageRow({
            id: "i1",
            image_type: "façade",
            storage_path: "properties/p1/facade/a.jpg",
          }),
        ],
      }),
    );

    expect(property.visuals?.[0].category).toBe("facade");
  });

  it("orders media by sort_order", () => {
    const property = mapPropertyRow(
      propertyRow({
        property_images: [
          imageRow({ id: "third", storage_path: "c.jpg", sort_order: 2 }),
          imageRow({ id: "first", storage_path: "a.jpg", sort_order: 0 }),
          imageRow({ id: "second", storage_path: "b.jpg", sort_order: 1 }),
        ],
      }),
    );

    expect(property.visuals?.map((visual) => visual.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("breaks a sort_order tie by id, so the order never shuffles between requests", () => {
    // Positions should be unique within a group — the reorder RPCs rewrite the
    // whole group and refuse a partial list — but a row inserted directly, or
    // data predating that rule, can tie. Without a tiebreaker the two come back
    // in whatever order PostgreSQL produces, and a gallery appears to shuffle
    // itself between page loads.
    const rows = [
      imageRow({ id: "ccc", storage_path: "c.jpg", sort_order: 1 }),
      imageRow({ id: "aaa", storage_path: "a.jpg", sort_order: 1 }),
      imageRow({ id: "bbb", storage_path: "b.jpg", sort_order: 1 }),
    ];

    const first = mapPropertyRow(propertyRow({ property_images: rows }));
    const reversed = mapPropertyRow(
      propertyRow({ property_images: [...rows].reverse() }),
    );

    expect(first.visuals?.map((visual) => visual.id)).toEqual([
      "aaa",
      "bbb",
      "ccc",
    ]);

    // Same rows in a different arrival order must produce the same result.
    expect(reversed.visuals?.map((visual) => visual.id)).toEqual(
      first.visuals?.map((visual) => visual.id),
    );
  });
});


/*
  PostgREST returns a to-one embed as an object, not a one-element array.

  `property_public_locations.property_id` is that table's primary key as well as
  its foreign key, so the API answers with `{...}` while every other embed
  answers with `[...]`. The mapper read `[0]` unconditionally, so on a real
  response the location was `undefined` and silently became "hidden": the map
  drew no marker and the property page showed no address, while the listing
  looked fine because its fields come from the parent row.

  These cases pin both shapes. The object case is what production actually
  sends; the array case is what the fixtures and the rest of this file build.
*/
describe("mapPropertyRow — location embed shape", () => {
  const location = {
    property_id: "00000000-0000-4000-8000-000000000001",
    location_visibility: "exact" as const,
    public_latitude: -37.5680688,
    public_longitude: 144.9058236,
    public_address: "1 Solitaire Way, Mickleham VIC 3064",
    marker_mode: "automatic" as const,
    location_label: null,
    accuracy_note: null,
    allow_directions: true,
    generated_at: "2026-08-05T00:00:00Z",
    stale_since: null,
  };

  it("reads a to-one embed returned as a bare object, as PostgREST sends it", () => {
    const property = mapPropertyRow(
      propertyRow({ property_public_locations: location }),
    );

    expect(property.location.visibility).toBe("exact");
    expect(property.location.publicLatitude).toBe(-37.5680688);
    expect(property.location.publicLongitude).toBe(144.9058236);
    expect(property.location.allowDirections).toBe(true);
  });

  it("still reads the array form, which the fixtures and tests build", () => {
    const property = mapPropertyRow(
      propertyRow({ property_public_locations: [location] }),
    );

    expect(property.location.visibility).toBe("exact");
    expect(property.location.publicLatitude).toBe(-37.5680688);
    expect(property.location.publicLongitude).toBe(144.9058236);
  });

  it("falls back to hidden when there is no location at all", () => {
    const property = mapPropertyRow(
      propertyRow({ property_public_locations: null }),
    );

    expect(property.location.visibility).toBe("hidden");
    expect(property.location.publicLatitude).toBeUndefined();
  });

  it("produces a mappable coordinate from the object form", async () => {
    const { isMappable } = await import("@/lib/properties/privacy");
    const { propertiesToGeoJson } = await import("@/lib/map/geojson");

    const property = mapPropertyRow(
      propertyRow({ property_public_locations: location }),
    );

    // The specific failure the bug caused: no marker could ever be drawn.
    expect(isMappable(property)).toBe(true);
    expect(propertiesToGeoJson([property]).features).toHaveLength(1);
    expect(propertiesToGeoJson([property]).features[0]?.geometry.coordinates).toEqual([
      144.9058236, -37.5680688,
    ]);
  });
});
