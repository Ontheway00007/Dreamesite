"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { handleAdminError } from "@/lib/admin/errors";
import {
  validateLocation,
  type LocationInput,
} from "@/lib/admin/validation/location";
import { callRpc } from "@/lib/admin/rpc";
import { summarise, type FieldError } from "@/lib/admin/validation/result";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPublicLocation,
  toPublicLocationRow,
} from "@/lib/properties/projection";
import type {
  PropertyLocationSettingsRow,
  PropertyPrivateLocationsRow,
} from "@/types/database";

/**
 * Location and privacy saving.
 *
 * ## Why this goes through a database function
 *
 * Saving a location changes three tables: the stored position, the privacy
 * settings, and the generated public projection. Written as three separate
 * statements — which is what this action used to do — a failure on the third
 * leaves the first two committed. The result is a property whose stored
 * position has moved but whose published marker still reflects the previous
 * settings, or whose visibility says `hidden` while a coordinate from the
 * previous save is still readable by anonymous visitors.
 *
 * That is not a cosmetic inconsistency. It is the precise failure mode the
 * privacy system exists to prevent.
 *
 * `save_property_location` (migration 0008) performs all three writes plus
 * the audit entry inside one transaction, so they commit together or not at
 * all.
 *
 * ## Where the privacy algorithm lives
 *
 * Still in TypeScript, in `lib/properties/privacy.ts`. This action derives
 * the projection *before* the call and passes the result in. The database
 * function stores what it is given and never recomputes it — a second
 * implementation in SQL would be a second definition of what may be
 * published, and the two would drift.
 */

export interface LocationFormData {
  readonly privateLatitude: number;
  readonly privateLongitude: number;
  readonly houseNumber?: string;
  readonly street?: string;
  readonly postcode?: string;
  readonly locationVisibility: "exact" | "approximate" | "suburb" | "hidden";
  readonly privacyRadiusMeters: 100 | 250 | 500 | 1000 | 2000 | 5000;
  readonly publicMarkerMode: "automatic" | "manual";
  readonly manualPublicLatitude?: number;
  readonly manualPublicLongitude?: number;
  readonly showHouseNumber: boolean;
  readonly showStreet: boolean;
  readonly showSuburb: boolean;
  readonly showPostcode: boolean;
  readonly allowDirections?: boolean;
  readonly suburbReference?: string;
}

export interface LocationActionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly fieldErrors?: readonly FieldError[];
}

export async function saveLocationAction(
  propertyId: string,
  data: LocationFormData,
): Promise<LocationActionResult> {
  await requireAdmin();

  if (!propertyId) {
    return {
      success: false,
      error: "Save the property before setting its location.",
    };
  }

  /* --- Validate before touching the database ------------------------- */

  const validation = validateLocation(data as LocationInput);

  if (!validation.ok) {
    return {
      success: false,
      error: summarise(validation.errors),
      fieldErrors: validation.errors,
    };
  }

  const input = validation.value;
  const supabase = await createAdminClient();

  /* --- The projection needs the property's own suburb and state ------ */

  const { data: propertyData, error: propertyError } = await supabase
    .from("properties")
    .select("name, suburb, state, slug")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) {
    return {
      success: false,
      error: handleAdminError(
        `Loading property ${propertyId} before location save`,
        propertyError,
        "Could not load this property. Please try again.",
      ),
    };
  }

  if (!propertyData) {
    return {
      success: false,
      error: "That property no longer exists. It may have been deleted.",
    };
  }

  const property = propertyData as unknown as {
    name: string;
    suburb: string;
    state: string;
    slug: string;
  };

  /* --- Derive the projection with the canonical pipeline -------------- */
  //
  // These row objects exist only to feed `buildPublicLocation`, which takes
  // database-shaped input. Nothing here is written — the RPC below does all
  // the writing.

  const isApproximate = input.locationVisibility === "approximate";
  const isManual = input.publicMarkerMode === "manual";

  const radius = isApproximate ? input.privacyRadiusMeters : null;
  const manualLatitude = isManual ? (input.manualPublicLatitude ?? null) : null;
  const manualLongitude = isManual ? (input.manualPublicLongitude ?? null) : null;

  const now = new Date().toISOString();

  const settingsRow: PropertyLocationSettingsRow = {
    property_id: propertyId,
    location_visibility: input.locationVisibility,
    privacy_radius_meters: radius,
    public_marker_mode: input.publicMarkerMode,
    manual_public_latitude: manualLatitude,
    manual_public_longitude: manualLongitude,
    suburb_reference: input.suburbReference ?? null,
    show_house_number: input.showHouseNumber,
    show_street: input.showStreet,
    show_suburb: input.showSuburb,
    show_postcode: input.showPostcode,
    allow_directions: input.allowDirections ?? null,
    created_at: now,
    updated_at: now,
  };

  const privateRow: PropertyPrivateLocationsRow = {
    property_id: propertyId,
    private_latitude: input.privateLatitude,
    private_longitude: input.privateLongitude,
    house_number: input.houseNumber ?? null,
    street: input.street ?? null,
    postcode: input.postcode ?? null,
    created_at: now,
    updated_at: now,
  };

  const publicLocation = buildPublicLocation({
    propertyId,
    propertyName: property.name,
    suburb: property.suburb,
    state: property.state,
    postcode: input.postcode ?? "",
    settings: settingsRow,
    privateLocation: privateRow,
  });

  const projection = toPublicLocationRow(propertyId, publicLocation);

  /* --- One transactional call ---------------------------------------- */

  const { error: rpcError } = await callRpc(supabase, "save_property_location", {
    p_property_id: propertyId,
    p_private_latitude: input.privateLatitude,
    p_private_longitude: input.privateLongitude,
    p_house_number: input.houseNumber ?? null,
    p_street: input.street ?? null,
    p_postcode: input.postcode ?? null,
    p_location_visibility: input.locationVisibility,
    p_privacy_radius_meters: radius,
    p_public_marker_mode: input.publicMarkerMode,
    p_manual_public_latitude: manualLatitude,
    p_manual_public_longitude: manualLongitude,
    p_suburb_reference: input.suburbReference ?? null,
    p_show_house_number: input.showHouseNumber,
    p_show_street: input.showStreet,
    p_show_suburb: input.showSuburb,
    p_show_postcode: input.showPostcode,
    p_allow_directions: input.allowDirections ?? null,
    p_public_latitude: projection.public_latitude,
    p_public_longitude: projection.public_longitude,
    p_public_address: projection.public_address,
    p_marker_mode: projection.marker_mode,
    p_location_label: projection.location_label,
    p_accuracy_note: projection.accuracy_note,
    p_public_allow_directions: projection.allow_directions,
  });

  if (rpcError) {
    return {
      success: false,
      error: handleAdminError(
        `Atomic location save for property ${propertyId}`,
        rpcError,
        "Could not save the location. No changes were made.",
      ),
    };
  }

  /* --- Refresh every surface that reads a location -------------------- */

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath(`/properties/${property.slug}`);
  revalidatePath("/");

  return { success: true };
}
