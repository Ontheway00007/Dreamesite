import type { Feature, FeatureCollection, Point } from "geojson";

import { isMappable } from "@/lib/properties/privacy";
import type { Property, PropertyStatus } from "@/types";

/**
 * Property data as Mapbox consumes it.
 *
 * Built from published locations only, so a coordinate can only reach the map if
 * the privacy pipeline allowed it. One GeoJSON source feeds clustering, the
 * markers and the hover and selected layers, so adding properties costs no extra
 * React components.
 */

export interface PropertyFeatureProperties {
  id: string;
  slug: string;
  name: string;
  suburb: string;
  status: PropertyStatus;
}

export type PropertyFeature = Feature<Point, PropertyFeatureProperties>;
export type PropertyFeatureCollection = FeatureCollection<
  Point,
  PropertyFeatureProperties
>;

export const emptyFeatureCollection: PropertyFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/**
 * Builds the source data. Properties without a published position — hidden
 * locations, or suburbs with no reference position — are simply absent from the
 * map while remaining in the list.
 */
export function propertiesToGeoJson(
  properties: readonly Property[],
): PropertyFeatureCollection {
  return {
    type: "FeatureCollection",
    features: properties.filter(isMappable).map((property) => ({
      type: "Feature",
      // Promoted to the feature id so hover and selection can filter on it.
      id: property.id,
      geometry: {
        type: "Point",
        coordinates: [
          property.location.publicLongitude,
          property.location.publicLatitude,
        ],
      },
      properties: {
        id: property.id,
        slug: property.slug,
        name: property.name,
        suburb: property.suburb,
        status: property.status,
      },
    })),
  };
}

/** South-west and north-east corners covering the given properties. */
export function boundsOfProperties(
  properties: readonly Property[],
): [[number, number], [number, number]] | null {
  const mappable = properties.filter(isMappable);

  if (mappable.length === 0) {
    return null;
  }

  const longitudes = mappable.map(
    (property) => property.location.publicLongitude,
  );
  const latitudes = mappable.map((property) => property.location.publicLatitude);

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

/** How many of the given properties can actually appear on the map. */
export function countMappable(properties: readonly Property[]): number {
  return properties.filter(isMappable).length;
}
