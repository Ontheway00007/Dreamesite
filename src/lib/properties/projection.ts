/**
 * Server-only projection generator.
 *
 * Rebuilds `property_public_locations` for a property from its stored
 * private position + privacy settings. Runs the canonical privacy pipeline
 * rather than duplicating it, and returns the row that should be upserted.
 * Pure: no I/O and no database client of any kind. The caller reads the rows,
 * calls this, and writes the result through an admin-checked function — see
 * `generate-public-locations.ts`. Nothing here needs elevated privileges,
 * because nothing here talks to the database.
 */

import { toPublicProperty } from "@/lib/properties/privacy";
import type {
  PropertyLocationSettingsRow,
  PropertyPrivateLocationsRow,
  PropertyPublicLocationsRow,
} from "@/types/database";
import type { PublicPropertyLocation } from "@/types";

export interface ProjectionInput {
  readonly propertyId: string;
  readonly propertyName: string;
  readonly suburb: string;
  readonly state: string;
  readonly postcode: string;
  readonly settings: PropertyLocationSettingsRow;
  readonly privateLocation: PropertyPrivateLocationsRow;
}

/**
 * Maps database-shaped settings into the privacy pipeline's input and runs
 * the transformation. Pure — no network, no database, no writes.
 */
export function buildPublicLocation(
  input: ProjectionInput,
): PublicPropertyLocation {
  const publicProjection = toPublicProperty({
    id: input.propertyId,
    slug: "",
    name: input.propertyName,
    summary: "",
    suburb: input.suburb,
    state: input.state,
    status: "move-in-ready",
    bedrooms: 0,
    bathrooms: 0,
    carSpaces: 0,
    landSize: 0,
    placeholderVariant: "single-storey",
    isFeatured: false,
    privateLatitude: input.privateLocation.private_latitude,
    privateLongitude: input.privateLocation.private_longitude,
    address: {
      houseNumber: input.privateLocation.house_number ?? undefined,
      street: input.privateLocation.street ?? undefined,
      postcode: input.postcode,
    },
    privacy: {
      locationVisibility: input.settings.location_visibility,
      privacyRadiusMeters: input.settings.privacy_radius_meters ?? 500,
      publicMarkerMode: input.settings.public_marker_mode,
      manualLatitude: input.settings.manual_public_latitude ?? undefined,
      manualLongitude: input.settings.manual_public_longitude ?? undefined,
      addressVisibility: {
        houseNumber: input.settings.show_house_number,
        street: input.settings.show_street,
        suburb: input.settings.show_suburb,
        postcode: input.settings.show_postcode,
      },
      allowDirections: input.settings.allow_directions ?? undefined,
      suburbReference: input.settings.suburb_reference ?? undefined,
    },
  });

  return publicProjection.location;
}

/**
 * The exact shape `property_public_locations` expects, without the generated
 * timestamp the database fills in.
 */
export function toPublicLocationRow(
  propertyId: string,
  location: PublicPropertyLocation,
): Omit<PropertyPublicLocationsRow, "generated_at" | "stale_since"> {
  return {
    property_id: propertyId,
    location_visibility: location.visibility,
    public_latitude: location.publicLatitude ?? null,
    public_longitude: location.publicLongitude ?? null,
    public_address: location.address,
    marker_mode: location.markerMode,
    location_label: location.label,
    accuracy_note: location.accuracyNote,
    allow_directions: location.allowDirections,
  };
}
