import { resolveMediaSource } from "@/lib/properties/media";
import type {
  ConstructionUpdatesRow,
  DescriptionBlockRow,
  PropertiesRow,
  PropertyFeaturesRow,
  PropertyImagesRow,
  PropertyJoinedRow,
  PropertyPublicLocationsRow,
  PropertyResourcesRow,
  PropertyTestimonialsRow,
} from "@/types/database";
import type {
  ArchitecturalVariant,
  ConstructionStageId,
  MediaSource,
  Property,
  PropertyConstructionUpdate,
  PropertyDescription,
  PropertyDocument,
  PropertyFeature,
  PropertyFeatureCategory,
  PropertyFeatureGroup,
  PropertyImageCategory,
  PropertyParagraph,
  PropertySeo,
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

/**
 * Determines the architectural placeholder variant for a property.
 *
 * This is a heuristic based on the property's slug and physical attributes.
 * It does NOT infer architecture from unrelated fields like `description_source`.
 * A future admin column (e.g. `building_type`) would make this explicit.
 */
function placeholderFor(row: PropertiesRow): ArchitecturalVariant {
  const slug = row.slug.toLowerCase();
  const name = (row.name ?? "").toLowerCase();

  // Explicit typology keywords in slug or name
  if (slug.includes("townhouse") || name.includes("townhouse")) {
    return "townhouse";
  }
  if (
    slug.includes("double-storey") ||
    slug.includes("two-storey") ||
    name.includes("double storey") ||
    name.includes("two storey")
  ) {
    return "double-storey";
  }

  // Compact land with relatively large house — likely a townhouse typology
  if (
    row.land_size_sqm > 0 &&
    row.land_size_sqm < 300 &&
    isFiniteNumber(row.house_size_sqm)
  ) {
    return "townhouse";
  }

  // Large house size relative to land suggests multiple levels
  if (
    isFiniteNumber(row.house_size_sqm) &&
    row.land_size_sqm > 0 &&
    row.house_size_sqm > row.land_size_sqm * 0.55
  ) {
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

/**
 * Builds a media source from a row's two mutually exclusive source columns.
 *
 * Returns null when neither is set. The `image_source_present` and
 * `resource_target_present` constraints make that unreachable through normal
 * writes, but a mapper that assumes its input is well-formed is a mapper that
 * throws on the one row that is not.
 */
function mapSource(
  storagePath: string | null,
  externalUrl: string | null,
): MediaSource | null {
  // Storage wins if somehow both are set. `property_images_single_source`
  // forbids that combination, so this is a tiebreak that should never fire.
  if (storagePath) {
    return { kind: "storage", path: storagePath };
  }

  if (externalUrl) {
    return { kind: "external", url: externalUrl };
  }

  return null;
}

/** Normalises the legacy non-ASCII category value migration 0009 replaced. */
function normaliseImageCategory(
  imageType: PropertyImagesRow["image_type"],
): PropertyImageCategory {
  return imageType === "façade" ? "facade" : (imageType as PropertyImageCategory);
}

function mapVisual(image: PropertyImagesRow): PropertyVisual | null {
  const source = mapSource(image.storage_path, image.external_url);

  if (!source) {
    return null;
  }

  const category = normaliseImageCategory(image.image_type);

  // Every row in property_images is a still. A drone *photograph* belongs
  // here; drone *footage* is a link and lives in property_resources. The
  // previous mapping sent `drone` to "drone-video" and then required an
  // external URL, which silently discarded every uploaded drone photograph.
  const kind: PropertyVisual["kind"] =
    category === "floor_plan" ? "floorplan" : "photo";

  return {
    id: image.id,
    kind,
    source,
    altText: image.alt_text ?? undefined,
    caption: image.caption ?? undefined,
    category,
  };
}

/**
 * External media: tours and video.
 *
 * Hosted documents are handled by `mapDocument`. A row is one or the other,
 * decided by `resource_type`, so neither function has to guess.
 */
function mapResource(resource: PropertyResourcesRow): PropertyVisual | null {
  const kind: PropertyVisual["kind"] | null =
    resource.resource_type === "virtual-tour"
      ? "virtual-tour"
      : resource.resource_type === "video" ||
          resource.resource_type === "drone-footage"
        ? "drone-video"
        : null;

  if (!kind) {
    return null;
  }

  // A tour or video is a link. A storage path here would mean the row was
  // written wrongly, and treating it as a link would produce a broken embed.
  if (!resource.url) {
    return null;
  }

  return {
    id: resource.id,
    kind,
    source: { kind: "external", url: resource.url },
    caption: resource.caption ?? resource.title,
  };
}

function mapDocument(resource: PropertyResourcesRow): PropertyDocument | null {
  const kind: PropertyDocument["kind"] | null =
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

  const source = mapSource(resource.storage_path, resource.url);

  if (!source) {
    return null;
  }

  return {
    id: resource.id,
    kind,
    label: resource.title,
    source,
    fileSizeLabel: isFiniteNumber(resource.file_size_bytes)
      ? formatBytes(resource.file_size_bytes)
      : undefined,
  };
}

/** Compact size label for a download link. */
function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  if (megabytes >= 1) {
    return `PDF · ${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
  }

  return `PDF · ${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Build-diary entries.
 *
 * The stage vocabulary is constrained by the database (migration 0010), so a
 * row's stage is always one of the known ids. The cast records that rather than
 * re-validating what the database already guarantees.
 */
function mapConstructionUpdate(
  row: ConstructionUpdatesRow,
): PropertyConstructionUpdate {
  return {
    id: row.id,
    stage: row.stage as ConstructionStageId,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    progressValue: isFiniteNumber(row.progress_value)
      ? row.progress_value
      : undefined,
    occurredAt: row.occurred_at ?? undefined,
  };
}

/**
 * Groups features by category, in the order the public page presents them.
 *
 * A category with no published features produces no group, so the page never
 * renders an empty heading. The order is fixed rather than data-driven: the
 * sections read in a deliberate sequence, and letting the data reorder them
 * would make two properties present differently for no reason.
 */
const FEATURE_GROUP_ORDER: ReadonlyArray<{
  category: PropertyFeatureCategory;
  heading: string;
}> = [
  { category: "highlight", heading: "Highlights" },
  { category: "inclusion", heading: "Inclusions" },
  { category: "specification", heading: "Specifications" },
  { category: "material", heading: "Materials and finishes" },
  { category: "energy", heading: "Energy and comfort" },
  { category: "design", heading: "Design" },
];

function mapFeatureGroups(
  rows: readonly PropertyFeaturesRow[],
): PropertyFeatureGroup[] {
  const groups: PropertyFeatureGroup[] = [];

  for (const { category, heading } of FEATURE_GROUP_ORDER) {
    const features = rows
      .filter((row) => row.category === category)
      .map(
        (row): PropertyFeature => ({
          id: row.id,
          category,
          label: row.label,
          value: row.value ?? undefined,
        }),
      );

    if (features.length > 0) {
      groups.push({ category, heading, features });
    }
  }

  return groups;
}

/**
 * Metadata overrides.
 *
 * Returns undefined when nothing is set, so the resolver can treat "no
 * overrides" as a single check rather than five.
 *
 * The Open Graph image is resolved from the joined image rows and is only
 * honoured when that image is published — a draft would render as a broken
 * preview wherever the link were shared, and social scrapers arrive with no
 * session, so there is no circumstance in which a draft would work.
 */
function mapSeo(
  row: PropertiesRow,
  images: readonly PropertyImagesRow[],
): PropertySeo | undefined {
  const hasOverride =
    row.seo_meta_title !== null ||
    row.seo_meta_description !== null ||
    row.seo_og_image_id !== null ||
    row.seo_canonical_url !== null ||
    row.seo_noindex;

  if (!hasOverride) {
    return undefined;
  }

  let ogImageUrl: string | undefined;

  if (row.seo_og_image_id) {
    const chosen = images.find((image) => image.id === row.seo_og_image_id);

    // `images` has already been filtered to published rows by the caller, so a
    // draft or deleted choice simply does not match and the override falls
    // back to the hero.
    if (chosen) {
      const source = mapSource(chosen.storage_path, chosen.external_url);
      ogImageUrl = source ? (resolveMediaSource(source) ?? undefined) : undefined;
    }
  }

  return {
    metaTitle: row.seo_meta_title ?? undefined,
    metaDescription: row.seo_meta_description ?? undefined,
    ogImageUrl,
    canonicalUrl: row.seo_canonical_url ?? undefined,
    noindex: row.seo_noindex,
  };
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
  const testimonialRows = row.property_testimonials ?? [];

  /*
    Unpublished media is filtered here as well as by RLS.

    RLS is the control that matters — the anon key cannot read a draft row, so
    one never reaches this function through the public repository. But this
    mapper is a pure function that any caller could hand rows to, including a
    future admin preview built on an authenticated client that *can* see
    drafts. Filtering here means "draft media never becomes public media" is a
    property of the mapping itself, not only of who happened to query.
  */
  const visualRows = (row.property_images ?? [])
    .filter((image) => image.is_published)
    .slice()
    .sort(bySortOrder);

  const resourceRows = (row.property_resources ?? [])
    .filter((resource) => resource.is_published)
    .slice()
    .sort(bySortOrder);

  // Same discipline for the two Phase 6.3 children: drafts are filtered here
  // as well as by RLS, so "draft content never becomes public content" is a
  // property of the mapping rather than only of who queried.
  const constructionRows = (row.construction_updates ?? [])
    .filter((update) => update.is_published)
    .slice()
    .sort(bySortOrder);

  const featureRows = (row.property_features ?? [])
    .filter((feature) => feature.is_published)
    .slice()
    .sort(bySortOrder);

  // The hero is the row whose category is 'hero' — one per property, enforced
  // by a partial unique index. Either source kind is acceptable: an
  // externally hosted hero is as valid as an uploaded one.
  const heroRow = visualRows.find(
    (image) => normaliseImageCategory(image.image_type) === "hero",
  );
  const heroSource = heroRow
    ? mapSource(heroRow.storage_path, heroRow.external_url)
    : null;

  const visuals = visualRows
    .map(mapVisual)
    .filter((visual): visual is PropertyVisual => visual !== null);

  const linkedMedia = resourceRows
    .map(mapResource)
    .filter((resource): resource is PropertyVisual => resource !== null);

  visuals.push(...linkedMedia);

  const documents = resourceRows
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
    heroImage:
      heroRow && heroSource
        ? {
            id: heroRow.id,
            source: heroSource,
            altText: heroRow.alt_text ?? undefined,
          }
        : undefined,
    placeholderVariant: placeholderFor(row),
    completionLabel: row.completion_label ?? undefined,
    priceDisplay: row.price_display ?? undefined,
    isFeatured: row.is_featured,
    visuals: visuals.length > 0 ? visuals : undefined,
    documents: documents.length > 0 ? documents : undefined,
    testimonials:
      testimonialRows.length > 0 ? testimonialRows.map(mapTestimonial) : undefined,
    constructionUpdates:
      constructionRows.length > 0
        ? constructionRows.map(mapConstructionUpdate)
        : undefined,
    featureGroups: (() => {
      const groups = mapFeatureGroups(featureRows);
      return groups.length > 0 ? groups : undefined;
    })(),
    seo: mapSeo(row, visualRows),
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
