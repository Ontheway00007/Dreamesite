import { getSuburbReference } from "@/content/suburb-references";
import type {
  AddressVisibility,
  LocationVisibility,
  MappableProperty,
  PrivacyRadiusMeters,
  Property,
  PropertyAddressRecord,
  PropertyPrivacySettings,
  PropertyRecord,
  PublicPropertyLocation,
} from "@/types";

/**
 * The privacy pipeline.
 *
 * Private record → privacy rules → public property. This module is the only
 * place that reads a stored position, and `toPublicProperty` is the only way a
 * property can leave the data layer, so nothing downstream can leak a position
 * by accident.
 *
 * Nothing here looks at a property's status. Visibility is whatever the record
 * says it is.
 */

const METRES_PER_DEGREE_LATITUDE = 111_320;

function metresPerDegreeLongitude(latitude: number): number {
  // Guard the cosine so a degenerate latitude cannot divide by zero.
  return (
    METRES_PER_DEGREE_LATITUDE *
    Math.max(Math.cos((latitude * Math.PI) / 180), 0.01)
  );
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

/** True when a coordinate pair is usable on a map. */
export function isValidCoordinate(
  latitude: number | undefined,
  longitude: number | undefined,
): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/** Small, stable hash of a grid cell. Not cryptographic; only needs to be fixed. */
function hashCell(x: number, y: number): number {
  let hash =
    2166136261 ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);

  return (hash ^ (hash >>> 16)) >>> 0;
}

export interface Coordinate {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Reduces a position to an approximate one.
 *
 * The position is quantised to a grid whose cell is the privacy radius, and the
 * cell centre is published. Quantising is what protects the home: every position
 * inside a cell produces the same output, so the original cannot be recovered —
 * unlike a reversible offset, which anyone reading this repository could undo.
 *
 * A small displacement derived from the cell — not from the property — is then
 * applied so the output does not sit on an obvious grid. Because it depends only
 * on the cell, it adds no information about the home.
 *
 * The result is deterministic: the same input always produces the same marker,
 * so it never moves between page loads.
 */
export function approximateCoordinate(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): Coordinate {
  const latitudeStep = radiusMeters / METRES_PER_DEGREE_LATITUDE;
  const cellY = Math.floor(latitude / latitudeStep);
  const centreLatitude = (cellY + 0.5) * latitudeStep;

  // The longitude grid is derived from the cell's own latitude, not from the
  // input. Using the input would make the grid shift slightly with every
  // position, so two neighbouring homes could land on different markers and the
  // output would vary continuously with the input — exactly what quantising is
  // meant to prevent.
  const longitudeStep = radiusMeters / metresPerDegreeLongitude(centreLatitude);
  const cellX = Math.floor(longitude / longitudeStep);
  const centreLongitude = (cellX + 0.5) * longitudeStep;

  const hash = hashCell(cellX, cellY);
  const angle = ((hash % 360) * Math.PI) / 180;
  const displacement = (((hash >>> 9) % 100) / 100) * 0.25;

  return {
    latitude: roundTo(
      centreLatitude + Math.sin(angle) * displacement * latitudeStep,
      6,
    ),
    longitude: roundTo(
      centreLongitude + Math.cos(angle) * displacement * longitudeStep,
      6,
    ),
  };
}

/**
 * Builds the address line from the parts an administrator has allowed.
 *
 * A house number without a street is meaningless, so it is only published when
 * the street is published too.
 */
export function formatPublicAddress(
  suburb: string,
  state: string,
  address: PropertyAddressRecord,
  visibility: AddressVisibility,
): string | null {
  const showStreet = visibility.street && Boolean(address.street);
  const showHouseNumber =
    showStreet && visibility.houseNumber && Boolean(address.houseNumber);

  const street = showStreet
    ? [showHouseNumber ? address.houseNumber : null, address.street]
        .filter(Boolean)
        .join(" ")
    : null;

  const locality = [
    visibility.suburb ? `${suburb} ${state}` : null,
    visibility.postcode ? address.postcode : null,
  ]
    .filter(Boolean)
    .join(" ");

  const parts = [street, locality.length > 0 ? locality : null].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

/** Short caveat shown beside a property. Never mentions how it was produced. */
export function locationLabel(visibility: LocationVisibility): string | null {
  switch (visibility) {
    case "exact":
      return null;
    case "approximate":
      return "Approximate location";
    case "suburb":
      return "Suburb only";
    case "hidden":
      return "Location available on enquiry";
  }
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

/** Fuller explanation for the property page. */
export function locationAccuracyNote(
  visibility: LocationVisibility,
  radiusMeters: PrivacyRadiusMeters,
): string | null {
  switch (visibility) {
    case "exact":
      return null;
    case "approximate":
      return `The marker is placed within ${formatDistance(radiusMeters)} of this home.`;
    case "suburb":
      return "The marker shows the suburb, not the home itself.";
    case "hidden":
      return "We share the location of this home directly with enquiring buyers.";
  }
}

/** Resolves the coordinates that may be published, if any. */
function resolvePublicCoordinate(record: PropertyRecord): Coordinate | null {
  const { privacy } = record;

  if (privacy.locationVisibility === "hidden") {
    return null;
  }

  // A manually placed marker wins, because an administrator chose it knowing
  // what it reveals. The stored position is never modified.
  if (
    privacy.publicMarkerMode === "manual" &&
    isValidCoordinate(privacy.manualLatitude, privacy.manualLongitude)
  ) {
    return {
      latitude: privacy.manualLatitude as number,
      longitude: privacy.manualLongitude as number,
    };
  }

  if (privacy.locationVisibility === "suburb") {
    const reference = getSuburbReference(
      privacy.suburbReference ?? record.suburb,
    );

    return reference
      ? { latitude: reference.latitude, longitude: reference.longitude }
      : null;
  }

  if (!isValidCoordinate(record.privateLatitude, record.privateLongitude)) {
    return null;
  }

  if (privacy.locationVisibility === "approximate") {
    return approximateCoordinate(
      record.privateLatitude,
      record.privateLongitude,
      privacy.privacyRadiusMeters,
    );
  }

  return {
    latitude: record.privateLatitude,
    longitude: record.privateLongitude,
  };
}

/** Turns a record's privacy settings into the location the UI may use. */
export function resolvePublicLocation(
  record: PropertyRecord,
): PublicPropertyLocation {
  const { privacy } = record;
  const visibility = privacy.locationVisibility;
  const coordinate = resolvePublicCoordinate(record);

  return {
    visibility,
    publicLatitude: coordinate?.latitude,
    publicLongitude: coordinate?.longitude,
    accuracyRadiusMeters:
      visibility === "approximate" ? privacy.privacyRadiusMeters : undefined,
    markerMode: privacy.publicMarkerMode,
    address: formatPublicAddress(
      record.suburb,
      record.state,
      record.address,
      privacy.addressVisibility,
    ),
    // Directions to a marker that does not exist are meaningless.
    allowDirections: privacy.allowDirections && coordinate !== null,
    label: locationLabel(visibility),
    accuracyNote: locationAccuracyNote(visibility, privacy.privacyRadiusMeters),
  };
}

/**
 * Converts a stored record into the only shape the UI is allowed to see.
 *
 * Fields are copied across explicitly rather than by spreading the record and
 * deleting the private parts. That choice matters: with a spread, any field
 * added to `PropertyRecord` later — an owner's phone number, an internal note —
 * would be published automatically. Here, a new field is invisible until someone
 * adds it to this list, and TypeScript flags anything missing. The default is
 * private.
 */
export function toPublicProperty(record: PropertyRecord): Property {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    summary: record.summary,
    suburb: record.suburb,
    state: record.state,
    status: record.status,
    bedrooms: record.bedrooms,
    bathrooms: record.bathrooms,
    carSpaces: record.carSpaces,
    landSize: record.landSize,
    houseSize: record.houseSize,
    imagePath: record.imagePath,
    placeholderVariant: record.placeholderVariant,
    completionLabel: record.completionLabel,
    priceDisplay: record.priceDisplay,
    isFeatured: record.isFeatured,
    location: resolvePublicLocation(record),
  };
}

/** Narrows to properties that can be placed on the map. */
export function isMappable(property: Property): property is MappableProperty {
  return isValidCoordinate(
    property.location.publicLatitude,
    property.location.publicLongitude,
  );
}

/** Sensible starting point for a new property, and for the future admin form. */
export const defaultPropertyPrivacy: PropertyPrivacySettings = {
  locationVisibility: "suburb",
  privacyRadiusMeters: 500,
  publicMarkerMode: "automatic",
  addressVisibility: {
    houseNumber: false,
    street: false,
    suburb: true,
    postcode: true,
  },
  allowDirections: false,
};
