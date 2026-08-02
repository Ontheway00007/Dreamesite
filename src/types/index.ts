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
export type ArchitecturalVariant = "single-storey" | "double-storey" | "townhouse";

/**
 * The shape the homepage needs to render a property card. The full property
 * record arrives with the Supabase schema in a later phase.
 */
export interface PropertyPreview {
  readonly id: string;
  /** URL segment for the property detail route. */
  readonly slug: string;
  readonly name: string;
  readonly suburb: string;
  readonly status: PropertyStatus;
  readonly summary: string;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly carSpaces: number;
  /** Land size in square metres. */
  readonly landSize: number;
  /**
   * Path inside the Supabase Storage bucket, once photography exists. While it
   * is undefined the card renders the architectural placeholder.
   */
  readonly imagePath?: string;
  readonly placeholderVariant: ArchitecturalVariant;
}
