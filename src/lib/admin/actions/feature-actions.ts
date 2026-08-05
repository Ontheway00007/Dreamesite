"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";
import { getNextContentSortOrder } from "@/lib/admin/content-repository";
import { handleAdminError, logAdminError } from "@/lib/admin/errors";
import { callRpc } from "@/lib/admin/rpc";
import {
  validateFeature,
  type FeatureCategory,
  type FeatureInput,
} from "@/lib/admin/validation/features";
import { validateReorderIds } from "@/lib/media/validation";
import { summarise, type FieldError } from "@/lib/admin/validation/result";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PropertyFeaturesRow } from "@/types/database";

/**
 * Property feature actions.
 *
 * Features are the richer specification the fixed columns cannot hold. Same
 * pattern as everywhere else: admin check, shared validation, ownership check,
 * audit, revalidate.
 */

export interface FeatureActionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly fieldErrors?: readonly FieldError[];
  readonly id?: string;
}

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

function invalidResult(errors: readonly FieldError[]): FeatureActionResult {
  return { success: false, error: summarise(errors), fieldErrors: errors };
}

/** The IDOR guard: a feature id from another property returns null. */
async function loadOwnedFeature(
  supabase: AdminClient,
  propertyId: string,
  featureId: string,
): Promise<PropertyFeaturesRow | null> {
  const { data, error } = await supabase
    .from("property_features")
    .select("*")
    .eq("id", featureId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) {
    logAdminError(
      `Loading feature ${featureId} for property ${propertyId}`,
      error,
    );
    return null;
  }

  return (data as unknown as PropertyFeaturesRow) ?? null;
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

function revalidateFeatures(propertyId: string, slug: string | null): void {
  revalidatePath(`/admin/properties/${propertyId}`);

  if (slug) {
    revalidatePath(`/properties/${slug}`);
  }
}

/* --- Create ----------------------------------------------------------- */

export async function createFeature(
  propertyId: string,
  input: FeatureInput,
): Promise<FeatureActionResult> {
  await requireAdmin();

  const validation = validateFeature(input);

  if (!validation.ok) {
    return invalidResult(validation.errors);
  }

  const value = validation.value;
  const supabase = await createAdminClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) {
    return { success: false, error: "That property no longer exists." };
  }

  // Position within its own category, so adding an energy rating does not
  // reorder the inclusions.
  const sortOrder = await getNextContentSortOrder(
    propertyId,
    "property_features",
    { column: "category", value: value.category },
  );

  const row: Record<string, unknown> = {
    property_id: propertyId,
    category: value.category,
    label: value.label,
    value: value.value ?? null,
    sort_order: sortOrder,
    is_published: value.isPublished,
  };

  const { data: created, error } = await supabase
    .from("property_features")
    .insert(row as never)
    .select("id")
    .single();

  if (error || !created) {
    return {
      success: false,
      error: handleAdminError(
        `Creating feature for property ${propertyId}`,
        error,
        "Could not add that feature. Please try again.",
      ),
    };
  }

  const id = (created as unknown as { id: string }).id;

  await logAuditEvent({
    action: "created",
    entityType: "property_feature",
    entityId: id,
    metadata: { propertyId, category: value.category },
  });

  revalidateFeatures(propertyId, await loadSlug(supabase, propertyId));

  return { success: true, id };
}

/* --- Update ----------------------------------------------------------- */

export async function updateFeature(
  propertyId: string,
  featureId: string,
  input: FeatureInput,
): Promise<FeatureActionResult> {
  await requireAdmin();

  const validation = validateFeature(input);

  if (!validation.ok) {
    return invalidResult(validation.errors);
  }

  const value = validation.value;
  const supabase = await createAdminClient();
  const existing = await loadOwnedFeature(supabase, propertyId, featureId);

  if (!existing) {
    return {
      success: false,
      error: "That feature could not be found on this property.",
    };
  }

  // Moving between categories changes which section it appears under, so the
  // position within the new group has to be recomputed — keeping the old
  // `sort_order` would drop it into an arbitrary place.
  const changingCategory = existing.category !== value.category;
  const sortOrder = changingCategory
    ? await getNextContentSortOrder(propertyId, "property_features", {
        column: "category",
        value: value.category,
      })
    : existing.sort_order;

  const { error } = await supabase
    .from("property_features")
    .update({
      category: value.category,
      label: value.label,
      value: value.value ?? null,
      sort_order: sortOrder,
      is_published: value.isPublished,
    } as never)
    .eq("id", featureId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Updating feature ${featureId}`,
        error,
        "Could not save that feature. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "updated",
    entityType: "property_feature",
    entityId: featureId,
    metadata: { propertyId, category: value.category },
  });

  revalidateFeatures(propertyId, await loadSlug(supabase, propertyId));

  return { success: true, id: featureId };
}

/* --- Publish ---------------------------------------------------------- */

export async function setFeaturePublished(
  propertyId: string,
  featureId: string,
  isPublished: boolean,
): Promise<FeatureActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedFeature(supabase, propertyId, featureId);

  if (!existing) {
    return {
      success: false,
      error: "That feature could not be found on this property.",
    };
  }

  const { error } = await supabase
    .from("property_features")
    .update({ is_published: isPublished } as never)
    .eq("id", featureId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Changing publish state of feature ${featureId}`,
        error,
        "Could not change that feature's visibility.",
      ),
    };
  }

  await logAuditEvent({
    action: isPublished ? "published" : "unpublished",
    entityType: "property_feature",
    entityId: featureId,
    metadata: { propertyId },
  });

  revalidateFeatures(propertyId, await loadSlug(supabase, propertyId));

  return { success: true, id: featureId };
}

/* --- Delete ----------------------------------------------------------- */

export async function deleteFeature(
  propertyId: string,
  featureId: string,
): Promise<FeatureActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedFeature(supabase, propertyId, featureId);

  if (!existing) {
    return {
      success: false,
      error: "That feature could not be found on this property.",
    };
  }

  const { error } = await supabase
    .from("property_features")
    .delete()
    .eq("id", featureId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Deleting feature ${featureId}`,
        error,
        "Could not delete that feature. Nothing was changed.",
      ),
    };
  }

  await logAuditEvent({
    action: "deleted",
    entityType: "property_feature",
    entityId: featureId,
    metadata: { propertyId, category: existing.category },
  });

  revalidateFeatures(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

/* --- Reorder ---------------------------------------------------------- */

export async function reorderFeatures(
  propertyId: string,
  category: FeatureCategory,
  orderedIds: readonly string[],
): Promise<FeatureActionResult> {
  await requireAdmin();

  const ids = validateReorderIds(orderedIds);

  if (!ids.ok) {
    return invalidResult(ids.errors);
  }

  const supabase = await createAdminClient();

  // The RPC verifies property *and* category for every id, so an item cannot
  // be reordered into a different group.
  const { error } = await callRpc(supabase, "reorder_property_features", {
    p_property_id: propertyId,
    p_category: category,
    p_feature_ids: [...orderedIds],
  });

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Reordering ${category} features for property ${propertyId}`,
        error,
        "Could not save the new order. Nothing was changed.",
      ),
    };
  }

  await logAuditEvent({
    action: "reordered",
    entityType: "property_feature",
    metadata: { propertyId, category, count: orderedIds.length },
  });

  revalidateFeatures(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}
