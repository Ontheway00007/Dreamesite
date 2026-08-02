/** Lifecycle state of a property in the showcase. */
export type PropertyStatus =
  | "move-in-ready"
  | "under-construction"
  | "completed"
  | "sold";

/** A single navigation entry used by the header and footer. */
export interface NavLink {
  readonly label: string;
  readonly href: string;
}

/** Geographic point, matching the [longitude, latitude] order Mapbox expects. */
export type LngLat = readonly [longitude: number, latitude: number];
