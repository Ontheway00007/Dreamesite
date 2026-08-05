import { getSuburbReference } from "@/content/suburb-references";
import { isValidCoordinate } from "@/lib/properties/privacy";
import type { PropertyRecord } from "@/types";

/**
 * Privacy configuration review.
 *
 * Some combinations of settings are individually valid but contradict each other
 * — publishing a full street address while hiding the marker, for instance. This
 * module reports those combinations as structured warnings so the future admin
 * dashboard can surface them beside the relevant field.
 *
 * It never throws and never changes anything: a contradictory configuration is
 * still applied exactly as written, because refusing to save someone's choice is
 * not this module's job. It only tells them what the choice will do.
 */

export type PrivacyWarningSeverity = "warning" | "info";

/** Which control the message belongs to, so a form can highlight it. */
export type PrivacyField =
  | "locationVisibility"
  | "privacyRadiusMeters"
  | "publicMarkerMode"
  | "addressVisibility"
  | "allowDirections";

export type PrivacyWarningCode =
  | "address-contradicts-hidden-marker"
  | "address-contradicts-suburb-marker"
  | "address-contradicts-approximate-marker"
  | "house-number-without-street"
  | "directions-reveal-approximate-marker"
  | "directions-reveal-suburb-marker"
  | "directions-ignored-while-hidden"
  | "manual-marker-without-coordinates"
  | "manual-coordinates-unused"
  | "manual-marker-ignored-while-hidden"
  | "suburb-without-reference";

export interface PrivacyWarning {
  readonly code: PrivacyWarningCode;
  readonly severity: PrivacyWarningSeverity;
  readonly field: PrivacyField;
  /** Written for an administrator, not for a visitor. */
  readonly message: string;
}

/** The parts of a record the review needs. */
export type PrivacyValidationInput = Pick<
  PropertyRecord,
  "suburb" | "address" | "privacy"
>;

/**
 * Reviews a property's privacy settings.
 *
 * Returns an empty array when the configuration is coherent — an exact marker
 * with a full address and directions enabled produces no warnings, because
 * nothing about it is contradictory.
 */
export function validatePropertyPrivacy(
  input: PrivacyValidationInput,
): PrivacyWarning[] {
  const { privacy, address, suburb } = input;
  const { addressVisibility: visibleParts, locationVisibility } = privacy;
  const warnings: PrivacyWarning[] = [];

  const publishesStreet = visibleParts.street && Boolean(address.street);
  const publishesHouseNumber =
    publishesStreet && visibleParts.houseNumber && Boolean(address.houseNumber);
  const publishesStreetAddress = publishesStreet || publishesHouseNumber;

  /* --- Address against marker ---------------------------------------- */

  if (publishesStreetAddress && locationVisibility === "hidden") {
    warnings.push({
      code: "address-contradicts-hidden-marker",
      severity: "warning",
      field: "addressVisibility",
      message:
        "The marker is hidden, but the street address is published. Anyone can find the home from the address.",
    });
  }

  if (publishesStreetAddress && locationVisibility === "suburb") {
    warnings.push({
      code: "address-contradicts-suburb-marker",
      severity: "warning",
      field: "addressVisibility",
      message:
        "The marker shows the suburb only, but the street address is published, which undoes that protection.",
    });
  }

  if (publishesStreetAddress && locationVisibility === "approximate") {
    warnings.push({
      code: "address-contradicts-approximate-marker",
      severity: "warning",
      field: "addressVisibility",
      message:
        "The marker is generalised, but the street address is published, which undoes that protection.",
    });
  }

  if (visibleParts.houseNumber && !visibleParts.street) {
    warnings.push({
      code: "house-number-without-street",
      severity: "info",
      field: "addressVisibility",
      message:
        "A house number is not published without its street, so this setting has no effect on its own.",
    });
  }

  /* --- Directions against marker -------------------------------------- */

  if (privacy.allowDirections === true) {
    if (locationVisibility === "approximate") {
      warnings.push({
        code: "directions-reveal-approximate-marker",
        severity: "warning",
        field: "allowDirections",
        message:
          "Directions lead to the generalised marker, which either misleads the visitor or narrows down the home. Directions are normally off for an approximate location.",
      });
    }

    if (locationVisibility === "suburb") {
      warnings.push({
        code: "directions-reveal-suburb-marker",
        severity: "warning",
        field: "allowDirections",
        message:
          "Directions lead to the suburb reference point rather than the home. Directions are normally off for a suburb-only location.",
      });
    }

    if (locationVisibility === "hidden") {
      warnings.push({
        code: "directions-ignored-while-hidden",
        severity: "info",
        field: "allowDirections",
        message:
          "There is no public marker, so directions are never offered while the location is hidden.",
      });
    }
  }

  /* --- Manual marker --------------------------------------------------- */

  const hasManualCoordinates = isValidCoordinate(
    privacy.manualLatitude,
    privacy.manualLongitude,
  );

  if (privacy.publicMarkerMode === "manual") {
    if (!hasManualCoordinates) {
      warnings.push({
        code: "manual-marker-without-coordinates",
        severity: "warning",
        field: "publicMarkerMode",
        message:
          "The marker is set to manual but no position has been placed, so the automatic position is used instead.",
      });
    } else if (locationVisibility === "hidden") {
      warnings.push({
        code: "manual-marker-ignored-while-hidden",
        severity: "info",
        field: "publicMarkerMode",
        message:
          "A manual position has been placed, but nothing is published while the location is hidden.",
      });
    }
  } else if (hasManualCoordinates) {
    warnings.push({
      code: "manual-coordinates-unused",
      severity: "info",
      field: "publicMarkerMode",
      message:
        "A manual position is saved but the marker is automatic, so the saved position is not used.",
    });
  }

  /* --- Suburb reference ------------------------------------------------ */

  if (locationVisibility === "suburb") {
    const reference = getSuburbReference(privacy.suburbReference ?? suburb);

    if (!reference) {
      warnings.push({
        code: "suburb-without-reference",
        severity: "warning",
        field: "locationVisibility",
        message: `There is no reference position for ${privacy.suburbReference ?? suburb}, so this home will not appear on the map. Add the suburb to the reference list.`,
      });
    }
  }

  return warnings;
}

/** True when a configuration has something an administrator should look at. */
export function hasPrivacyWarnings(warnings: readonly PrivacyWarning[]): boolean {
  return warnings.some((warning) => warning.severity === "warning");
}
