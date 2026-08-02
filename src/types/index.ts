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

/* -------------------------------------------------------------------------- */
/* Location privacy                                                           */
/* -------------------------------------------------------------------------- */

/**
 * How precisely a property's position may be published. Chosen per property and
 * deliberately independent of its status: a sold home may be shown exactly if
 * that is the decision, and a home for sale may be hidden.
 *
 * - `exact`: publish the stored position.
 * - `approximate`: publish a deterministic position within `privacyRadiusMeters`.
 * - `suburb`: publish the suburb's reference position, derived from the suburb
 *   rather than from the property, so nothing about the real position is exposed.
 * - `hidden`: publish no position at all. The property still appears in lists.
 */
export type LocationVisibility = "exact" | "approximate" | "suburb" | "hidden";

/** Approximation radii offered to an administrator, in metres. */
export type PrivacyRadiusMeters = 100 | 250 | 500 | 1000 | 2000 | 5000;

/**
 * Who places the public marker.
 *
 * - `automatic`: derived from the stored position and the visibility rules.
 * - `manual`: an administrator positioned it. The stored position is untouched.
 */
export type PublicMarkerMode = "automatic" | "manual";

/**
 * Which parts of the street address may be published. Each part is independent,
 * so "27 Example Street, Craigieburn VIC 3064", "Example Street", "Craigieburn
 * VIC" and no address at all are all expressible.
 */
export interface AddressVisibility {
  readonly houseNumber: boolean;
  readonly street: boolean;
  readonly suburb: boolean;
  readonly postcode: boolean;
}

/** Per-property privacy settings. The future admin dashboard edits exactly this. */
export interface PropertyPrivacySettings {
  readonly locationVisibility: LocationVisibility;
  /** Applies when `locationVisibility` is `approximate`. Never published. */
  readonly privacyRadiusMeters: PrivacyRadiusMeters;
  readonly publicMarkerMode: PublicMarkerMode;
  /**
   * Public marker chosen by an administrator, used when the mode is `manual`.
   * A separate pair of fields on purpose: publishing a hand-placed marker must
   * never overwrite the stored private position.
   */
  readonly manualLatitude?: number;
  readonly manualLongitude?: number;
  readonly addressVisibility: AddressVisibility;
  /**
   * Whether directions may be offered. Left unset, the default for the chosen
   * visibility applies: allowed for `exact`, off for everything else.
   */
  readonly allowDirections?: boolean;
  /**
   * Suburb whose reference position is used when visibility is `suburb`.
   * Defaults to the property's own suburb.
   */
  readonly suburbReference?: string;
}

/** Street-level address parts. Never published as-is. */
export interface PropertyAddressRecord {
  readonly houseNumber?: string;
  readonly street?: string;
  readonly postcode: string;
}

/* -------------------------------------------------------------------------- */
/* Property content                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A visual attached to a property.
 *
 * One shape covers photography, drone footage, a virtual tour and a floor plan
 * image, so adding any of them later is a data change rather than a new section
 * type. `path` points inside the Supabase Storage bucket; `externalUrl` is for
 * media hosted elsewhere, such as a tour provider.
 */
export type PropertyVisualKind =
  | "photo"
  | "drone-video"
  | "virtual-tour"
  | "floorplan";

export interface PropertyVisual {
  readonly id: string;
  readonly kind: PropertyVisualKind;
  readonly path?: string;
  readonly externalUrl?: string;
  readonly caption?: string;
  /** Poster image for a video or tour, as a storage path. */
  readonly posterPath?: string;
}

/** A downloadable document: brochure, floor plan PDF, specification sheet. */
export interface PropertyDocument {
  readonly id: string;
  readonly kind: "brochure" | "floorplan" | "specification";
  readonly label: string;
  /** Path inside the Supabase Storage bucket. */
  readonly path: string;
  readonly fileSizeLabel?: string;
}

/** A customer quote. Only ever published with the customer's permission. */
export interface PropertyTestimonial {
  readonly id: string;
  readonly quote: string;
  /** How the customer agreed to be credited, e.g. "M. and J., Craigieburn". */
  readonly attribution: string;
  readonly year?: string;
}

/** Long-form description, and where it came from. */
export interface PropertyDescription {
  readonly paragraphs: readonly string[];
  /**
   * `ai-assisted` copy is disclosed on the page. Nothing is published as human
   * writing when it is not.
   */
  readonly source: "written" | "ai-assisted";
}

/** Display home details, when a property is open to visit. */
export interface DisplayHomeDetails {
  readonly isDisplayHome: boolean;
  /** Opening arrangement, only once confirmed by the business. */
  readonly openingNote?: string;
}

/* -------------------------------------------------------------------------- */
/* Property                                                                   */
/* -------------------------------------------------------------------------- */

/** Fields that are public for every property, whatever its privacy settings. */
export interface PropertyBase {
  readonly id: string;
  /** URL segment for the property detail route. */
  readonly slug: string;
  readonly name: string;
  readonly summary: string;
  /** Listings are organised by suburb, so the suburb itself is always public. */
  readonly suburb: string;
  /** Australian state or territory abbreviation, e.g. "VIC". */
  readonly state: string;
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

  /* --- Detail page content. Every field is optional: a section that has no
     data is not rendered, so nothing has to be invented to fill the page. --- */

  /** Long-form description shown above the specifications. */
  readonly description?: PropertyDescription;
  /** Photography, drone footage, tours and floor plan images. */
  readonly visuals?: readonly PropertyVisual[];
  /** Brochures and floor plan documents. */
  readonly documents?: readonly PropertyDocument[];
  readonly testimonials?: readonly PropertyTestimonial[];
  readonly displayHome?: DisplayHomeDetails;
  /**
   * The build stage currently under way, matching an id in `content/process.ts`.
   * Only meaningful while a home is under construction; the progress timeline is
   * derived from it rather than stored stage by stage.
   */
  readonly currentStageId?: string;
}

/**
 * The stored record: the private position, the full address and the privacy
 * settings that govern them.
 *
 * This shape must never reach the browser. `toPublicProperty` is the only way
 * out, and it is what turns these settings into a publishable location.
 */
export interface PropertyRecord extends PropertyBase {
  readonly privateLatitude: number;
  readonly privateLongitude: number;
  readonly address: PropertyAddressRecord;
  readonly privacy: PropertyPrivacySettings;
}

/**
 * The published location. Everything here is safe to send to a browser: the
 * coordinates have already been reduced, removed or replaced, and the address is
 * a finished string containing only the permitted parts.
 */
export interface PublicPropertyLocation {
  readonly visibility: LocationVisibility;
  readonly publicLatitude?: number;
  readonly publicLongitude?: number;
  readonly markerMode: PublicMarkerMode;
  /** Formatted address, or null when no address may be shown. */
  readonly address: string | null;
  readonly allowDirections: boolean;
  /** Short caveat for cards and lists, e.g. "Approximate location". */
  readonly label: string | null;
  /** Fuller explanation for the property page. */
  readonly accuracyNote: string | null;
}

/** A property as published to the UI. */
export interface Property extends PropertyBase {
  readonly location: PublicPropertyLocation;
}

/** A published location that has coordinates. */
export type MappableLocation = PublicPropertyLocation & {
  readonly publicLatitude: number;
  readonly publicLongitude: number;
};

/** A published property that can be drawn on the map. */
export type MappableProperty = Property & {
  readonly location: MappableLocation;
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
