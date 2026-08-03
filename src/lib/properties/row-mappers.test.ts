import { describe, expect, it } from "vitest";

import { mapLocationRow, mapPropertyRow } from "@/lib/properties/row-mappers";
import type { PropertyJoinedRow } from "@/types/database";
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
    property_public_locations: null,
    property_images: null,
    property_resources: null,
    property_testimonials: null,
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
          {
            id: "i1",
            property_id: "p1",
            image_type: "hero",
            storage_path: "hero/facade.jpg",
            external_url: null,
            alt_text: "Hero",
            caption: "Hero shot",
            sort_order: 0,
            is_published: true,
            created_at: "2026-08-03T00:00:00Z",
            updated_at: "2026-08-03T00:00:00Z",
          },
          {
            id: "i2",
            property_id: "p1",
            image_type: "floor_plan",
            storage_path: "floor/plan.png",
            external_url: null,
            alt_text:
              "Floor plan showing three bedrooms, two bathrooms and a garage",
            caption: null,
            sort_order: 1,
            is_published: true,
            created_at: "2026-08-03T00:00:00Z",
            updated_at: "2026-08-03T00:00:00Z",
          },
        ],
        property_resources: [
          {
            id: "r1",
            property_id: "p1",
            resource_type: "virtual-tour",
            title: "Take the tour",
            url: "https://tour.example",
            storage_path: null,
            sort_order: 0,
            is_published: true,
            created_at: "2026-08-03T00:00:00Z",
            updated_at: "2026-08-03T00:00:00Z",
          },
          {
            id: "r2",
            property_id: "p1",
            resource_type: "brochure",
            title: "Download the brochure",
            url: "https://files.example/brochure.pdf",
            storage_path: "brochures/b.pdf",
            sort_order: 1,
            is_published: true,
            created_at: "2026-08-03T00:00:00Z",
            updated_at: "2026-08-03T00:00:00Z",
          },
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
          },
        ],
      }),
    );

    expect(property.imagePath).toBe("hero/facade.jpg");
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
          {
            id: "r1",
            property_id: "p1",
            resource_type: "brochure",
            title: "Broken brochure",
            url: null,
            storage_path: null,
            sort_order: 0,
            is_published: true,
            created_at: "2026-08-03T00:00:00Z",
            updated_at: "2026-08-03T00:00:00Z",
          },
        ],
      }),
    );

    expect(property.documents).toBeUndefined();
  });
});
