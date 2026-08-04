/**
 * Server-only projection generator service.
 *
 * Reads private locations and privacy settings, runs the canonical privacy
 * pipeline, and upserts the resulting rows into `property_public_locations`.
 *
 * This module MUST NEVER run in the browser bundle:
 * - It requires the Supabase service-role key.
 * - It reads private tables (`property_private_locations`,
 *   `property_location_settings`) that have no anon/authenticated policies.
 * - It is the only code path that writes to `property_public_locations`.
 *
 * Usage:
 *   Called from admin actions (Phase 6) after any privacy setting change, or
 *   from a CLI script to regenerate all projections after a bulk edit.
 *
 * @module server-only
 */

import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSuburbReference } from "@/content/suburb-references";
import {
  buildPublicLocation,
  toPublicLocationRow,
  type ProjectionInput,
} from "@/lib/properties/projection";
import type {
  Database,
  PropertyLocationSettingsRow,
  PropertyPrivateLocationsRow,
} from "@/types/database";

/**
 * Creates a service-role Supabase client for privileged writes.
 *
 * This client bypasses RLS and must only be used in server-side code that
 * writes generated data. It is never cached between requests.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    throw new Error(
      "Cannot generate public locations: NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY must both be set.",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export interface ProjectionResult {
  readonly propertyId: string;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Regenerates the public location projection for a single property.
 *
 * Reads the private location and privacy settings, runs the canonical
 * transform, and upserts the result into `property_public_locations`.
 */
export async function generatePublicLocationForProperty(
  propertyId: string,
): Promise<ProjectionResult> {
  const client = createServiceClient();

  // Read the property's basic info (suburb, state, name)
  const { data: propertyData, error: propError } = await client
    .from("properties")
    .select("id, name, suburb, state")
    .eq("id", propertyId)
    .single();

  if (propError || !propertyData) {
    return {
      propertyId,
      success: false,
      error: `Property not found: ${propError?.message ?? "no row"}`,
    };
  }

  const property = propertyData as unknown as {
    id: string;
    name: string;
    suburb: string;
    state: string;
  };

  // Read private location
  const { data: privateLocationData, error: locError } = await client
    .from("property_private_locations")
    .select("*")
    .eq("property_id", propertyId)
    .single();

  if (locError || !privateLocationData) {
    return {
      propertyId,
      success: false,
      error: `Private location not found: ${locError?.message ?? "no row"}`,
    };
  }

  const privateLocation =
    privateLocationData as unknown as PropertyPrivateLocationsRow;

  // Read privacy settings
  const { data: settingsData, error: settingsError } = await client
    .from("property_location_settings")
    .select("*")
    .eq("property_id", propertyId)
    .single();

  if (settingsError || !settingsData) {
    return {
      propertyId,
      success: false,
      error: `Location settings not found: ${settingsError?.message ?? "no row"}`,
    };
  }

  const settings = settingsData as unknown as PropertyLocationSettingsRow;

  // Resolve the postcode from the private location
  const postcode = privateLocation.postcode ?? "";

  // Build the projection input
  const input: ProjectionInput = {
    propertyId,
    propertyName: property.name,
    suburb: property.suburb,
    state: property.state,
    postcode,
    settings,
    privateLocation,
  };

  // Run the canonical privacy pipeline
  const publicLocation = buildPublicLocation(input);
  const row = toPublicLocationRow(propertyId, publicLocation);

  // Upsert into property_public_locations.
  // The hand-maintained Database types use simplified generics that resolve to
  // `never` for insert/upsert. A proper `supabase gen types` run fixes this;
  // until then the assertion to `unknown` is the minimum escape hatch.
  const upsertPayload: unknown = { ...row, generated_at: new Date().toISOString() };
  const { error: upsertError } = await (
    client.from("property_public_locations") as unknown as {
      upsert(
        values: unknown,
        options: { onConflict: string },
      ): PromiseLike<{ error: { message: string } | null }>;
    }
  ).upsert(upsertPayload, { onConflict: "property_id" });

  if (upsertError) {
    return {
      propertyId,
      success: false,
      error: `Upsert failed: ${upsertError.message}`,
    };
  }

  return { propertyId, success: true };
}

/**
 * Regenerates public location projections for ALL properties that have both
 * a private location and privacy settings configured.
 *
 * Returns a result for each property attempted. Properties without private
 * locations or settings are silently skipped — they simply have no projection.
 */
export async function generateAllPublicLocations(): Promise<ProjectionResult[]> {
  const client = createServiceClient();

  // Find all properties that have both a private location and settings
  const { data: propertiesData, error } = await client
    .from("properties")
    .select("id, name, suburb, state");

  if (error || !propertiesData) {
    return [
      {
        propertyId: "all",
        success: false,
        error: `Failed to load properties: ${error?.message ?? "no data"}`,
      },
    ];
  }

  const properties = propertiesData as unknown as Array<{
    id: string;
    name: string;
    suburb: string;
    state: string;
  }>;

  const results: ProjectionResult[] = [];

  for (const property of properties) {
    const result = await generatePublicLocationForProperty(property.id);
    results.push(result);
  }

  return results;
}

/**
 * Validates that the suburb reference data required by the projection pipeline
 * is available. Returns suburb names that lack a reference position.
 *
 * Admin UIs should call this before accepting a "suburb" visibility setting
 * for a suburb without a reference.
 */
export function getMissingSuburbReferences(suburbs: string[]): string[] {
  return suburbs.filter((suburb) => getSuburbReference(suburb) === null);
}
