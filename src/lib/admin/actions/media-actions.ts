"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";
import { handleAdminError, logAdminError } from "@/lib/admin/errors";
import { getNextSortOrder } from "@/lib/admin/media-repository";
import { callRpc } from "@/lib/admin/rpc";
import { summarise, type FieldError } from "@/lib/admin/validation/result";
import {
  buildStoragePath,
  categoryForImageType,
  isDocumentResourceType,
  isExternalResourceType,
  type ImageType,
  type MediaCategory,
  type ResourceType,
} from "@/lib/media/config";
import {
  checkHeroEligibility,
  checkPathOwnership,
  describePathFailure,
  validateExternalUrl,
  validateImageMetadata,
  validateReorderIds,
  validateResourceMetadata,
  validateUploadRequest,
} from "@/lib/media/validation";
import { PROPERTY_MEDIA_BUCKET } from "@/lib/images/property-image";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PropertyImagesRow, PropertyResourcesRow } from "@/types/database";

/**
 * Media Server Actions.
 *
 * ## Upload flow
 *
 * Files go from the browser straight to Supabase Storage. Next.js never sees
 * the bytes, which keeps a 20 MB floor plan away from the Server Action
 * request-body limit and off the server's memory.
 *
 * The exchange is:
 *
 *   1. `requestImageUpload` / `requestDocumentUpload` — the server checks the
 *      administrator, the property, the MIME type, the extension and the size,
 *      then returns the object name the file must use. The name is generated
 *      here from a fresh UUID; the uploaded filename never contributes to it.
 *   2. The browser uploads to that path under its own authenticated session.
 *      The Storage policy from migration 0009 independently re-checks that the
 *      caller is an admin and that the path matches the required layout, so a
 *      client that ignores the returned path gets nowhere useful.
 *   3. `finaliseImageUpload` / `finaliseDocumentUpload` — the server confirms
 *      the object is actually there, then writes the database row.
 *
 * Step 3 is what makes a database record evidence that a file exists. A row
 * written before the upload completed would be a broken image on the public
 * site.
 *
 * ## What is not claimed
 *
 * Postgres and Storage are separate systems with no shared transaction. These
 * actions therefore sequence their writes so that any single failure leaves a
 * *safe* state rather than a consistent one:
 *
 *   - Finalisation fails → the uploaded object is deleted. If that deletion
 *     also fails, an unreferenced object remains and is logged.
 *   - Deletion runs database-first → the file stops being served immediately;
 *     a failed object delete leaves an unreferenced file, reported honestly.
 *   - Replacement writes the new object first and deletes the old one last →
 *     an interruption at any point leaves working media.
 *
 * There is no background sweeper for unreferenced objects. That is a known
 * limitation, recorded in the README rather than papered over.
 */

export interface MediaActionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly fieldErrors?: readonly FieldError[];
  /** Set when the file was removed from the database but not from storage. */
  readonly warning?: string;
}

export interface UploadTicket {
  readonly success: boolean;
  readonly error?: string;
  readonly fieldErrors?: readonly FieldError[];
  /** Object name the browser must upload to. */
  readonly path?: string;
  readonly bucket?: string;
}

/* ====================================================================== */
/* Shared helpers                                                         */
/* ====================================================================== */

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

/**
 * Confirms an object is present in the bucket.
 *
 * `list` with a search on the containing folder is a metadata call — it does
 * not transfer the file, which `download` would.
 */
async function objectExists(
  supabase: AdminClient,
  path: string,
): Promise<boolean> {
  const lastSlash = path.lastIndexOf("/");
  const folder = lastSlash === -1 ? "" : path.slice(0, lastSlash);
  const filename = path.slice(lastSlash + 1);

  const { data, error } = await supabase.storage
    .from(PROPERTY_MEDIA_BUCKET)
    .list(folder, { search: filename, limit: 1 });

  if (error) {
    logAdminError(`Checking whether ${path} exists`, error);
    return false;
  }

  return (data ?? []).some((entry) => entry.name === filename);
}

/**
 * Best-effort object removal.
 *
 * Returns whether it worked so callers can tell the administrator the truth.
 * Never throws: cleanup failing must not turn a successful primary operation
 * into a reported error.
 */
async function removeObject(
  supabase: AdminClient,
  path: string,
  context: string,
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(PROPERTY_MEDIA_BUCKET)
    .remove([path]);

  if (error) {
    // Logged loudly: this is how an unreferenced object comes to exist, and
    // the log is the only record of it.
    logAdminError(`${context} — orphaned object left at ${path}`, error);
    return false;
  }

  return true;
}

/**
 * Loads an image row only if it belongs to the given property.
 *
 * Every action taking an image id calls this. It is the IDOR guard: an id
 * belonging to another property returns null and the action refuses, rather
 * than acting on a row the administrator did not intend to touch.
 */
async function loadOwnedImage(
  supabase: AdminClient,
  propertyId: string,
  imageId: string,
): Promise<PropertyImagesRow | null> {
  const { data, error } = await supabase
    .from("property_images")
    .select("*")
    .eq("id", imageId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) {
    logAdminError(`Loading image ${imageId} for property ${propertyId}`, error);
    return null;
  }

  return (data as unknown as PropertyImagesRow) ?? null;
}

async function loadOwnedResource(
  supabase: AdminClient,
  propertyId: string,
  resourceId: string,
): Promise<PropertyResourcesRow | null> {
  const { data, error } = await supabase
    .from("property_resources")
    .select("*")
    .eq("id", resourceId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (error) {
    logAdminError(
      `Loading resource ${resourceId} for property ${propertyId}`,
      error,
    );
    return null;
  }

  return (data as unknown as PropertyResourcesRow) ?? null;
}

/** The property's slug, needed to revalidate its public page. */
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

/**
 * Refreshes every surface that can show this property's media.
 *
 * The homepage and explorer are included because a hero change alters the
 * card, not just the property page.
 */
function revalidateMedia(propertyId: string, slug: string | null): void {
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath("/");

  if (slug) {
    revalidatePath(`/properties/${slug}`);
  }
}

/** Confirms the property exists before generating a path against it. */
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

function invalidResult(
  errors: readonly FieldError[],
): { success: false; error: string; fieldErrors: readonly FieldError[] } {
  return { success: false, error: summarise(errors), fieldErrors: errors };
}

/* ====================================================================== */
/* Upload tickets                                                         */
/* ====================================================================== */

async function requestUpload(
  propertyId: string,
  category: MediaCategory,
  filename: string,
  mimeType: string,
  sizeBytes: number,
): Promise<UploadTicket> {
  await requireAdmin();

  const validation = validateUploadRequest({
    propertyId,
    category,
    filename,
    mimeType,
    sizeBytes,
  });

  if (!validation.ok) {
    return invalidResult(validation.errors);
  }

  const supabase = await createAdminClient();

  if (!(await propertyExists(supabase, propertyId))) {
    return { success: false, error: "That property no longer exists." };
  }

  const path = buildStoragePath(propertyId, category, mimeType);

  if (!path) {
    return {
      success: false,
      error: "That file type cannot be stored. Choose a JPEG, PNG, WebP or PDF.",
    };
  }

  return { success: true, path, bucket: PROPERTY_MEDIA_BUCKET };
}

/** Validated upload target for an image. */
export async function requestImageUpload(
  propertyId: string,
  imageType: ImageType,
  filename: string,
  mimeType: string,
  sizeBytes: number,
): Promise<UploadTicket> {
  return requestUpload(
    propertyId,
    categoryForImageType(imageType),
    filename,
    mimeType,
    sizeBytes,
  );
}

/** Validated upload target for a PDF document. */
export async function requestDocumentUpload(
  propertyId: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
): Promise<UploadTicket> {
  return requestUpload(propertyId, "documents", filename, mimeType, sizeBytes);
}

/* ====================================================================== */
/* Finalising uploads                                                     */
/* ====================================================================== */

export interface FinaliseImageInput {
  readonly path: string;
  readonly imageType: string;
  readonly altText?: string;
  readonly caption?: string;
  readonly isPublished: boolean;
  readonly originalFilename?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly width?: number;
  readonly height?: number;
}

export async function finaliseImageUpload(
  propertyId: string,
  input: FinaliseImageInput,
): Promise<MediaActionResult> {
  await requireAdmin();

  const metadata = validateImageMetadata({
    imageType: input.imageType,
    altText: input.altText,
    caption: input.caption,
    isPublished: input.isPublished,
  });

  if (!metadata.ok) {
    return invalidResult(metadata.errors);
  }

  // The path came from the browser. Even though this server generated it a
  // moment ago, it is re-checked here: nothing guarantees the value that came
  // back is the value that went out.
  const ownership = checkPathOwnership(
    input.path,
    propertyId,
    categoryForImageType(metadata.value.imageType),
  );

  if (!ownership.ok) {
    return {
      success: false,
      error: describePathFailure(ownership.reason ?? "malformed"),
    };
  }

  const supabase = await createAdminClient();

  if (!(await objectExists(supabase, input.path))) {
    return {
      success: false,
      error: "The upload did not complete. Please try again.",
    };
  }

  const sortOrder = await getNextSortOrder(
    propertyId,
    "property_images",
    "image_type",
    metadata.value.imageType,
  );

  const row: Record<string, unknown> = {
    property_id: propertyId,
    image_type: metadata.value.imageType,
    storage_path: input.path,
    external_url: null,
    alt_text: metadata.value.altText ?? null,
    caption: metadata.value.caption ?? null,
    sort_order: sortOrder,
    is_published: metadata.value.isPublished,
    original_filename: input.originalFilename ?? null,
    mime_type: input.mimeType ?? null,
    file_size_bytes: input.sizeBytes ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
  };

  const { data: created, error } = await supabase
    .from("property_images")
    .insert(row as never)
    .select("id")
    .single();

  if (error || !created) {
    // The file is up but has no record, so nothing can ever reference it.
    // Remove it rather than leaving it to accumulate.
    const cleaned = await removeObject(
      supabase,
      input.path,
      "Image finalisation failed",
    );

    return {
      success: false,
      error: handleAdminError(
        `Finalising image upload for property ${propertyId}`,
        error,
        "The file uploaded but could not be saved. Please try again.",
      ),
      warning: cleaned
        ? undefined
        : "The uploaded file could not be cleaned up and may still be in storage.",
    };
  }

  await logAuditEvent({
    action: "uploaded",
    entityType: "property_image",
    entityId: (created as unknown as { id: string }).id,
    // The path is recorded; a signed URL never is. Signed URLs are
    // credentials with a lifetime, and an append-only log is exactly the
    // wrong place to keep one.
    metadata: {
      propertyId,
      imageType: metadata.value.imageType,
      storagePath: input.path,
    },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

export interface FinaliseDocumentInput {
  readonly path: string;
  readonly resourceType: string;
  readonly title: string;
  readonly caption?: string;
  readonly isPublished: boolean;
  readonly originalFilename?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

export async function finaliseDocumentUpload(
  propertyId: string,
  input: FinaliseDocumentInput,
): Promise<MediaActionResult> {
  await requireAdmin();

  const metadata = validateResourceMetadata({
    resourceType: input.resourceType,
    title: input.title,
    caption: input.caption,
    isPublished: input.isPublished,
  });

  if (!metadata.ok) {
    return invalidResult(metadata.errors);
  }

  if (!isDocumentResourceType(metadata.value.resourceType)) {
    return {
      success: false,
      error: "That media type is a link, not a file.",
      fieldErrors: [
        { field: "resourceType", message: "Choose a document type." },
      ],
    };
  }

  const ownership = checkPathOwnership(input.path, propertyId, "documents");

  if (!ownership.ok) {
    return {
      success: false,
      error: describePathFailure(ownership.reason ?? "malformed"),
    };
  }

  const supabase = await createAdminClient();

  if (!(await objectExists(supabase, input.path))) {
    return {
      success: false,
      error: "The upload did not complete. Please try again.",
    };
  }

  const sortOrder = await getNextSortOrder(
    propertyId,
    "property_resources",
    "resource_type",
    metadata.value.resourceType,
  );

  const row: Record<string, unknown> = {
    property_id: propertyId,
    resource_type: metadata.value.resourceType,
    title: metadata.value.title,
    caption: metadata.value.caption ?? null,
    // A hosted document has a storage path and no URL. Writing the path into
    // `url` is what previously produced dead links on the public site.
    storage_path: input.path,
    url: null,
    sort_order: sortOrder,
    is_published: metadata.value.isPublished,
    original_filename: input.originalFilename ?? null,
    mime_type: input.mimeType ?? null,
    file_size_bytes: input.sizeBytes ?? null,
  };

  const { data: created, error } = await supabase
    .from("property_resources")
    .insert(row as never)
    .select("id")
    .single();

  if (error || !created) {
    const cleaned = await removeObject(
      supabase,
      input.path,
      "Document finalisation failed",
    );

    return {
      success: false,
      error: handleAdminError(
        `Finalising document upload for property ${propertyId}`,
        error,
        "The file uploaded but could not be saved. Please try again.",
      ),
      warning: cleaned
        ? undefined
        : "The uploaded file could not be cleaned up and may still be in storage.",
    };
  }

  await logAuditEvent({
    action: "uploaded",
    entityType: "property_resource",
    entityId: (created as unknown as { id: string }).id,
    metadata: {
      propertyId,
      resourceType: metadata.value.resourceType,
      storagePath: input.path,
    },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

/* ====================================================================== */
/* External media                                                         */
/* ====================================================================== */

export interface AddExternalImageInput {
  readonly url: string;
  readonly imageType: string;
  readonly altText?: string;
  readonly caption?: string;
  readonly isPublished: boolean;
}

export async function addExternalImage(
  propertyId: string,
  input: AddExternalImageInput,
): Promise<MediaActionResult> {
  await requireAdmin();

  const metadata = validateImageMetadata({
    imageType: input.imageType,
    altText: input.altText,
    caption: input.caption,
    isPublished: input.isPublished,
  });

  if (!metadata.ok) {
    return invalidResult(metadata.errors);
  }

  const url = validateExternalUrl(input.url);

  if (!url.ok) {
    return invalidResult(url.errors);
  }

  const supabase = await createAdminClient();

  if (!(await propertyExists(supabase, propertyId))) {
    return { success: false, error: "That property no longer exists." };
  }

  const sortOrder = await getNextSortOrder(
    propertyId,
    "property_images",
    "image_type",
    metadata.value.imageType,
  );

  const row: Record<string, unknown> = {
    property_id: propertyId,
    image_type: metadata.value.imageType,
    // External media has no storage path. The single-source constraint
    // enforces that these two are never both set.
    storage_path: null,
    external_url: url.value.url,
    alt_text: metadata.value.altText ?? null,
    caption: metadata.value.caption ?? null,
    sort_order: sortOrder,
    is_published: metadata.value.isPublished,
  };

  const { data: created, error } = await supabase
    .from("property_images")
    .insert(row as never)
    .select("id")
    .single();

  if (error || !created) {
    return {
      success: false,
      error: handleAdminError(
        `Adding external image for property ${propertyId}`,
        error,
        "Could not add that image. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "link_added",
    entityType: "property_image",
    entityId: (created as unknown as { id: string }).id,
    metadata: { propertyId, host: url.value.host },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

export interface AddExternalResourceInput {
  readonly url: string;
  readonly resourceType: string;
  readonly title: string;
  readonly caption?: string;
  readonly isPublished: boolean;
}

export async function addExternalResource(
  propertyId: string,
  input: AddExternalResourceInput,
): Promise<MediaActionResult> {
  await requireAdmin();

  const metadata = validateResourceMetadata({
    resourceType: input.resourceType,
    title: input.title,
    caption: input.caption,
    isPublished: input.isPublished,
  });

  if (!metadata.ok) {
    return invalidResult(metadata.errors);
  }

  if (!isExternalResourceType(metadata.value.resourceType)) {
    return {
      success: false,
      error: "That media type is a file, not a link.",
      fieldErrors: [
        { field: "resourceType", message: "Choose a tour or video type." },
      ],
    };
  }

  const url = validateExternalUrl(input.url);

  if (!url.ok) {
    return invalidResult(url.errors);
  }

  const supabase = await createAdminClient();

  if (!(await propertyExists(supabase, propertyId))) {
    return { success: false, error: "That property no longer exists." };
  }

  const sortOrder = await getNextSortOrder(
    propertyId,
    "property_resources",
    "resource_type",
    metadata.value.resourceType,
  );

  const row: Record<string, unknown> = {
    property_id: propertyId,
    resource_type: metadata.value.resourceType,
    title: metadata.value.title,
    caption: metadata.value.caption ?? null,
    url: url.value.url,
    storage_path: null,
    sort_order: sortOrder,
    is_published: metadata.value.isPublished,
  };

  const { data: created, error } = await supabase
    .from("property_resources")
    .insert(row as never)
    .select("id")
    .single();

  if (error || !created) {
    return {
      success: false,
      error: handleAdminError(
        `Adding external resource for property ${propertyId}`,
        error,
        "Could not add that link. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "link_added",
    entityType: "property_resource",
    entityId: (created as unknown as { id: string }).id,
    metadata: {
      propertyId,
      resourceType: metadata.value.resourceType,
      host: url.value.host,
    },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

/* ====================================================================== */
/* Metadata and publishing                                                */
/* ====================================================================== */

export interface UpdateImageMetadataInput {
  readonly imageType: string;
  readonly altText?: string;
  readonly caption?: string;
  readonly isPublished: boolean;
}

export async function updateImageMetadata(
  propertyId: string,
  imageId: string,
  input: UpdateImageMetadataInput,
): Promise<MediaActionResult> {
  await requireAdmin();

  const metadata = validateImageMetadata(input);

  if (!metadata.ok) {
    return invalidResult(metadata.errors);
  }

  const supabase = await createAdminClient();
  const existing = await loadOwnedImage(supabase, propertyId, imageId);

  if (!existing) {
    return {
      success: false,
      error: "That image could not be found on this property.",
    };
  }

  // Changing an image's category would move it to a different folder, and the
  // stored file would then sit at a path that contradicts its row. Reordering
  // and re-uploading are the supported routes; silently allowing the change
  // is not.
  const currentType =
    existing.image_type === "façade" ? "facade" : existing.image_type;

  if (
    existing.storage_path &&
    metadata.value.imageType !== currentType
  ) {
    return {
      success: false,
      error:
        "An uploaded image cannot change category. Delete it and upload it under the new category.",
      fieldErrors: [
        { field: "imageType", message: "Category cannot be changed." },
      ],
    };
  }

  const { error } = await supabase
    .from("property_images")
    .update({
      image_type: metadata.value.imageType,
      alt_text: metadata.value.altText ?? null,
      caption: metadata.value.caption ?? null,
      is_published: metadata.value.isPublished,
    } as never)
    .eq("id", imageId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Updating image ${imageId}`,
        error,
        "Could not save those details. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "updated",
    entityType: "property_image",
    entityId: imageId,
    metadata: { propertyId, isPublished: metadata.value.isPublished },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

export interface UpdateResourceMetadataInput {
  readonly resourceType: string;
  readonly title: string;
  readonly caption?: string;
  readonly isPublished: boolean;
}

export async function updateResourceMetadata(
  propertyId: string,
  resourceId: string,
  input: UpdateResourceMetadataInput,
): Promise<MediaActionResult> {
  await requireAdmin();

  const metadata = validateResourceMetadata(input);

  if (!metadata.ok) {
    return invalidResult(metadata.errors);
  }

  const supabase = await createAdminClient();
  const existing = await loadOwnedResource(supabase, propertyId, resourceId);

  if (!existing) {
    return {
      success: false,
      error: "That item could not be found on this property.",
    };
  }

  // A hosted document cannot become a link type, or vice versa — the source
  // column it uses would no longer match its type.
  const wasDocument = existing.storage_path !== null;

  if (wasDocument !== isDocumentResourceType(metadata.value.resourceType)) {
    return {
      success: false,
      error: "This item cannot change between a file and a link.",
      fieldErrors: [
        { field: "resourceType", message: "Type cannot be changed." },
      ],
    };
  }

  const { error } = await supabase
    .from("property_resources")
    .update({
      resource_type: metadata.value.resourceType,
      title: metadata.value.title,
      caption: metadata.value.caption ?? null,
      is_published: metadata.value.isPublished,
    } as never)
    .eq("id", resourceId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Updating resource ${resourceId}`,
        error,
        "Could not save those details. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "updated",
    entityType: "property_resource",
    entityId: resourceId,
    metadata: { propertyId },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

/** Publishes or unpublishes one image. */
export async function setImagePublished(
  propertyId: string,
  imageId: string,
  isPublished: boolean,
): Promise<MediaActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedImage(supabase, propertyId, imageId);

  if (!existing) {
    return {
      success: false,
      error: "That image could not be found on this property.",
    };
  }

  // Publishing runs the same alt-text rule the metadata form does, so the
  // requirement cannot be bypassed by publishing from the list instead.
  if (isPublished) {
    const gate = validateImageMetadata({
      imageType: existing.image_type === "façade" ? "facade" : existing.image_type,
      altText: existing.alt_text ?? undefined,
      caption: existing.caption ?? undefined,
      isPublished: true,
    });

    if (!gate.ok) {
      return invalidResult(gate.errors);
    }
  }

  const { error } = await supabase
    .from("property_images")
    .update({ is_published: isPublished } as never)
    .eq("id", imageId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Changing publish state of image ${imageId}`,
        error,
        "Could not change that image's visibility.",
      ),
    };
  }

  await logAuditEvent({
    action: isPublished ? "published" : "unpublished",
    entityType: "property_image",
    entityId: imageId,
    metadata: { propertyId },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

export async function setResourcePublished(
  propertyId: string,
  resourceId: string,
  isPublished: boolean,
): Promise<MediaActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedResource(supabase, propertyId, resourceId);

  if (!existing) {
    return {
      success: false,
      error: "That item could not be found on this property.",
    };
  }

  const { error } = await supabase
    .from("property_resources")
    .update({ is_published: isPublished } as never)
    .eq("id", resourceId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Changing publish state of resource ${resourceId}`,
        error,
        "Could not change that item's visibility.",
      ),
    };
  }

  await logAuditEvent({
    action: isPublished ? "published" : "unpublished",
    entityType: "property_resource",
    entityId: resourceId,
    metadata: { propertyId },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

/* ====================================================================== */
/* Hero selection                                                         */
/* ====================================================================== */

export async function setHeroImage(
  propertyId: string,
  imageId: string,
): Promise<MediaActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedImage(supabase, propertyId, imageId);

  if (!existing) {
    return {
      success: false,
      error: "That image could not be found on this property.",
    };
  }

  const eligibility = checkHeroEligibility({
    imageType: existing.image_type === "façade" ? "facade" : existing.image_type,
    hasSource: Boolean(existing.storage_path ?? existing.external_url),
    altText: existing.alt_text,
    isPublished: existing.is_published,
  });

  if (!eligibility.ok) {
    return invalidResult(eligibility.errors);
  }

  // Promotion and demotion happen inside one transaction. Doing it here as
  // two updates could leave the property with two heroes — which the unique
  // index refuses — or none.
  const { error } = await callRpc(supabase, "set_property_hero_image", {
    p_property_id: propertyId,
    p_image_id: imageId,
  });

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Setting hero image ${imageId} for property ${propertyId}`,
        error,
        "Could not set the main image. Nothing was changed.",
      ),
    };
  }

  // The RPC writes its own audit entry inside the transaction, so no event is
  // recorded here — doing both would double-count.
  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

/**
 * Demotes the current hero without choosing a replacement.
 *
 * The property falls back to the architectural drawing, which is a valid
 * presentation rather than a gap.
 */
export async function clearHeroImage(
  propertyId: string,
): Promise<MediaActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();

  const { error } = await supabase
    .from("property_images")
    .update({ image_type: "gallery" } as never)
    .eq("property_id", propertyId)
    .eq("image_type", "hero");

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Clearing hero image for property ${propertyId}`,
        error,
        "Could not clear the main image.",
      ),
    };
  }

  await logAuditEvent({
    action: "updated",
    entityType: "property_image",
    metadata: { propertyId, change: "hero cleared" },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

/* ====================================================================== */
/* Reordering                                                             */
/* ====================================================================== */

export async function reorderImages(
  propertyId: string,
  imageType: ImageType,
  orderedIds: readonly string[],
): Promise<MediaActionResult> {
  await requireAdmin();

  const ids = validateReorderIds(orderedIds);

  if (!ids.ok) {
    return invalidResult(ids.errors);
  }

  const supabase = await createAdminClient();

  // The RPC re-checks that every id belongs to this property *and* this
  // category, in one statement, and rewrites the whole group together.
  const { error } = await callRpc(supabase, "reorder_property_images", {
    p_property_id: propertyId,
    p_image_type: imageType,
    p_image_ids: [...orderedIds],
  });

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Reordering ${imageType} images for property ${propertyId}`,
        error,
        "Could not save the new order. Nothing was changed.",
      ),
    };
  }

  await logAuditEvent({
    action: "reordered",
    entityType: "property_image",
    metadata: { propertyId, imageType, count: orderedIds.length },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

export async function reorderResources(
  propertyId: string,
  resourceType: ResourceType,
  orderedIds: readonly string[],
): Promise<MediaActionResult> {
  await requireAdmin();

  const ids = validateReorderIds(orderedIds);

  if (!ids.ok) {
    return invalidResult(ids.errors);
  }

  const supabase = await createAdminClient();

  const { error } = await callRpc(supabase, "reorder_property_resources", {
    p_property_id: propertyId,
    p_resource_type: resourceType,
    p_resource_ids: [...orderedIds],
  });

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Reordering ${resourceType} resources for property ${propertyId}`,
        error,
        "Could not save the new order. Nothing was changed.",
      ),
    };
  }

  await logAuditEvent({
    action: "reordered",
    entityType: "property_resource",
    metadata: { propertyId, resourceType, count: orderedIds.length },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  return { success: true };
}

/* ====================================================================== */
/* Replace                                                                */
/* ====================================================================== */

export interface ReplaceImageInput {
  /** Object the browser has already uploaded. */
  readonly newPath: string;
  readonly originalFilename?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Points an existing image row at a newly uploaded file.
 *
 * The order is deliberate and is the whole point of this function:
 *
 *   1. Confirm the replacement is really in storage.
 *   2. Update the row to reference it.
 *   3. Revalidate, so the public site is already serving the new file.
 *   4. Only then delete the old object.
 *
 * If any step before 4 fails, the row still references the old file and the
 * property continues to display working media. The previous asset is never
 * removed on the strength of an upload that has not been verified.
 *
 * Hero status is preserved because `image_type` is not touched.
 */
export async function replaceImageFile(
  propertyId: string,
  imageId: string,
  input: ReplaceImageInput,
): Promise<MediaActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedImage(supabase, propertyId, imageId);

  if (!existing) {
    return {
      success: false,
      error: "That image could not be found on this property.",
    };
  }

  if (!existing.storage_path) {
    return {
      success: false,
      error:
        "That image is a link rather than an uploaded file. Edit the link instead.",
    };
  }

  const currentType =
    existing.image_type === "façade" ? "facade" : existing.image_type;

  const ownership = checkPathOwnership(
    input.newPath,
    propertyId,
    categoryForImageType(currentType as ImageType),
  );

  if (!ownership.ok) {
    return {
      success: false,
      error: describePathFailure(ownership.reason ?? "malformed"),
    };
  }

  // Refuse if the replacement is not actually there. Proceeding would swap a
  // working image for a missing one.
  if (!(await objectExists(supabase, input.newPath))) {
    return {
      success: false,
      error:
        "The replacement did not finish uploading. The existing image has been kept.",
    };
  }

  const previousPath = existing.storage_path;

  const { error } = await supabase
    .from("property_images")
    .update({
      storage_path: input.newPath,
      original_filename: input.originalFilename ?? null,
      mime_type: input.mimeType ?? null,
      file_size_bytes: input.sizeBytes ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
    } as never)
    .eq("id", imageId)
    .eq("property_id", propertyId);

  if (error) {
    // The new object is now unreferenced. Remove it and leave the old image
    // in place, which is still working.
    const cleaned = await removeObject(
      supabase,
      input.newPath,
      "Image replacement failed",
    );

    return {
      success: false,
      error: handleAdminError(
        `Replacing file for image ${imageId}`,
        error,
        "Could not switch to the new file. The existing image has been kept.",
      ),
      warning: cleaned
        ? undefined
        : "The new file could not be cleaned up and may still be in storage.",
    };
  }

  await logAuditEvent({
    action: "replaced",
    entityType: "property_image",
    entityId: imageId,
    metadata: { propertyId, previousPath, newPath: input.newPath },
  });

  const slug = await loadSlug(supabase, propertyId);
  revalidateMedia(propertyId, slug);

  // Last, and only now that nothing references it.
  const removed = await removeObject(
    supabase,
    previousPath,
    "Post-replacement cleanup",
  );

  return {
    success: true,
    warning: removed
      ? undefined
      : "The new image is live. The previous file could not be deleted and remains in storage.",
  };
}

/* ====================================================================== */
/* Delete                                                                 */
/* ====================================================================== */

/**
 * Removes an image.
 *
 * Database first, then storage. That order means the public site stops
 * referencing the file immediately; a failure at the storage step leaves an
 * unreferenced object rather than a row pointing at a file that is gone.
 *
 * The reverse order would produce a visibly broken image on a live page,
 * which is worse than an invisible orphan.
 */
export async function deleteImage(
  propertyId: string,
  imageId: string,
): Promise<MediaActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedImage(supabase, propertyId, imageId);

  if (!existing) {
    return {
      success: false,
      error: "That image could not be found on this property.",
    };
  }

  // Even though the row was loaded by property id, the path is re-checked:
  // the row's own path is what will be deleted from storage, and a row whose
  // path points elsewhere must not be able to delete another property's file.
  let deletablePath: string | null = null;

  if (existing.storage_path) {
    const ownership = checkPathOwnership(existing.storage_path, propertyId);

    if (ownership.ok) {
      deletablePath = existing.storage_path;
    } else {
      logAdminError(
        `Image ${imageId} has a storage path outside property ${propertyId}; the row will be removed but the object left alone`,
        { path: existing.storage_path },
      );
    }
  }

  const { error } = await supabase
    .from("property_images")
    .delete()
    .eq("id", imageId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Deleting image ${imageId}`,
        error,
        "Could not delete that image. Nothing was changed.",
      ),
    };
  }

  await logAuditEvent({
    action: "deleted",
    entityType: "property_image",
    entityId: imageId,
    metadata: { propertyId, storagePath: existing.storage_path },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  if (!deletablePath) {
    // An external image has no file of ours to remove.
    return { success: true };
  }

  const removed = await removeObject(supabase, deletablePath, "Image deletion");

  return {
    success: true,
    warning: removed
      ? undefined
      : "The image was removed from this property, but its file could not be deleted from storage.",
  };
}

export async function deleteResource(
  propertyId: string,
  resourceId: string,
): Promise<MediaActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const existing = await loadOwnedResource(supabase, propertyId, resourceId);

  if (!existing) {
    return {
      success: false,
      error: "That item could not be found on this property.",
    };
  }

  let deletablePath: string | null = null;

  if (existing.storage_path) {
    const ownership = checkPathOwnership(
      existing.storage_path,
      propertyId,
      "documents",
    );

    if (ownership.ok) {
      deletablePath = existing.storage_path;
    } else {
      logAdminError(
        `Resource ${resourceId} has a storage path outside property ${propertyId}; the row will be removed but the object left alone`,
        { path: existing.storage_path },
      );
    }
  }

  const { error } = await supabase
    .from("property_resources")
    .delete()
    .eq("id", resourceId)
    .eq("property_id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Deleting resource ${resourceId}`,
        error,
        "Could not delete that item. Nothing was changed.",
      ),
    };
  }

  await logAuditEvent({
    action: "deleted",
    entityType: "property_resource",
    entityId: resourceId,
    metadata: { propertyId, storagePath: existing.storage_path },
  });

  revalidateMedia(propertyId, await loadSlug(supabase, propertyId));

  if (!deletablePath) {
    return { success: true };
  }

  const removed = await removeObject(
    supabase,
    deletablePath,
    "Resource deletion",
  );

  return {
    success: true,
    warning: removed
      ? undefined
      : "The item was removed from this property, but its file could not be deleted from storage.",
  };
}
