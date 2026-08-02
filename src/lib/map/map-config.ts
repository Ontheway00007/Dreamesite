/**
 * Central map configuration.
 *
 * The token and the style live here so no component reads them directly, and so
 * a missing token is a value to handle rather than an exception to catch. This
 * module is only imported by the map feature, which keeps Mapbox configuration
 * out of unrelated routes.
 */

/** Fallback style: dark enough for the brand, still readable for navigation. */
const DEFAULT_MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

/**
 * Mapbox public token. Returns null rather than throwing so the properties page
 * can fall back to a list-only experience.
 */
export function getMapboxToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();

  return token ? token : null;
}

/** Style URL, overridable per environment for a future Mapbox Studio style. */
export function getMapStyle(): string {
  return process.env.NEXT_PUBLIC_MAPBOX_STYLE?.trim() || DEFAULT_MAP_STYLE;
}

/**
 * Melbourne's northern growth corridor: the confirmed build areas of Mickleham,
 * Craigieburn and Donnybrook. Used when there is nothing to fit to, for example
 * when a filter returns no results. Widening this does not require map changes.
 */
export const NORTHERN_CORRIDOR_BOUNDS: [[number, number], [number, number]] = [
  [144.845, -37.64],
  [145.005, -37.465],
];

export const mapLimits = {
  minZoom: 8.5,
  maxZoom: 17,
  /** Never zoom past this when focusing a single property. */
  selectionZoom: 14.5,
  /** Keeps fitted pins clear of the panel edges and floating preview. */
  fitPadding: { top: 72, right: 72, bottom: 132, left: 72 },
  /** A single pin has no extent, so fitting it needs an explicit zoom. */
  singlePropertyZoom: 14,
} as const;

export const mapSource = {
  properties: "dreame-properties",
} as const;

export const mapLayers = {
  clusters: "dreame-clusters",
  clusterCount: "dreame-cluster-count",
  markers: "dreame-property-markers",
  hovered: "dreame-property-hovered",
  selected: "dreame-property-selected",
} as const;

export const clusterConfig = {
  radius: 48,
  maxZoom: 13,
} as const;
