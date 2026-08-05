import "server-only";

import { getSuburbReference } from "@/content/suburb-references";
import { callRpc } from "@/lib/admin/rpc";
import { logAdminError, toFriendlyError } from "@/lib/admin/errors";
import {
  buildPublicLocation,
  toPublicLocationRow,
  type ProjectionInput,
} from "@/lib/properties/projection";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  PropertyLocationSettingsRow,
  PropertyPrivateLocationsRow,
} from "@/types/database";

/**
 * Regenerates public location projections.
 *
 * Needed when the privacy algorithm itself changes: every stored projection was
 * derived by the previous version and has to be recomputed. Nothing else should
 * call this — an ordinary privacy edit goes through `saveLocationAction`, which
 * derives and writes in one step.
 *
 * ## What this used to be, and why it was dangerous
 *
 * It read the property, the private location and the settings with the
 * **service role**, computed the projection, and upserted it unconditionally.
 * Three problems, in increasing order of seriousness:
 *
 * 1. Nothing called it. It was privileged code with no caller — the worst kind
 *    to leave lying around, because nobody exercising it means nobody noticing
 *    when it breaks.
 * 2. The service role bypasses RLS, so a bug here could write anything.
 * 3. **A location save committing between the read and the write was silently
 *    undone.** The direction of that failure is the worst available: an
 *    administrator changing visibility to `hidden` could have the previous
 *    public coordinate restored underneath them, by a background job, with no
 *    error anywhere.
 *
 * ## What it is now
 *
 * The service role is gone. This runs as the signed-in administrator, so RLS
 * applies to every read and `save_regenerated_public_location` enforces
 * `is_admin()` on the write. The service-role key is no longer used by any
 * module in the application.
 *
 * The write is version-checked. Every projection is derived from three rows, so
 * all three `updated_at` values are read first and passed to the RPC, which
 * takes the property lock, confirms none has moved, and refuses with `PT409`
 * otherwise. A regeneration cannot overwrite a decision made after it started.
 *
 * ## Why the privacy algorithm is still in TypeScript
 *
 * Unchanged, and deliberately so. `buildPublicLocation` in
 * `lib/properties/privacy.ts` is the single definition of what may be published.
 * The RPC stores what it is given and verifies the inputs are current; it does
 * not decide anything about privacy. A second implementation in SQL would be a
 * second definition, and the two would drift.
 */

/** Why one property's projection was not rewritten. */
export type ProjectionSkipReason =
  /** No private location or no settings: there is nothing to project. */
  | "not-configured"
  /** Another write landed first. The caller may retry. */
  | "conflict"
  | "failed";

export interface ProjectionResult {
  readonly propertyId: string;
  readonly success: boolean;
  readonly reason?: ProjectionSkipReason;
  /** Administrator-facing, already passed through the error mapper. */
  readonly error?: string;
}

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

/**
 * Regenerates one property's projection.
 *
 * Returns rather than throws, because the bulk path needs to report on every
 * property rather than stopping at the first that has moved.
 */
export async function regeneratePublicLocation(
  propertyId: string,
  client?: AdminClient,
): Promise<ProjectionResult> {
  const supabase = client ?? (await createAdminClient());

  const { data: propertyData, error: propertyError } = await supabase
    .from("properties")
    .select("id, name, suburb, state, updated_at")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) {
    logAdminError(`Regenerating projection: reading property ${propertyId}`, propertyError);
    return { propertyId, success: false, reason: "failed", error: "Could not read the property." };
  }

  if (!propertyData) {
    return { propertyId, success: false, reason: "failed", error: "That property no longer exists." };
  }

  const property = propertyData as unknown as {
    name: string;
    suburb: string;
    state: string;
    updated_at: string;
  };

  const { data: privateData, error: privateError } = await supabase
    .from("property_private_locations")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();

  if (privateError) {
    logAdminError(`Regenerating projection: reading private location ${propertyId}`, privateError);
    return { propertyId, success: false, reason: "failed", error: "Could not read the stored position." };
  }

  const { data: settingsData, error: settingsError } = await supabase
    .from("property_location_settings")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();

  if (settingsError) {
    logAdminError(`Regenerating projection: reading settings ${propertyId}`, settingsError);
    return { propertyId, success: false, reason: "failed", error: "Could not read the privacy settings." };
  }

  // A property with no location configured has no projection to regenerate.
  // Not an error: most drafts are in exactly this state.
  if (!privateData || !settingsData) {
    return { propertyId, success: false, reason: "not-configured" };
  }

  const privateLocation = privateData as unknown as PropertyPrivateLocationsRow;
  const settings = settingsData as unknown as PropertyLocationSettingsRow;

  const input: ProjectionInput = {
    propertyId,
    propertyName: property.name,
    suburb: property.suburb,
    state: property.state,
    postcode: privateLocation.postcode ?? "",
    settings,
    privateLocation,
  };

  const projection = toPublicLocationRow(propertyId, buildPublicLocation(input));

  const { error: rpcError } = await callRpc(
    supabase,
    "save_regenerated_public_location",
    {
      p_property_id: propertyId,
      // All three versions the derivation above depended on.
      p_expected_property_updated_at: property.updated_at,
      p_expected_private_updated_at: privateLocation.updated_at,
      p_expected_settings_updated_at: settings.updated_at,
      p_location_visibility: projection.location_visibility,
      p_public_latitude: projection.public_latitude,
      p_public_longitude: projection.public_longitude,
      p_public_address: projection.public_address,
      p_marker_mode: projection.marker_mode,
      p_location_label: projection.location_label,
      p_accuracy_note: projection.accuracy_note,
      p_allow_directions: projection.allow_directions,
    },
  );

  if (rpcError) {
    // PT409 means somebody changed the location while this was being computed.
    // Expected under load, and not a fault — the newer decision stands.
    if (rpcError.code === "PT409") {
      return {
        propertyId,
        success: false,
        reason: "conflict",
        error: toFriendlyError(rpcError),
      };
    }

    logAdminError(`Regenerating projection: writing ${propertyId}`, rpcError);

    return {
      propertyId,
      success: false,
      reason: "failed",
      error: toFriendlyError(rpcError, "Could not write the projection."),
    };
  }

  return { propertyId, success: true };
}

export interface BulkProjectionSummary {
  readonly attempted: number;
  readonly regenerated: number;
  readonly notConfigured: number;
  readonly conflicted: number;
  readonly failed: number;
  readonly results: readonly ProjectionResult[];
}

/**
 * Regenerates every configured property's projection.
 *
 * Sequential on purpose. Each property takes its own advisory lock, so running
 * them in parallel would contend with whatever administrators are doing in the
 * dashboard at the time. Regeneration is rare and not urgent; the interactive
 * path is neither.
 *
 * Conflicts are reported, not retried. A property that changed under the job has
 * a projection derived from data newer than anything here — retrying would be
 * racing the administrator for the right to describe their own property, and
 * losing that race is the correct outcome. The summary says how many, so the job
 * can simply be run again.
 */
export async function regenerateAllPublicLocations(): Promise<BulkProjectionSummary> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("properties")
    .select("id")
    .order("created_at", { ascending: true });

  if (error) {
    logAdminError("Regenerating projections: listing properties", error);

    return {
      attempted: 0,
      regenerated: 0,
      notConfigured: 0,
      conflicted: 0,
      failed: 1,
      results: [
        {
          propertyId: "all",
          success: false,
          reason: "failed",
          error: "Could not list the properties.",
        },
      ],
    };
  }

  const ids = ((data ?? []) as unknown as Array<{ id: string }>).map(
    (row) => row.id,
  );

  const results: ProjectionResult[] = [];

  for (const id of ids) {
    results.push(await regeneratePublicLocation(id, supabase));
  }

  return {
    attempted: results.length,
    regenerated: results.filter((result) => result.success).length,
    notConfigured: results.filter((r) => r.reason === "not-configured").length,
    conflicted: results.filter((r) => r.reason === "conflict").length,
    failed: results.filter((r) => r.reason === "failed").length,
    results,
  };
}

/**
 * Suburb names with no reference position.
 *
 * A suburb-only marker is placed at the suburb's reference centre, so a suburb
 * without one cannot be projected. The admin location tab checks this before
 * offering "suburb" visibility.
 */
export function getMissingSuburbReferences(suburbs: string[]): string[] {
  return suburbs.filter((suburb) => getSuburbReference(suburb) === null);
}
