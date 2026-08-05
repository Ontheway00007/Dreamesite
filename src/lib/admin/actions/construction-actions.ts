"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";
import { getNextContentSortOrder } from "@/lib/admin/content-repository";
import { handleAdminError, logAdminError } from "@/lib/admin/errors";
import { callRpc } from "@/lib/admin/rpc";
import {
  defaultProgressForStatus,
  validateConstructionUpdate,
  type ConstructionInput,
} from "@/lib/admin/validation/construction";
import { validateReorderIds } from "@/lib/media/validation";
import { summarise, type FieldError } from "@/lib/admin/validation/result";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConstructionUpdatesRow } from "@/types/database";

/**
 * Construction update actions.
 *
 * Every one follows the established pattern: verify the administrator, validate
 * through the shared module, confirm the row belongs to the property, act,
 * audit, revalidate. The actions stay thin — no validation logic lives here.
 */

export interface ContentActionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly fieldErrors?: readonly FieldError[];
  readonly id?: string;
}

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

function invalidResult(errors: readonly FieldError[]): ContentActionResult {
  return { success: false, error: summarise(errors), fieldErrors: errors };
}

/**
 * Loads an update only if it belongs to the given property.
 *
 * The IDOR guard for every action taking an update id. An id from another
 * property returns null and the action refuses.
 */
async function loadOwnedUpdate(
  supabase: AdminClient,
  propertyId: string,
  updateId: string,
): Promise<ConstructionUpdatesRow | null> {
  const { data, error } = await supabase
    .from("construction_updates")
    .select("*")
    .eq("id", updateId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) {
    logAdminError(
      `Loading construction update ${updateId} for property ${propertyId}`,
      error,
    );
    return null;
  }

  return (data as unknown as ConstructionUpdatesRow) ?? null;
}

async function loadSlug(
  supabase: AdminClient,
  propertyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("properties")
    .select("slug")
    .eq("id", propertyId)
    .maybeSingle();

  return (data as unknown as { slug: string } | null)?.slug ?? null;
}

/** The build timeline appears on the property page and nowhere else public. */
function revalidateConstruction(propertyId: string, slug: string | null): void {
  revalidatePath(`/admin/properties/${propertyId}`);

  if (slug) {
    revalidatePath(`/properties/${slug}`);
  }
}

async function propertyExists(
  supabase: AdminClient,
  propertyId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle();

  return data !== null;
}

/* --- Create ----------------------------------------------------------- */

export async function createConstructionUpdate(
  propertyId: string,
  input: ConstructionInput,
): Promise<ContentActionResult> {
  await requireAdmin();

  const validation = validateConstructionUpdate(input);

  if (!validation.ok) {
    return invalidResult(validation.errors);
  }

  const value = validation.value;
  const supabase = await createAdminClient();

  if (!(await propertyExists(supabase, propertyId))) {
    return { success: false, error: "That property no longer exists." };
  }

  const sortOrder = await getNextContentSortOrder(
    propertyId,
    "construction_updates",
  );

  const row: Record<string, unknown> = {
    property_id: propertyId,
    stage: value.stage,
    title: value.title,
    description: value.description ?? null,
    status: value.status,
    // A status implies a progress figure; typing 100 for every completed stage
    // is busywork. An explicit value always wins.
    progress_value: value.progressValue ?? defaultProgressForStatus(value.status),
    occurred_at: value.occurredAt ?? null,
    sort_order: sortOrder,
    is_published: value.isPublished,
  };

  const { data: created, error } = await supabase
    .from("construction_updates")
    .insert(row as never)
    .select("id")
    .single();

  if (error || !created) {
    return {
      success: false,
      error: handleAdminError(
        `Creating construction update for property ${propertyId}`,
        error,
        // The most likely cause is the one-per-stage unique index, so the
        // fallback says so rather than offering a generic retry.
        "Could not add that update. This property may already have one for that stage.",
      ),
    };
  }

  const id = (created as unknown as { id: string }).id;

  await logAuditEvent({
    action: "created",
    entityType: "construction_update",
    entityId: id,
    metadata: { propertyId, stage: value.stage },
  });

  revalidateConstruction(propertyId, await loadSlug(supabase, propertyId));

  return { success: true, id };
}

/* --- Update ----------------------------------------------------------- */

export async function updateConstructionUpdate(
  propertyId: string,
  updateId: string,
  input: ConstructionInput,
): Promise<ContentActionResult> {
  await requireAdmin();

  const validation = validateConstructionUpdate(input);

  if (!validation.ok) {
    return invalidResult(validation.errors);
  }

  const value = validation.value;
  const supabase = await createAdminClient();
  const existing = await loadOwnedUpdate(supabase, propertyId, updateId);

  if (!existing) {
    return {
      success: false,
      error: "That update could not be found on this property.",
    };
  }

  const { error } = await supabase
    .from("construction_updates")
    .update({
      stage: value.stage,
      title: value.title,
      description: value.description ?? null,
      status: value.status,
      progress_value:
        value.progressValue ?? defaultProgressForStatus(value.status),
      occurred_at: value.occurredAt ?? null,
      is_published: value.isPublished,
    } as never)
    .eq("id", updateId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Updating construction update ${updateId}`,
        error,
        "Could not save that update. Another entry may already use that stage.",
      ),
    };
  }

  await logAuditEvent({
    action: "updated",
    entityType: "construction_update",
    entityId: updateId,
    metadata: { propertyId, stage: value.stage },
  });

  revalidateConstruction(propertyId, await loadSlug(supabase, propertyId));

  return { success: true, id: updateId };
}

/* --- Publish ---------------------------------------------------------- */

export async function setConstructionUpdatePublished(
  propertyId: string,
  updateId: string,
  isPublished: boolean,
): Promise<ContentActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedUpdate(supabase, propertyId, updateId);

  if (!existing) {
    return {
      success: false,
      error: "That update could not be found on this property.",
    };
  }

  const { error } = await supabase
    .from("construction_updates")
    .update({ is_published: isPublished } as never)
    .eq("id", updateId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Changing publish state of construction update ${updateId}`,
        error,
        "Could not change that update's visibility.",
      ),
    };
  }

  await logAuditEvent({
    action: isPublished ? "published" : "unpublished",
    entityType: "construction_update",
    entityId: updateId,
    metadata: { propertyId },
  });

  revalidateConstruction(propertyId, await loadSlug(supabase, propertyId));

  return { success: true, id: updateId };
}

/* --- Delete ----------------------------------------------------------- */

export async function deleteConstructionUpdate(
  propertyId: string,
  updateId: string,
): Promise<ContentActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedUpdate(supabase, propertyId, updateId);

  if (!existing) {
    return {
      success: false,
      error: "That update could not be found on this property.",
    };
  }

  const { error } = await supabase
    .from("construction_updates")
    .delete()
    .eq("id", updateId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Deleting construction update ${updateId}`,
        error,
        "Could not delete that update. Nothing was changed.",
      ),
    };
  }

  await logAuditEvent({
    action: "deleted",
    entityType: "construction_update",
    entityId: updateId,
    metadata: { propertyId, stage: existing.stage },
  });

  revalidateConstruction(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

/* --- Reorder ---------------------------------------------------------- */

export async function reorderConstructionUpdates(
  propertyId: string,
  orderedIds: readonly string[],
): Promise<ContentActionResult> {
  await requireAdmin();

  const ids = validateReorderIds(orderedIds);

  if (!ids.ok) {
    return invalidResult(ids.errors);
  }

  const supabase = await createAdminClient();

  // The RPC re-checks ownership for every id and rewrites the group in one
  // statement, so a partial order cannot be left behind.
  const { error } = await callRpc(supabase, "reorder_construction_updates", {
    p_property_id: propertyId,
    p_update_ids: [...orderedIds],
  });

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Reordering construction updates for property ${propertyId}`,
        error,
        "Could not save the new order. Nothing was changed.",
      ),
    };
  }

  await logAuditEvent({
    action: "reordered",
    entityType: "construction_update",
    metadata: { propertyId, count: orderedIds.length },
  });

  revalidateConstruction(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}
