"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPublicLocation,
  toPublicLocationRow,
} from "@/lib/properties/projection";
import type { PropertyLocationSettingsRow, PropertyPrivateLocationsRow } from "@/types/database";

/**
 * Server Action for saving location data and regenerating the public projection.
 *
 * This action:
 * 1. Saves private coordinates to property_private_locations
 * 2. Saves privacy settings to property_location_settings
 * 3. Runs the projection pipeline (same algorithm as generate-public-locations.ts)
 * 4. Upserts the result into property_public_locations
 *
 * Uses the authenticated admin client (not service-role) because the admin
 * RLS policies now allow access to private tables for admins.
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
}

export async function saveLocationAction(
  propertyId: string,
  data: LocationFormData,
): Promise<LocationActionResult> {
  await requireAdmin();

  // Validate coordinates
  if (
    !Number.isFinite(data.privateLatitude) ||
    Math.abs(data.privateLatitude) > 90
  ) {
    return { success: false, error: "Latitude must be between -90 and 90." };
  }
  if (
    !Number.isFinite(data.privateLongitude) ||
    Math.abs(data.privateLongitude) > 180
  ) {
    return { success: false, error: "Longitude must be between -180 and 180." };
  }

  // Validate approximate requires radius
  if (data.locationVisibility === "approximate" && !data.privacyRadiusMeters) {
    return { success: false, error: "Approximate visibility requires a privacy radius." };
  }

  // Validate manual requires coordinates
  if (data.publicMarkerMode === "manual") {
    if (data.manualPublicLatitude === undefined || data.manualPublicLongitude === undefined) {
      return { success: false, error: "Manual marker mode requires manual coordinates." };
    }
  }

  const supabase = await createAdminClient();

  // Get property info for the projection
  const { data: property } = await supabase
    .from("properties")
    .select("name, suburb, state, slug")
    .eq("id", propertyId)
    .single();

  if (!property) {
    return { success: false, error: "Property not found." };
  }

  const propertyRow = property as unknown as { name: string; suburb: string; state: string; slug: string };

  // Upsert private location
  const privateLocationPayload: unknown = {
    property_id: propertyId,
    private_latitude: data.privateLatitude,
    private_longitude: data.privateLongitude,
    house_number: data.houseNumber || null,
    street: data.street || null,
    postcode: data.postcode || null,
  };

  const { error: locError } = await (
    supabase.from("property_private_locations") as unknown as {
      upsert(values: unknown, options: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
    }
  ).upsert(privateLocationPayload, { onConflict: "property_id" });

  if (locError) {
    return { success: false, error: `Failed to save coordinates: ${locError.message}` };
  }

  // Upsert location settings
  const settingsPayload: unknown = {
    property_id: propertyId,
    location_visibility: data.locationVisibility,
    privacy_radius_meters: data.locationVisibility === "approximate" ? data.privacyRadiusMeters : null,
    public_marker_mode: data.publicMarkerMode,
    manual_public_latitude: data.publicMarkerMode === "manual" ? (data.manualPublicLatitude ?? null) : null,
    manual_public_longitude: data.publicMarkerMode === "manual" ? (data.manualPublicLongitude ?? null) : null,
    suburb_reference: data.suburbReference || null,
    show_house_number: data.showHouseNumber,
    show_street: data.showStreet,
    show_suburb: data.showSuburb,
    show_postcode: data.showPostcode,
    allow_directions: data.allowDirections ?? null,
  };

  const { error: settingsError } = await (
    supabase.from("property_location_settings") as unknown as {
      upsert(values: unknown, options: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
    }
  ).upsert(settingsPayload, { onConflict: "property_id" });

  if (settingsError) {
    return { success: false, error: `Failed to save privacy settings: ${settingsError.message}` };
  }

  // Regenerate public projection using the existing pipeline
  const settings: PropertyLocationSettingsRow = {
    property_id: propertyId,
    location_visibility: data.locationVisibility,
    privacy_radius_meters: data.locationVisibility === "approximate" ? data.privacyRadiusMeters : null,
    public_marker_mode: data.publicMarkerMode,
    manual_public_latitude: data.publicMarkerMode === "manual" ? (data.manualPublicLatitude ?? null) : null,
    manual_public_longitude: data.publicMarkerMode === "manual" ? (data.manualPublicLongitude ?? null) : null,
    suburb_reference: data.suburbReference || null,
    show_house_number: data.showHouseNumber,
    show_street: data.showStreet,
    show_suburb: data.showSuburb,
    show_postcode: data.showPostcode,
    allow_directions: data.allowDirections ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const privateLocationRow: PropertyPrivateLocationsRow = {
    property_id: propertyId,
    private_latitude: data.privateLatitude,
    private_longitude: data.privateLongitude,
    house_number: data.houseNumber || null,
    street: data.street || null,
    postcode: data.postcode || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const publicLocation = buildPublicLocation({
    propertyId,
    propertyName: propertyRow.name,
    suburb: propertyRow.suburb,
    state: propertyRow.state,
    postcode: data.postcode ?? "",
    settings,
    privateLocation: privateLocationRow,
  });

  const publicRow = toPublicLocationRow(propertyId, publicLocation);

  // Upsert public projection
  const projectionPayload: unknown = {
    ...publicRow,
    generated_at: new Date().toISOString(),
  };

  const { error: projError } = await (
    supabase.from("property_public_locations") as unknown as {
      upsert(values: unknown, options: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
    }
  ).upsert(projectionPayload, { onConflict: "property_id" });

  if (projError) {
    return { success: false, error: `Failed to save public projection: ${projError.message}` };
  }

  await logAuditEvent({
    action: "updated",
    entityType: "property_location",
    entityId: propertyId,
    metadata: { visibility: data.locationVisibility },
  });

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${propertyRow.slug}`);
  revalidatePath("/");

  return { success: true };
}
