import {
  ErrorBag,
  invalid,
  isRealNumber,
  isWithin,
  valid,
  type ValidationResult,
} from "@/lib/admin/validation/result";
import { isPrivacyRadius } from "@/lib/properties/privacy-options";
import type {
  LocationVisibility,
  PrivacyRadiusMeters,
  PublicMarkerMode,
} from "@/types";

/**
 * Location and privacy form validation.
 *
 * These rules mirror the CHECK constraints added in
 * `supabase/migrations/0005_constraints_and_privileges.sql`
 * (`approximate_requires_radius`, `manual_requires_coordinates`,
 * `hidden_has_no_coordinate`, `hidden_has_no_directions`). Catching them here
 * turns a constraint violation into a sentence naming the control at fault.
 *
 * This module validates *coherence*, not *wisdom*. A configuration that is
 * legal but self-defeating — publishing a street address while hiding the
 * marker — is reported by `validatePropertyPrivacy` in
 * `lib/properties/privacy-validation.ts` as a warning, and is still allowed.
 * The two are deliberately separate: this one can refuse a save, that one
 * never can.
 */

export interface LocationInput {
  readonly privateLatitude: number;
  readonly privateLongitude: number;
  readonly houseNumber?: string;
  readonly street?: string;
  readonly postcode?: string;
  readonly locationVisibility: LocationVisibility;
  readonly privacyRadiusMeters: PrivacyRadiusMeters;
  readonly publicMarkerMode: PublicMarkerMode;
  readonly manualPublicLatitude?: number;
  readonly manualPublicLongitude?: number;
  readonly showHouseNumber: boolean;
  readonly showStreet: boolean;
  readonly showSuburb: boolean;
  readonly showPostcode: boolean;
  readonly allowDirections?: boolean;
  readonly suburbReference?: string;
}

const VISIBILITIES: readonly LocationVisibility[] = [
  "exact",
  "approximate",
  "suburb",
  "hidden",
];

const MARKER_MODES: readonly PublicMarkerMode[] = ["automatic", "manual"];

/** Australian postcodes are exactly four digits. */
const POSTCODE_PATTERN = /^\d{4}$/;

export function validateLocation(
  input: LocationInput,
): ValidationResult<LocationInput> {
  const errors = new ErrorBag();

  /* --- Stored position ------------------------------------------------ */

  if (!isRealNumber(input.privateLatitude)) {
    errors.add("privateLatitude", "Enter a latitude.");
  } else if (!isWithin(input.privateLatitude, -90, 90)) {
    errors.add("privateLatitude", "Latitude must be between -90 and 90.");
  }

  if (!isRealNumber(input.privateLongitude)) {
    errors.add("privateLongitude", "Enter a longitude.");
  } else if (!isWithin(input.privateLongitude, -180, 180)) {
    errors.add("privateLongitude", "Longitude must be between -180 and 180.");
  }

  // 0,0 is in the Atlantic. It is almost always an unfilled form rather
  // than a deliberate choice, and it would place a marker in the ocean.
  if (input.privateLatitude === 0 && input.privateLongitude === 0) {
    errors.add(
      "privateLatitude",
      "Set the property's real position — 0, 0 is in the middle of the ocean.",
    );
  }

  /* --- Address parts -------------------------------------------------- */

  if (
    input.postcode !== undefined &&
    input.postcode.trim() !== "" &&
    !POSTCODE_PATTERN.test(input.postcode.trim())
  ) {
    errors.add("postcode", "A postcode is four digits, for example 3064.");
  }

  /* --- Visibility ----------------------------------------------------- */

  if (!VISIBILITIES.includes(input.locationVisibility)) {
    errors.add("locationVisibility", "Choose how precisely to show the location.");
  }

  if (!MARKER_MODES.includes(input.publicMarkerMode)) {
    errors.add("publicMarkerMode", "Choose automatic or manual marker placement.");
  }

  // Mirrors the `approximate_requires_radius` constraint.
  if (input.locationVisibility === "approximate") {
    if (!isPrivacyRadius(input.privacyRadiusMeters)) {
      errors.add(
        "privacyRadiusMeters",
        "Choose a privacy radius for an approximate location.",
      );
    }
  }

  /* --- Manual marker -------------------------------------------------- */
  // Mirrors the `manual_requires_coordinates` constraint.

  if (input.publicMarkerMode === "manual") {
    const hasLatitude = isRealNumber(input.manualPublicLatitude);
    const hasLongitude = isRealNumber(input.manualPublicLongitude);

    if (!hasLatitude || !hasLongitude) {
      errors.add(
        "manualPublicLatitude",
        "Manual placement needs both a latitude and a longitude.",
      );
    } else {
      if (!isWithin(input.manualPublicLatitude as number, -90, 90)) {
        errors.add(
          "manualPublicLatitude",
          "Manual latitude must be between -90 and 90.",
        );
      }

      if (!isWithin(input.manualPublicLongitude as number, -180, 180)) {
        errors.add(
          "manualPublicLongitude",
          "Manual longitude must be between -180 and 180.",
        );
      }
    }

    // `hidden` publishes no marker at all, so a hand-placed one is
    // unreachable. Allowed by the database, but worth saying plainly.
    if (input.locationVisibility === "hidden") {
      errors.add(
        "publicMarkerMode",
        "A hidden location publishes no marker, so manual placement has no effect. Choose automatic, or change the visibility.",
      );
    }
  }

  return errors.isEmpty ? valid(normaliseLocation(input)) : invalid(errors.all);
}

/** Trims address parts and drops empty optional strings. */
export function normaliseLocation(input: LocationInput): LocationInput {
  const optional = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  };

  return {
    ...input,
    houseNumber: optional(input.houseNumber),
    street: optional(input.street),
    postcode: optional(input.postcode),
    suburbReference: optional(input.suburbReference),
  };
}
