import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { propertyDocuments, galleryVisuals } from "@/lib/properties/media";
import type { Property } from "@/types";

/**
 * Media resolution guarantees.
 *
 * The rule these protect: a storage path and an external URL are different
 * things and must never be confused. A storage path needs the bucket URL
 * prepended; an external URL is already complete. Passing the second through
 * the builder for the first produces a dead link into our own bucket.
 */

const PROJECT_URL = "https://demo.supabase.co";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT_URL;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: "p1",
    slug: "test-home",
    name: "Test home",
    summary: "A test.",
    suburb: "Mickleham",
    state: "VIC",
    status: "move-in-ready",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 400,
    placeholderVariant: "single-storey",
    isFeatured: false,
    location: {
      visibility: "hidden",
      markerMode: "automatic",
      address: null,
      allowDirections: false,
      label: null,
      accuracyNote: null,
    },
    ...overrides,
  };
}

describe("propertyDocuments", () => {
  it("prepends the bucket URL to a stored document", () => {
    const [document] = propertyDocuments(
      property({
        documents: [
          {
            id: "d1",
            kind: "brochure",
            label: "Brochure",
            source: { kind: "storage", path: "properties/p1/documents/abc.pdf" },
          },
        ],
      }),
    );

    expect(document.url).toBe(
      `${PROJECT_URL}/storage/v1/object/public/property-media/properties/p1/documents/abc.pdf`,
    );
  });

  it("returns an external document URL untouched", () => {
    // The bug this guards against: an external URL routed through the storage
    // URL builder became
    //   https://<project>/storage/v1/object/public/property-media/https%3A/files.example.com/brochure.pdf
    // — a 404 inside our own bucket, presented to visitors as a download link.
    const externalUrl = "https://files.example.com/brochure.pdf";

    const [document] = propertyDocuments(
      property({
        documents: [
          {
            id: "d1",
            kind: "brochure",
            label: "Brochure",
            source: { kind: "external", url: externalUrl },
          },
        ],
      }),
    );

    expect(document.url).toBe(externalUrl);
    expect(document.url).not.toContain("storage/v1");
    expect(document.url).not.toContain("%3A");
  });

  it("omits a document whose stored file cannot be resolved", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(
      propertyDocuments(
        property({
          documents: [
            {
              id: "d1",
              kind: "brochure",
              label: "Brochure",
              source: { kind: "storage", path: "properties/p1/documents/a.pdf" },
            },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("galleryVisuals", () => {
  it("falls back to the architectural drawing when there is no photography", () => {
    const [visual] = galleryVisuals(property());

    expect(visual.url).toBeNull();
    expect(visual.placeholderVariant).toBe("single-storey");
  });

  it("resolves a stored photograph", () => {
    const [visual] = galleryVisuals(
      property({
        visuals: [
          {
            id: "i1",
            kind: "photo",
            source: { kind: "storage", path: "properties/p1/gallery/a.jpg" },
          },
        ],
      }),
    );

    expect(visual.url).toBe(
      `${PROJECT_URL}/storage/v1/object/public/property-media/properties/p1/gallery/a.jpg`,
    );
  });

  it("resolves an externally hosted photograph without rewriting it", () => {
    const externalUrl = "https://images.example.com/facade.jpg";

    const [visual] = galleryVisuals(
      property({
        visuals: [
          { id: "i1", kind: "photo", source: { kind: "external", url: externalUrl } },
        ],
      }),
    );

    expect(visual.url).toBe(externalUrl);
    expect(visual.url).not.toContain("storage/v1");
  });

  it("keeps floor plans out of the photography gallery", () => {
    // A floor plan among the photographs reads as a mistake, and the gallery
    // arrows then move between a photograph and a diagram.
    const visuals = galleryVisuals(
      property({
        visuals: [
          {
            id: "i1",
            kind: "photo",
            source: { kind: "storage", path: "properties/p1/gallery/a.jpg" },
          },
          {
            id: "i2",
            kind: "floorplan",
            source: { kind: "storage", path: "properties/p1/floor-plans/b.jpg" },
          },
        ],
      }),
    );

    expect(visuals.map((visual) => visual.id)).toEqual(["i1"]);
  });

  it("carries per-image alt text through to the renderer", () => {
    const [visual] = galleryVisuals(
      property({
        visuals: [
          {
            id: "i1",
            kind: "photo",
            altText: "North-facing living area opening to the courtyard",
            source: { kind: "storage", path: "properties/p1/gallery/a.jpg" },
          },
        ],
      }),
    );

    expect(visual.altText).toBe(
      "North-facing living area opening to the courtyard",
    );
  });
});
