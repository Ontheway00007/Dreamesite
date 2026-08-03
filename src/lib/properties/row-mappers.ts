import type {
  DescriptionBlockRow,
  PropertiesRow,
  PropertyImagesRow,
  PropertyJoinedRow,
  PropertyPublicLocationsRow,
  PropertyResourcesRow,
  PropertyTestimonialsRow,
} from "@/types/database";
import type {
  ArchitecturalVariant,
  Property,
  PropertyDescription,
  PropertyDocument,
  PropertyParagraph,
  PropertyTestimonial,
  PropertyVisual,
  PublicPropertyLocation,
} from "@/types";

/**
 * Row → domain mapping. A database row is trusted as much as the local
 * fixture would be if it were hand-edited — which is not very much. Any value
 * that falls short of the shape the UI relies on is coerced away from a crash
 * and into the safest interpretation: no marker, no directions.
 *
 * Keeping this in a pure function means tests can drive malformed rows
 * through it without touching Supabase.
 */

/** Architectural drawing to render while a property has no photography yet. */
const DEFAULT_PLACEHOLDER: ArchitecturalVariant = "single-storey";

function placeholderFor(row: PropertiesRow): ArchitecturalVariant {
  if (row.description_source !== null || row.slug.includes("townhouse")) {
    return "townhouse";
  }
  if (row.slug.includes("double") || row.slug.includes("two-storey")) {
    return "double-storey";
  }
  return DEFAULT_PLACEHOLDER;
}

/** True for any finite value, the minimum the UI can safely consume. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Sorts by the stable ordering columns PostgREST cannot always guarantee. */
function bySortOrder<T extends { sort_order: number }>(a: T, b: T): number {
  return a.sort_order - b.sort_order;
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export function mapLocationRow(
  row: PropertyPublicLocationsRow | undefined | null,
): PublicPropertyLocation {
  if (!row) {
    // No projection row: nothing may be shown about the location. Absolute
    // safest interpretation — hidden, no directions.
    return {
      visibility: "hidden",
      publicLatitude: undefined,
      publicLongitude: undefined,
      markerMode: "automatic",
      address: null,
      allowDirections: false,
      label: "Location available on enquiry",
      accuracyNote:
        "We share the location of this home directly with buyers who enquire.",
    };
  }

  const hasCoordinates =
    typeof row.public_latitude === "number" &&
    Number.isFinite(row.public_latitude) &&
    Math.abs(row.public_latitude) <= 90 &&
    typeof row.public_longitude === "number" &&
    Number.isFinite(row.public_longitude) &&
    Math.abs(row.public_longitude) <= 180;

  return {
    visibility: row.location_visibility,
    publicLatitude: hasCoordinates ? row.public_latitude! : undefined,
    publicLongitude: hasCoordinates ? row.public_longitude! : undefined,
    markerMode: row.marker_mode,
    address: row.public_address,
    // Directions without a coordinate cannot be offered, whatever the row says.
    allowDirections: row.allow_directions && hasCoordinates,
    label: row.location_label,
    accuracyNote: row.accuracy_note,
  };
}

// ---------------------------------------------------------------------------
// Individual child rows
// ---------------------------------------------------------------------------

function mapDescription(
  blocks: DescriptionBlockRow[] | null,
  source: PropertiesRow["description_source"],
): PropertyDescription | undefined {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return undefined;
  }

  const paragraphs: PropertyParagraph[] = blocks.map((block) => ({
    id: block.id,
    text: block.text,
  }));

  return { paragraphs, source: source ?? "written" };
}

function mapVisual(image: PropertyImagesRow): PropertyVisual | null {
  const kind =
    image.image_type === "floor_plan"
      ? "floorplan"
      : image.image_type === "drone"
        ? "drone-video"
        : "photo";

  // A renderable visual needs somewhere to fetch the image from.
  if (kind === "photo" || kind === "floorplan") {
    if (!image.storage_path && !image.external_url) {
      return null;
    }
  } else if (!image.external_url) {
    return null;
  }

  return {
    id: image.id,
    kind,
    path: image.storage_path ?? undefined,
    externalUrl: image.external_url ?? undefined,
    caption: image.caption ?? undefined,
  };
}

function mapResource(resource: PropertyResourcesRow): PropertyVisual | null {
  if (!resource.url) {
    return null;
  }

  const kind =
    resource.resource_type === "virtual-tour"
      ? "virtual-tour"
      : resource.resource_type === "drone-footage"
        ? "drone-video"
        : null;

  if (!kind) {
    return null;
  }

  return {
    id: resource.id,
    kind,
    externalUrl: resource.url,
    caption: resource.title,
  };
}

function mapDocument(resource: PropertyResourcesRow): PropertyDocument | null {
  const kind =
    resource.resource_type === "floor-plan"
      ? "floorplan"
      : resource.resource_type === "brochure"
        ? "brochure"
        : resource.resource_type === "document"
          ? "specification"
          : null;

  if (!kind) {
    return null;
  }

  // Exactly one source. The caller (`propertyDocuments` in media.ts) resolves
  // it — no fake storage path is ever passed downstream.
  if (resource.storage_path) {
    return {
      id: resource.id,
      kind,
      label: resource.title,
      path: resource.storage_path,
      fileSizeLabel: undefined,
    };
  }

  if (resource.url) {
    return {
      id: resource.id,
      kind,
      label: resource.title,
      path: resource.url,
      fileSizeLabel: undefined,
    };
  }

  return null;
}

function mapTestimonial(
  testimonial: PropertyTestimonialsRow,
): PropertyTestimonial {
  return {
    id: testimonial.id,
    quote: testimonial.quote,
    attribution: testimonial.attribution,
    year: testimonial.attribution_role ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Full row → public Property
// ---------------------------------------------------------------------------

/**
 * Rows the page never gets to see are filtered out here rather than in the
 * components, keeping the "a missing section renders nothing" guarantee on
 * this side of the boundary.
 */
export function mapPropertyRow(row: PropertyJoinedRow): Property {
  const locationRows = row.property_public_locations ?? [];
  const visualRows = row.property_images ?? [];
  const resourceRows = row.property_resources ?? [];
  const testimonialRows = row.property_testimonials ?? [];

  const heroImage = visualRows.find(
    (image) => image.image_type === "hero" && image.storage_path,
  );

  const visuals = visualRows
    .map(mapVisual)
    .filter((visual): visual is PropertyVisual => visual !== null);

  const mappedResources = resourceRows
    .slice()
    .sort(bySortOrder)
    .map(mapResource)
    .filter((resource): resource is PropertyVisual => resource !== null);

  if (mappedResources.length > 0) {
    visuals.push(...mappedResources);
  }

  const documents = resourceRows
    .slice()
    .sort(bySortOrder)
    .map(mapDocument)
    .filter((document): document is PropertyDocument => document !== null);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    description: mapDescription(row.description_blocks, row.description_source),
    suburb: row.suburb,
    state: row.state,
    status: row.status,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    carSpaces: row.car_spaces,
    landSize: row.land_size_sqm,
    houseSize: isFiniteNumber(row.house_size_sqm)
      ? row.house_size_sqm
      : undefined,
    imagePath: heroImage?.storage_path ?? undefined,
    placeholderVariant: placeholderFor(row),
    completionLabel: row.completion_label ?? undefined,
    priceDisplay: row.price_display ?? undefined,
    isFeatured: row.is_featured,
    visuals: visuals.length > 0 ? visuals : undefined,
    documents: documents.length > 0 ? documents : undefined,
    testimonials:
      testimonialRows.length > 0 ? testimonialRows.map(mapTestimonial) : undefined,
    displayHome: row.display_is_home
      ? {
          isDisplayHome: true,
          openingNote: row.display_opening_note ?? undefined,
        }
      : undefined,
    currentStageId: row.current_stage_id ?? undefined,
    location: mapLocationRow(locationRows[0]),
  };
}
