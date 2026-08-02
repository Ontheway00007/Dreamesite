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

/** Line-art variant used while a property has no photography. */
export type ArchitecturalVariant =
  | "single-storey"
  | "double-storey"
  | "townhouse";

/**
 * How precisely a property's position may be published.
 *
 * - `exact`: the pin may sit on the building. Only for homes that are on the
 *   market and have been approved for exact display.
 * - `approximate`: the pin is reduced to a neighbourhood-level position.
 * - `private`: no coordinates are published at all. The property still appears
 *   in the list, but never on the map.
 */
export type LocationPrecision = "exact" | "approximate" | "private";

/** Fields shared by every representation of a property. */
export interface PropertyBase {
  readonly id: string;
  /** URL segment for the property detail route. */
  readonly slug: string;
  readonly name: string;
  readonly summary: string;
  readonly suburb: string;
  /** Australian state or territory abbreviation, e.g. "VIC". */
  readonly state: string;
  readonly postcode: string;
  readonly status: PropertyStatus;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly carSpaces: number;
  /** Land size in square metres. */
  readonly landSize: number;
  /** Internal floor area in square metres, when measured. */
  readonly houseSize?: number;
  /**
   * Path inside the Supabase Storage bucket, once photography exists. While it
   * is undefined the card renders the architectural placeholder.
   */
  readonly imagePath?: string;
  readonly placeholderVariant: ArchitecturalVariant;
  /** Human-readable completion timing, when there is something to say. */
  readonly completionLabel?: string;
  /** Display-ready price string. Only set when the business has confirmed it. */
  readonly priceDisplay?: string;
  readonly isFeatured: boolean;
}

/**
 * The stored record, including the exact position.
 *
 * This shape never reaches the browser: the repository converts it with
 * `toPublicProperty` first, which is what enforces the privacy rules.
 */
export interface PropertyRecord extends PropertyBase {
  readonly locationPrecision: LocationPrecision;
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * A property as published to the UI. Coordinates are already reduced to the
 * precision the record allows, and are absent entirely for private locations.
 */
export interface Property extends PropertyBase {
  readonly locationPrecision: LocationPrecision;
  readonly latitude?: number;
  readonly longitude?: number;
}

/** A published property that has coordinates and can be drawn on the map. */
export type MappableProperty = Property & {
  readonly latitude: number;
  readonly longitude: number;
};

/** The subset of a property the card needs. */
export type PropertyPreview = Pick<
  Property,
  | "id"
  | "slug"
  | "name"
  | "summary"
  | "suburb"
  | "status"
  | "bedrooms"
  | "bathrooms"
  | "carSpaces"
  | "landSize"
  | "imagePath"
  | "placeholderVariant"
>;
