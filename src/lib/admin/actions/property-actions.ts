"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { handleAdminError } from "@/lib/admin/errors";
import { callRpc } from "@/lib/admin/rpc";
import {
  validateProperty,
  type PropertyInput,
} from "@/lib/admin/validation/property";
import { summarise, type FieldError } from "@/lib/admin/validation/result";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Property CRUD.
 *
 * Each action follows the same four steps:
 *
 *   1. `requireAdmin()` — authorization, verified against `admin_users`
 *      server-side. RLS enforces it again at the database.
 *   2. Validate through `lib/admin/validation/property.ts`. The rules live
 *      there so API routes and importers can reuse them.
 *   3. Perform the write, translating any failure through
 *      `handleAdminError` so the browser never sees a database message.
 *   4. Record the audit entry and revalidate affected paths.
 *
 * The actions themselves stay thin: no validation logic, no error strings
 * beyond the operation-specific fallback.
 */

export interface PropertyActionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly fieldErrors?: readonly FieldError[];
  readonly id?: string;
  /** Set when publishing was refused because the record is incomplete. */
  readonly blockers?: readonly string[];
}

export type PropertyFormData = PropertyInput;

/** Columns duplicated by `duplicatePropertyAction`. See the note there. */
const DUPLICABLE_COLUMNS = `
  name, slug, summary, description_blocks, description_source, status,
  suburb, state, bedrooms, bathrooms, car_spaces, land_size_sqm,
  house_size_sqm, price_display, completion_label, display_priority,
  current_stage_id
`;

/** Maps validated input onto the `properties` row shape. */
function toRow(data: PropertyInput): Record<string, unknown> {
  return {
    name: data.name,
    slug: data.slug,
    summary: data.summary,
    description_blocks: data.descriptionBlocks ?? null,
    description_source: data.descriptionSource ?? null,
    status: data.status,
    suburb: data.suburb,
    state: data.state,
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    car_spaces: data.carSpaces,
    land_size_sqm: data.landSizeSqm,
    house_size_sqm: data.houseSizeSqm ?? null,
    price_display: data.priceDisplay ?? null,
    completion_label: data.completionLabel ?? null,
    is_featured: data.isFeatured,
    is_published: data.isPublished,
    display_priority: data.displayPriority,
    display_is_home: data.displayIsHome,
    display_opening_note: data.displayOpeningNote ?? null,
    current_stage_id: data.currentStageId ?? null,
  };
}

/**
 * Checks the slug is free.
 *
 * The database has a unique index and is the real authority; this exists so
 * the common case produces "that slug is taken" against the slug field
 * rather than a generic conflict message.
 */
async function slugIsTaken(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase.from("properties").select("id").eq("slug", slug);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data } = await query.maybeSingle();

  return data !== null;
}

/* --- Create ------------------------------------------------------------ */

export async function createPropertyAction(
  data: PropertyFormData,
): Promise<PropertyActionResult> {
  await requireAdmin();

  const validation = validateProperty(data);

  if (!validation.ok) {
    return {
      success: false,
      error: summarise(validation.errors),
      fieldErrors: validation.errors,
    };
  }

  const input = validation.value;
  const supabase = await createAdminClient();

  if (await slugIsTaken(supabase, input.slug)) {
    return {
      success: false,
      error: "That slug is already in use. Choose another.",
      fieldErrors: [{ field: "slug", message: "That slug is already in use." }],
    };
  }

  // A brand-new property has no location settings and therefore no public
  // projection, so it cannot be published in the same breath as being
  // created. Forcing it to draft here is clearer than letting the publish
  // gate reject it a moment later.
  const row = { ...toRow(input), is_published: false };

  const { data: created, error } = await supabase
    .from("properties")
    .insert(row as never)
    .select("id")
    .single();

  if (error || !created) {
    return {
      success: false,
      error: handleAdminError(
        "Creating property",
        error,
        "Could not create the property. Please try again.",
      ),
    };
  }

  const id = (created as unknown as { id: string }).id;

  await logAuditEvent({
    action: "created",
    entityType: "property",
    entityId: id,
    metadata: { name: input.name, slug: input.slug },
  });

  revalidatePath("/admin/properties");

  return { success: true, id };
}

/* --- Update ----------------------------------------------------------- */

export async function updatePropertyAction(
  id: string,
  data: PropertyFormData,
): Promise<PropertyActionResult> {
  await requireAdmin();

  const validation = validateProperty(data);

  if (!validation.ok) {
    return {
      success: false,
      error: summarise(validation.errors),
      fieldErrors: validation.errors,
    };
  }

  const input = validation.value;
  const supabase = await createAdminClient();

  if (await slugIsTaken(supabase, input.slug, id)) {
    return {
      success: false,
      error: "That slug is already in use by another property.",
      fieldErrors: [{ field: "slug", message: "That slug is already in use." }],
    };
  }

  // Turning `is_published` on through the general update path would bypass
  // the publish gate, so readiness is checked here too.
  if (input.isPublished) {
    const blockers = await readPublishBlockers(supabase, id);

    if (blockers.length > 0) {
      return {
        success: false,
        error: "This property is not ready to publish yet.",
        blockers,
      };
    }
  }

  const { error } = await supabase
    .from("properties")
    .update(toRow(input) as never)
    .eq("id", id);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Updating property ${id}`,
        error,
        "Could not save your changes. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "updated",
    entityType: "property",
    entityId: id,
    metadata: { name: input.name, slug: input.slug },
  });

  revalidateProperty(id, input.slug);

  return { success: true, id };
}

/* --- Delete ----------------------------------------------------------- */

export async function deletePropertyAction(
  id: string,
): Promise<PropertyActionResult> {
  await requireAdmin();
  const supabase = await createAdminClient();

  // Read the identity first: after the delete there is nothing left to
  // describe in the audit entry. Child rows go with it via ON DELETE CASCADE.
  const { data: existing } = await supabase
    .from("properties")
    .select("name, slug")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return {
      success: false,
      error: "That property no longer exists. It may already have been deleted.",
    };
  }

  const property = existing as unknown as { name: string; slug: string };

  const { error } = await supabase.from("properties").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Deleting property ${id}`,
        error,
        "Could not delete the property. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "deleted",
    entityType: "property",
    entityId: id,
    metadata: { name: property.name, slug: property.slug },
  });

  revalidateProperty(id, property.slug);

  return { success: true };
}

/* --- Publish / unpublish --------------------------------------------- */

/**
 * Reads the publish blockers reported by the database.
 *
 * The check lives in `property_publish_blockers` (migration 0008) rather
 * than here because it needs to see rows across three tables. Doing it in
 * one round trip also means the answer cannot be stale by the time the
 * update runs.
 */
async function readPublishBlockers(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  id: string,
): Promise<string[]> {
  const { data, error } = await callRpc(supabase, "property_publish_blockers", {
    p_property_id: id,
  });

  if (error) {
    // Fail closed: if readiness cannot be established, do not publish.
    handleAdminError(`Reading publish blockers for ${id}`, error);
    return ["Could not confirm this property is ready to publish."];
  }

  return data ?? [];
}

export async function publishPropertyAction(
  id: string,
): Promise<PropertyActionResult> {
  await requireAdmin();
  const supabase = await createAdminClient();

  const blockers = await readPublishBlockers(supabase, id);

  if (blockers.length > 0) {
    return {
      success: false,
      error: "This property is not ready to publish yet.",
      blockers,
    };
  }

  const { data: updated, error } = await supabase
    .from("properties")
    .update({ is_published: true } as never)
    .eq("id", id)
    .select("slug")
    .maybeSingle();

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Publishing property ${id}`,
        error,
        "Could not publish the property. Please try again.",
      ),
    };
  }

  if (!updated) {
    return { success: false, error: "That property no longer exists." };
  }

  await logAuditEvent({
    action: "published",
    entityType: "property",
    entityId: id,
  });

  revalidateProperty(id, (updated as unknown as { slug: string }).slug);

  return { success: true, id };
}

export async function unpublishPropertyAction(
  id: string,
): Promise<PropertyActionResult> {
  await requireAdmin();
  const supabase = await createAdminClient();

  // Unpublishing needs no readiness check — removing something from public
  // view is always safe.
  const { data: updated, error } = await supabase
    .from("properties")
    .update({ is_published: false } as never)
    .eq("id", id)
    .select("slug")
    .maybeSingle();

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Unpublishing property ${id}`,
        error,
        "Could not unpublish the property. Please try again.",
      ),
    };
  }

  if (!updated) {
    return { success: false, error: "That property no longer exists." };
  }

  await logAuditEvent({
    action: "unpublished",
    entityType: "property",
    entityId: id,
  });

  revalidateProperty(id, (updated as unknown as { slug: string }).slug);

  return { success: true, id };
}

/* --- Duplicate -------------------------------------------------------- */

/**
 * Duplicates the core property record only.
 *
 * ## Why core-only
 *
 * The alternative — copying images, resources, features and location — was
 * considered and rejected:
 *
 * - **Location must not be copied.** Two properties sharing one set of
 *   coordinates is wrong by construction, and copying the privacy settings
 *   would silently apply one owner's decision to a different home. The copy
 *   therefore starts with no location, and the publish gate requires the
 *   administrator to set one before it can go live.
 * - **Media must not be copied.** Storage objects would either be shared by
 *   reference — so deleting one property's photograph removes it from the
 *   other — or duplicated in the bucket, which is a storage cost incurred
 *   without being asked for.
 *
 * What a duplicate is *for* is reusing a floor plan's specifications on a
 * different lot. That is exactly the core record.
 *
 * The result is always a draft, and the UI says what was and was not copied.
 */
export async function duplicatePropertyAction(
  id: string,
): Promise<PropertyActionResult> {
  await requireAdmin();
  const supabase = await createAdminClient();

  const { data: sourceData, error: readError } = await supabase
    .from("properties")
    .select(DUPLICABLE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return {
      success: false,
      error: handleAdminError(
        `Reading property ${id} to duplicate`,
        readError,
        "Could not read the property to duplicate.",
      ),
    };
  }

  if (!sourceData) {
    return { success: false, error: "That property no longer exists." };
  }

  const source = sourceData as unknown as Record<string, unknown>;
  const sourceName = String(source.name ?? "Property");
  const sourceSlug = String(source.slug ?? "property");

  const copy = {
    ...source,
    name: truncate(`${sourceName} (copy)`, 200),
    slug: uniqueSlug(sourceSlug),
    // A copy is never featured, never a display home and never published:
    // each of those is a deliberate decision about a specific property.
    is_featured: false,
    is_published: false,
    display_is_home: false,
    display_opening_note: null,
  };

  const { data: created, error } = await supabase
    .from("properties")
    .insert(copy as never)
    .select("id")
    .single();

  if (error || !created) {
    return {
      success: false,
      error: handleAdminError(
        `Duplicating property ${id}`,
        error,
        "Could not duplicate the property. Please try again.",
      ),
    };
  }

  const newId = (created as unknown as { id: string }).id;

  await logAuditEvent({
    action: "created",
    entityType: "property",
    entityId: newId,
    metadata: { duplicatedFrom: id, scope: "core-only" },
  });

  revalidatePath("/admin/properties");

  return { success: true, id: newId };
}

/* --- Helpers ---------------------------------------------------------- */

/**
 * Derives a slug that will not collide.
 *
 * A short random suffix rather than `Date.now()`: two duplicates created in
 * the same millisecond would otherwise collide, and a timestamp in a URL
 * reads like a mistake.
 */
function uniqueSlug(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  const room = 100 - suffix.length - "-copy-".length;

  return `${base.slice(0, Math.max(1, room))}-copy-${suffix}`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/** Every surface that can show a property, in one place. */
function revalidateProperty(id: string, slug: string): void {
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${slug}`);
  revalidatePath("/");
}
