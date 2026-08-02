import { propertyMediaUrl } from "@/lib/images/property-image";
import type {
  ArchitecturalVariant,
  Property,
  PropertyDocument,
  PropertyVisual,
} from "@/types";

/**
 * Turns a property's stored media references into things a component can render.
 *
 * Every kind of visual — photography, drone footage, a virtual tour, a floor plan
 * — arrives in the same shape, so the page decides where each belongs rather than
 * each section inventing its own resolution logic. Until a property has any
 * media, the gallery falls back to the architectural drawing.
 */

export interface ResolvedVisual {
  readonly id: string;
  readonly kind: PropertyVisual["kind"];
  /** Resolved URL for stored media, or null when it is not available. */
  readonly url: string | null;
  readonly externalUrl?: string;
  readonly posterUrl: string | null;
  readonly caption?: string;
  /** Drawing to show when there is no image to show. */
  readonly placeholderVariant: ArchitecturalVariant;
}

function resolve(
  visual: PropertyVisual,
  placeholderVariant: ArchitecturalVariant,
): ResolvedVisual {
  return {
    id: visual.id,
    kind: visual.kind,
    url: propertyMediaUrl(visual.path),
    externalUrl: visual.externalUrl,
    posterUrl: propertyMediaUrl(visual.posterPath),
    caption: visual.caption,
    placeholderVariant,
  };
}

/** Gallery items: stills only, so a video never appears as a flat image. */
export function galleryVisuals(property: Property): ResolvedVisual[] {
  const stills = (property.visuals ?? []).filter(
    (visual) => visual.kind === "photo" || visual.kind === "floorplan",
  );

  if (stills.length === 0) {
    return [
      {
        id: `${property.id}-architectural`,
        kind: "photo",
        url: null,
        posterUrl: null,
        placeholderVariant: property.placeholderVariant,
      },
    ];
  }

  return stills.map((visual) => resolve(visual, property.placeholderVariant));
}

function findVisual(
  property: Property,
  kind: PropertyVisual["kind"],
): ResolvedVisual | null {
  const match = (property.visuals ?? []).find(
    (visual) => visual.kind === kind,
  );

  return match ? resolve(match, property.placeholderVariant) : null;
}

/** The virtual tour, when one has been linked. */
export function virtualTour(property: Property): ResolvedVisual | null {
  return findVisual(property, "virtual-tour");
}

/** Drone footage, when it has been uploaded or linked. */
export function droneVideo(property: Property): ResolvedVisual | null {
  return findVisual(property, "drone-video");
}

export interface ResolvedDocument extends PropertyDocument {
  readonly url: string | null;
}

/** Downloadable documents that actually resolve to a file. */
export function propertyDocuments(property: Property): ResolvedDocument[] {
  return (property.documents ?? [])
    .map((document) => ({ ...document, url: propertyMediaUrl(document.path) }))
    .filter((document) => document.url !== null);
}

/** True when the property has anything beyond the fallback drawing. */
export function hasRichMedia(property: Property): boolean {
  return (
    galleryVisuals(property).some((visual) => visual.url !== null) ||
    virtualTour(property) !== null ||
    droneVideo(property) !== null
  );
}
