import type {
  AddressVisibility,
  LocationVisibility,
  PrivacyRadiusMeters,
  PublicMarkerMode,
} from "@/types";

/**
 * Option metadata for the privacy controls.
 *
 * This is the vocabulary the future admin dashboard will render — selects,
 * radio groups and toggles built from these arrays rather than from strings
 * typed into a form. Keeping it beside the rules means the dashboard and the
 * public site can never describe the same setting differently.
 *
 * This file deliberately contains no UI.
 */

export interface PrivacyOption<Value> {
  readonly value: Value;
  readonly label: string;
  /** Sentence an administrator reads when choosing this option. */
  readonly description: string;
}

export const locationVisibilityOptions: ReadonlyArray<
  PrivacyOption<LocationVisibility>
> = [
  {
    value: "exact",
    label: "Exact",
    description:
      "Publish the stored position. Only for homes cleared for exact display.",
  },
  {
    value: "approximate",
    label: "Approximate",
    description:
      "Publish a fixed position within the chosen radius of the home.",
  },
  {
    value: "suburb",
    label: "Suburb only",
    description:
      "Publish the suburb's reference position. Reveals nothing about the home.",
  },
  {
    value: "hidden",
    label: "Hidden",
    description:
      "Publish no marker. The home still appears in lists and searches.",
  },
] as const;

export const privacyRadiusOptions: readonly PrivacyRadiusMeters[] = [
  100, 250, 500, 1000, 2000, 5000,
] as const;

export function privacyRadiusLabel(radius: PrivacyRadiusMeters): string {
  return radius >= 1000 ? `${radius / 1000} km` : `${radius} m`;
}

/** Runtime guard for values arriving from a form or a database row. */
export function isPrivacyRadius(value: unknown): value is PrivacyRadiusMeters {
  return (privacyRadiusOptions as readonly unknown[]).includes(value);
}

export function isLocationVisibility(
  value: unknown,
): value is LocationVisibility {
  return locationVisibilityOptions.some((option) => option.value === value);
}

export const publicMarkerModeOptions: ReadonlyArray<
  PrivacyOption<PublicMarkerMode>
> = [
  {
    value: "automatic",
    label: "Automatic",
    description: "Place the marker from the stored position and the rules above.",
  },
  {
    value: "manual",
    label: "Manual",
    description:
      "Place the marker by hand. The stored position stays unchanged.",
  },
] as const;

/**
 * Ready-made address combinations, matching how they read once published.
 * An administrator can still toggle the four parts individually.
 */
export const addressVisibilityPresets: ReadonlyArray<
  PrivacyOption<AddressVisibility>
> = [
  {
    value: { houseNumber: true, street: true, suburb: true, postcode: true },
    label: "Full address",
    description: "27 Example Street, Craigieburn VIC 3064",
  },
  {
    value: { houseNumber: false, street: true, suburb: true, postcode: true },
    label: "Street without number",
    description: "Example Street, Craigieburn VIC 3064",
  },
  {
    value: { houseNumber: false, street: false, suburb: true, postcode: true },
    label: "Suburb and postcode",
    description: "Craigieburn VIC 3064",
  },
  {
    value: { houseNumber: false, street: false, suburb: true, postcode: false },
    label: "Suburb only",
    description: "Craigieburn VIC",
  },
  {
    value: { houseNumber: false, street: false, suburb: false, postcode: false },
    label: "No address",
    description: "Nothing published",
  },
] as const;
