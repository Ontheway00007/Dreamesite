import type {
  LocationPrecision,
  MappableProperty,
  Property,
  PropertyRecord,
} from "@/types";

/**
 * Location privacy rules.
 *
 * This module is the only place where a stored position becomes a published
 * one. Everything the browser receives has passed through `toPublicProperty`,
 * so a mistake in the data file cannot expose a home's exact position.
 */

/**
 * Decimal places kept for an approximate position. Three decimals is roughly
 * 110 m at Melbourne's latitude: enough to show the right neighbourhood,
 * not enough to identify a dwelling.
 */
export const APPROXIMATE_DECIMALS = 3;

/**
 * Statuses that must never publish an exact position. A sold or completed home
 * is someone's residence, so the pin is reduced even if the record says exact.
 */
const OCCUPIED_STATUSES = new Set(["sold", "completed"]);

/** Resolves the precision that may actually be published for a record. */
export function resolveLocationPrecision(
  record: Pick<PropertyRecord, "status" | "locationPrecision">,
): LocationPrecision {
  if (record.locationPrecision === "private") {
    return "private";
  }

  if (OCCUPIED_STATUSES.has(record.status)) {
    return "approximate";
  }

  return record.locationPrecision;
}

/** Rounds a coordinate to the neighbourhood-level grid. */
export function snapCoordinate(
  value: number,
  decimals: number = APPROXIMATE_DECIMALS,
): number {
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

/**
 * Converts a stored record into the shape the UI may receive:
 *
 * - `private` drops the coordinates entirely.
 * - `approximate` reduces them to the neighbourhood grid.
 * - `exact` is passed through, but only for statuses that allow it.
 *
 * Invalid coordinates are dropped rather than published as a broken pin.
 */
export function toPublicProperty(record: PropertyRecord): Property {
  const locationPrecision = resolveLocationPrecision(record);
  const {
    latitude: storedLatitude,
    longitude: storedLongitude,
    ...rest
  } = record;

  if (
    locationPrecision === "private" ||
    !isValidCoordinate(storedLatitude, storedLongitude)
  ) {
    return { ...rest, locationPrecision };
  }

  if (locationPrecision === "approximate") {
    return {
      ...rest,
      locationPrecision,
      latitude: snapCoordinate(storedLatitude),
      longitude: snapCoordinate(storedLongitude),
    };
  }

  return {
    ...rest,
    locationPrecision,
    latitude: storedLatitude,
    longitude: storedLongitude,
  };
}

/** Narrows to properties that can be placed on the map. */
export function isMappable(property: Property): property is MappableProperty {
  return isValidCoordinate(property.latitude, property.longitude);
}

/** Short, public-facing explanation of a pin's accuracy. */
export function locationPrecisionLabel(
  precision: LocationPrecision,
): string | null {
  switch (precision) {
    case "approximate":
      return "Approximate location";
    case "private":
      return "Location on enquiry";
    case "exact":
      return null;
  }
}
