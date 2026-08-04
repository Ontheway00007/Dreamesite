"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server Actions for property CRUD.
 *
 * Every action:
 * 1. Verifies admin authorization (via requireAdmin → RLS)
 * 2. Validates input server-side
 * 3. Performs the database operation
 * 4. Logs the action to audit_log
 * 5. Revalidates relevant paths
 */

export interface PropertyActionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly id?: string;
}

export interface PropertyFormData {
  readonly name: string;
  readonly slug: string;
  readonly summary: string;
  readonly descriptionBlocks?: Array<{ id: string; text: string }>;
  readonly descriptionSource?: "written" | "ai-assisted";
  readonly status: string;
  readonly suburb: string;
  readonly state: string;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly carSpaces: number;
  readonly landSizeSqm: number;
  readonly houseSizeSqm?: number;
  readonly priceDisplay?: string;
  readonly completionLabel?: string;
  readonly isFeatured: boolean;
  readonly isPublished: boolean;
  readonly displayPriority: number;
  readonly displayIsHome: boolean;
  readonly displayOpeningNote?: string;
  readonly currentStageId?: string;
}

// --- Validation ---

function validateSlug(slug: string): string | null {
  if (!slug) return "Slug is required.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Slug must be lowercase letters, numbers, and hyphens only.";
  }
  if (slug.length > 100) return "Slug must be 100 characters or fewer.";
  return null;
}

function validateProperty(data: PropertyFormData): string | null {
  if (!data.name?.trim()) return "Name is required.";
  if (data.name.length > 200) return "Name must be 200 characters or fewer.";

  const slugError = validateSlug(data.slug);
  if (slugError) return slugError;

  if (!data.summary?.trim()) return "Summary is required.";
  if (data.summary.length > 500) return "Summary must be 500 characters or fewer.";

  const validStatuses = ["move-in-ready", "under-construction", "completed", "sold"];
  if (!validStatuses.includes(data.status)) return "Invalid status.";

  if (!data.suburb?.trim()) return "Suburb is required.";
  if (!data.state?.trim()) return "State is required.";

  if (data.bedrooms < 0 || data.bedrooms > 20) return "Bedrooms must be 0-20.";
  if (data.bathrooms < 0 || data.bathrooms > 20) return "Bathrooms must be 0-20.";
  if (data.carSpaces < 0 || data.carSpaces > 10) return "Car spaces must be 0-10.";
  if (data.landSizeSqm < 0) return "Land size must be non-negative.";
  if (data.houseSizeSqm !== undefined && data.houseSizeSqm < 0) {
    return "House size must be non-negative.";
  }
  if (data.displayPriority < 0) return "Display priority must be non-negative.";

  return null;
}

// --- Actions ---

export async function createPropertyAction(
  data: PropertyFormData,
): Promise<PropertyActionResult> {
  await requireAdmin();

  const validationError = validateProperty(data);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const supabase = await createAdminClient();

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from("properties")
    .select("id")
    .eq("slug", data.slug)
    .maybeSingle();

  if (existing) {
    return { success: false, error: "A property with this slug already exists." };
  }

  const insertPayload: unknown = {
    name: data.name.trim(),
    slug: data.slug,
    summary: data.summary.trim(),
    description_blocks: data.descriptionBlocks ?? null,
    description_source: data.descriptionSource ?? null,
    status: data.status,
    suburb: data.suburb.trim(),
    state: data.state.trim(),
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    car_spaces: data.carSpaces,
    land_size_sqm: data.landSizeSqm,
    house_size_sqm: data.houseSizeSqm ?? null,
    price_display: data.priceDisplay?.trim() || null,
    completion_label: data.completionLabel?.trim() || null,
    is_featured: data.isFeatured,
    is_published: data.isPublished,
    display_priority: data.displayPriority,
    display_is_home: data.displayIsHome,
    display_opening_note: data.displayOpeningNote?.trim() || null,
    current_stage_id: data.currentStageId || null,
  };

  const { data: created, error } = await (
    supabase.from("properties") as unknown as {
      insert(values: unknown): { select(columns: string): { single(): PromiseLike<{ data: { id: string } | null; error: { message: string } | null }> } };
    }
  ).insert(insertPayload).select("id").single();

  if (error || !created) {
    return { success: false, error: error?.message ?? "Failed to create property." };
  }

  await logAuditEvent({
    action: "created",
    entityType: "property",
    entityId: created.id,
    metadata: { name: data.name, slug: data.slug },
  });

  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath("/");

  return { success: true, id: created.id };
}

export async function updatePropertyAction(
  id: string,
  data: PropertyFormData,
): Promise<PropertyActionResult> {
  await requireAdmin();

  const validationError = validateProperty(data);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const supabase = await createAdminClient();

  // Check slug uniqueness (exclude self)
  const { data: existing } = await supabase
    .from("properties")
    .select("id")
    .eq("slug", data.slug)
    .neq("id", id)
    .maybeSingle();

  if (existing) {
    return { success: false, error: "A property with this slug already exists." };
  }

  const updatePayload: unknown = {
    name: data.name.trim(),
    slug: data.slug,
    summary: data.summary.trim(),
    description_blocks: data.descriptionBlocks ?? null,
    description_source: data.descriptionSource ?? null,
    status: data.status,
    suburb: data.suburb.trim(),
    state: data.state.trim(),
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    car_spaces: data.carSpaces,
    land_size_sqm: data.landSizeSqm,
    house_size_sqm: data.houseSizeSqm ?? null,
    price_display: data.priceDisplay?.trim() || null,
    completion_label: data.completionLabel?.trim() || null,
    is_featured: data.isFeatured,
    is_published: data.isPublished,
    display_priority: data.displayPriority,
    display_is_home: data.displayIsHome,
    display_opening_note: data.displayOpeningNote?.trim() || null,
    current_stage_id: data.currentStageId || null,
  };

  const { error } = await (
    supabase.from("properties") as unknown as {
      update(values: unknown): { eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }> };
    }
  ).update(updatePayload).eq("id", id);

  if (error) {
    return { success: false, error: error.message ?? "Failed to update property." };
  }

  await logAuditEvent({
    action: "updated",
    entityType: "property",
    entityId: id,
    metadata: { name: data.name, slug: data.slug },
  });

  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${data.slug}`);
  revalidatePath("/");

  return { success: true, id };
}

export async function deletePropertyAction(id: string): Promise<PropertyActionResult> {
  await requireAdmin();
  const supabase = await createAdminClient();

  // Get property name for audit
  const { data: property } = await supabase
    .from("properties")
    .select("name, slug")
    .eq("id", id)
    .single();

  const { error } = await (
    supabase.from("properties") as unknown as {
      delete(): { eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }> };
    }
  ).delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message ?? "Failed to delete property." };
  }

  await logAuditEvent({
    action: "deleted",
    entityType: "property",
    entityId: id,
    metadata: { name: (property as unknown as { name: string })?.name },
  });

  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath("/");

  return { success: true };
}

export async function publishPropertyAction(id: string): Promise<PropertyActionResult> {
  await requireAdmin();
  const supabase = await createAdminClient();

  const { error } = await (
    supabase.from("properties") as unknown as {
      update(values: unknown): { eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }> };
    }
  ).update({ is_published: true }).eq("id", id);

  if (error) {
    return { success: false, error: error.message ?? "Failed to publish property." };
  }

  await logAuditEvent({
    action: "published",
    entityType: "property",
    entityId: id,
  });

  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath("/");

  return { success: true };
}

export async function unpublishPropertyAction(id: string): Promise<PropertyActionResult> {
  await requireAdmin();
  const supabase = await createAdminClient();

  const { error } = await (
    supabase.from("properties") as unknown as {
      update(values: unknown): { eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }> };
    }
  ).update({ is_published: false }).eq("id", id);

  if (error) {
    return { success: false, error: error.message ?? "Failed to unpublish property." };
  }

  await logAuditEvent({
    action: "unpublished",
    entityType: "property",
    entityId: id,
  });

  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath("/");

  return { success: true };
}

export async function duplicatePropertyAction(id: string): Promise<PropertyActionResult> {
  await requireAdmin();
  const supabase = await createAdminClient();

  // Load the source property
  const { data: source } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single();

  if (!source) {
    return { success: false, error: "Source property not found." };
  }

  const sourceRow = source as unknown as Record<string, unknown>;

  // Create duplicate with modified name/slug, unpublished
  const duplicatePayload: unknown = {
    name: `${sourceRow.name} (copy)`,
    slug: `${sourceRow.slug}-copy-${Date.now()}`,
    summary: sourceRow.summary,
    description_blocks: sourceRow.description_blocks,
    description_source: sourceRow.description_source,
    status: sourceRow.status,
    suburb: sourceRow.suburb,
    state: sourceRow.state,
    bedrooms: sourceRow.bedrooms,
    bathrooms: sourceRow.bathrooms,
    car_spaces: sourceRow.car_spaces,
    land_size_sqm: sourceRow.land_size_sqm,
    house_size_sqm: sourceRow.house_size_sqm,
    price_display: sourceRow.price_display,
    completion_label: sourceRow.completion_label,
    is_featured: false,
    is_published: false,
    display_priority: ((sourceRow.display_priority as number) ?? 0) + 1,
    display_is_home: false,
    display_opening_note: null,
    current_stage_id: sourceRow.current_stage_id,
  };

  const { data: created, error } = await (
    supabase.from("properties") as unknown as {
      insert(values: unknown): { select(columns: string): { single(): PromiseLike<{ data: { id: string } | null; error: { message: string } | null }> } };
    }
  ).insert(duplicatePayload).select("id").single();

  if (error || !created) {
    return { success: false, error: error?.message ?? "Failed to duplicate property." };
  }

  await logAuditEvent({
    action: "created",
    entityType: "property",
    entityId: created.id,
    metadata: { duplicatedFrom: id, name: `${sourceRow.name} (copy)` },
  });

  revalidatePath("/admin/properties");

  return { success: true, id: created.id };
}
