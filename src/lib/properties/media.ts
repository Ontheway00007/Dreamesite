import { propertyMediaUrl } from "@/lib/images/property-image";
import type {
  ArchitecturalVariant,
  MediaSource,
  Property,
  PropertyDocument,
  PropertyImageCategory,
  PropertyVisual,
} from "@/types";

/**
 * Turns a property's stored media references into things a component can
 * render.
 *
 * `resolveMediaSource` is the only function in the codebase that converts a
 * media source into a URL. Everything else — galleries, documents, cards,
 * social images — goes through it. That is what keeps the storage-versus-
 * external distinction in one place instead of being re-derived, and
 * occasionally mis-derived, at each call site.
 */

/**
 * Resolves a media source to a URL a browser can fetch.
 *
 * - `storage` sources have the bucket URL prepended and their segments
 *   percent-encoded.
 * - `external` sources are already absolute and are returned unchanged.
 *
 * Returns null only when a stored object cannot be resolved — which happens
 * when Supabase is not configured. An external URL always resolves, because
 * it depends on nothing of ours.
 */
export function resolveMediaSource(
  source: MediaSource | undefined,
): string | null {
  if (!source) {
    return null;
  }

  if (source.kind === "external") {
    return source.url;
  }

  return propertyMediaUrl(source.path);
}

export interface ResolvedVisual {
  readonly id: string;
  readonly kind: PropertyVisual["kind"];
  /** Fetchable URL, or null when a stored object cannot be resolved. */
  readonly url: string | null;
  readonly posterUrl: string | null;
  /** Description for assistive technology, when the editor supplied one. */
  readonly altText?: string;
  readonly caption?: string;
  readonly category?: PropertyImageCategory;
  /** Drawing to show when there is no image to show. */
  readonly placeholderVariant: ArchitecturalVariant;
}

function resolveVisual(
  visual: PropertyVisual,
  placeholderVariant: ArchitecturalVariant,
): ResolvedVisual {
  return {
    id: visual.id,
    kind: visual.kind,
    url: resolveMediaSource(visual.source),
    posterUrl: resolveMediaSource(visual.poster),
    altText: visual.altText,
    caption: visual.caption,
    category: visual.category,
    placeholderVariant,
  };
}

/**
 * Display order for the showcase.
 *
 * The hero leads, because it is the image chosen to represent the property.
 * The rest follow in a fixed category order so the sequence is the same on
 * every render and every device — an arbitrary order would make the gallery
 * arrows move unpredictably.
 */
const CATEGORY_ORDER: Readonly<Record<PropertyImageCategory, number>> = {
  hero: 0,
  gallery: 1,
  facade: 2,
  construction: 3,
  drone: 4,
  floor_plan: 5,
};

function byCategoryThenId(a: ResolvedVisual, b: ResolvedVisual): number {
  const rank =
    CATEGORY_ORDER[a.category ?? "gallery"] -
    CATEGORY_ORDER[b.category ?? "gallery"];

  // Ties fall back to id so the order is total and therefore stable. Within a
  // category the repository has already applied sort_order.
  return rank !== 0 ? rank : a.id.localeCompare(b.id);
}

/** Placeholder entry used when a property has no photography at all. */
function architecturalFallback(property: Property): ResolvedVisual {
  return {
    id: `${property.id}-architectural`,
    kind: "photo",
    url: null,
    posterUrl: null,
    placeholderVariant: property.placeholderVariant,
  };
}

/**
 * Photography for the showcase: the hero followed by the other stills.
 *
 * Floor plans are excluded. They are diagrams, not photographs — mixing them
 * in makes the gallery arrows step from a kitchen to a line drawing, and the
 * floor plan gets its own section where it can be shown at a useful size.
 *
 * Videos and tours are excluded too, so a link never renders as a flat image.
 */
export function photographyVisuals(property: Property): ResolvedVisual[] {
  const stills = (property.visuals ?? [])
    .filter((visual) => visual.kind === "photo")
    .map((visual) => resolveVisual(visual, property.placeholderVariant))
    .sort(byCategoryThenId);

  return stills.length > 0 ? stills : [architecturalFallback(property)];
}

/**
 * Retained name for the showcase component.
 *
 * @deprecated Prefer `photographyVisuals`, which says what it returns.
 */
export const galleryVisuals = photographyVisuals;

/** Floor plan images, shown separately from the photography. */
export function floorPlanVisuals(property: Property): ResolvedVisual[] {
  return (property.visuals ?? [])
    .filter((visual) => visual.kind === "floorplan")
    .map((visual) => resolveVisual(visual, property.placeholderVariant));
}

function findVisual(
  property: Property,
  kind: PropertyVisual["kind"],
): ResolvedVisual | null {
  const match = (property.visuals ?? []).find((visual) => visual.kind === kind);

  return match ? resolveVisual(match, property.placeholderVariant) : null;
}

/** The virtual tour, when one has been linked. */
export function virtualTour(property: Property): ResolvedVisual | null {
  return findVisual(property, "virtual-tour");
}

/** Drone footage, when it has been linked. */
export function droneVideo(property: Property): ResolvedVisual | null {
  return findVisual(property, "drone-video");
}

export interface ResolvedDocument {
  readonly id: string;
  readonly kind: PropertyDocument["kind"];
  readonly label: string;
  readonly url: string;
  readonly fileSizeLabel?: string;
}

/**
 * Downloadable documents that actually resolve to a file.
 *
 * A document whose source cannot be resolved is dropped rather than rendered
 * as a broken link — a download that 404s is worse than a download that is
 * not offered.
 *
 * `url` is non-nullable here, which is what lets the component link to it
 * without a fallback. The filter below is what earns that guarantee.
 */
export function propertyDocuments(property: Property): ResolvedDocument[] {
  const resolved: ResolvedDocument[] = [];

  for (const document of property.documents ?? []) {
    const url = resolveMediaSource(document.source);

    if (url === null) {
      continue;
    }

    resolved.push({
      id: document.id,
      kind: document.kind,
      label: document.label,
      url,
      fileSizeLabel: document.fileSizeLabel,
    });
  }

  return resolved;
}

/** The hero image resolved for cards, previews and social images. */
export function heroImageUrl(property: Property): string | null {
  return resolveMediaSource(property.heroImage?.source);
}

/**
 * Alt text for the hero.
 *
 * Falls back to the property name and suburb, which is accurate and useful
 * even when no alt text was supplied — unlike a generic "property image",
 * which tells a screen reader user nothing.
 */
export function heroImageAlt(property: Property): string {
  return property.heroImage?.altText ?? `${property.name}, ${property.suburb}`;
}

/** True when the property has anything beyond the fallback drawing. */
export function hasRichMedia(property: Property): boolean {
  return (
    photographyVisuals(property).some((visual) => visual.url !== null) ||
    floorPlanVisuals(property).length > 0 ||
    virtualTour(property) !== null ||
    droneVideo(property) !== null
  );
}
