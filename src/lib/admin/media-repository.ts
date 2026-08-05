import "server-only";

import { logAdminError } from "@/lib/admin/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMediaSource } from "@/lib/properties/media";
import type { ImageType, ResourceType } from "@/lib/media/config";
import type {
  PropertyImagesRow,
  PropertyResourcesRow,
} from "@/types/database";
import type { MediaSource } from "@/types";

/**
 * Admin media reads.
 *
 * Returns drafts as well as published rows — the whole point of the media
 * manager is working on media before it goes live. RLS is what permits that:
 * an authenticated session with no `admin_users` row sees nothing here.
 *
 * Deliberately separate from the property repository. The media tab needs no
 * private location data, and the location tab needs no media, so neither
 * response carries the other. Keeping them apart means a bug in one cannot
 * widen what the other exposes.
 */

export interface AdminMediaItem {
  readonly id: string;
  readonly propertyId: string;
  readonly imageType: ImageType;
  readonly source: MediaSource;
  /** Resolved preview URL, or null when Supabase is unconfigured. */
  readonly previewUrl: string | null;
  readonly altText: string | null;
  readonly caption: string | null;
  readonly sortOrder: number;
  readonly isPublished: boolean;
  readonly originalFilename: string | null;
  readonly mimeType: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly fileSizeBytes: number | null;
  readonly updatedAt: string;
}

export interface AdminResourceItem {
  readonly id: string;
  readonly propertyId: string;
  readonly resourceType: ResourceType;
  readonly source: MediaSource;
  readonly resolvedUrl: string | null;
  readonly title: string;
  readonly caption: string | null;
  readonly sortOrder: number;
  readonly isPublished: boolean;
  readonly originalFilename: string | null;
  readonly mimeType: string | null;
  readonly fileSizeBytes: number | null;
  readonly updatedAt: string;
}

export interface AdminPropertyMedia {
  readonly images: readonly AdminMediaItem[];
  readonly resources: readonly AdminResourceItem[];
  /** True when the read failed, so the UI says so rather than "no media". */
  readonly failed: boolean;
}

/** Normalises the legacy non-ASCII category migration 0009 rewrote. */
function normaliseImageType(value: PropertyImagesRow["image_type"]): ImageType {
  return value === "façade" ? "facade" : (value as ImageType);
}

/**
 * Builds the source union from the row's two mutually exclusive columns.
 *
 * `property_images_single_source` forbids both being set, and
 * `image_source_present` forbids neither, so in practice exactly one is
 * populated. The null return covers a row that predates those constraints.
 */
function toSource(
  storagePath: string | null,
  externalUrl: string | null,
): MediaSource | null {
  if (storagePath) {
    return { kind: "storage", path: storagePath };
  }

  if (externalUrl) {
    return { kind: "external", url: externalUrl };
  }

  return null;
}

function toMediaItem(row: PropertyImagesRow): AdminMediaItem | null {
  const source = toSource(row.storage_path, row.external_url);

  if (!source) {
    return null;
  }

  return {
    id: row.id,
    propertyId: row.property_id,
    imageType: normaliseImageType(row.image_type),
    source,
    previewUrl: resolveMediaSource(source),
    altText: row.alt_text,
    caption: row.caption,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    fileSizeBytes: row.file_size_bytes,
    updatedAt: row.updated_at,
  };
}

function toResourceItem(row: PropertyResourcesRow): AdminResourceItem | null {
  const source = toSource(row.storage_path, row.url);

  if (!source) {
    return null;
  }

  return {
    id: row.id,
    propertyId: row.property_id,
    resourceType: row.resource_type,
    source,
    resolvedUrl: resolveMediaSource(source),
    title: row.title,
    caption: row.caption,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    updatedAt: row.updated_at,
  };
}

/**
 * Every image and resource attached to a property, drafts included.
 *
 * Two reads issued together rather than in sequence, so the tab waits one
 * round trip instead of two. Ordering is applied by the database on the
 * columns the reorder functions maintain, with `id` as a tiebreaker so the
 * sequence is total — without it, two rows sharing a `sort_order` could swap
 * places between renders.
 */
export async function getPropertyMedia(
  propertyId: string,
): Promise<AdminPropertyMedia> {
  if (!propertyId) {
    return { images: [], resources: [], failed: false };
  }

  const supabase = await createAdminClient();

  const [imageResult, resourceResult] = await Promise.all([
    supabase
      .from("property_images")
      .select("*")
      .eq("property_id", propertyId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("property_resources")
      .select("*")
      .eq("property_id", propertyId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (imageResult.error || resourceResult.error) {
    logAdminError(
      `Loading media for property ${propertyId}`,
      imageResult.error ?? resourceResult.error,
    );
    return { images: [], resources: [], failed: true };
  }

  const imageRows = (imageResult.data ?? []) as unknown as PropertyImagesRow[];
  const resourceRows = (resourceResult.data ??
    []) as unknown as PropertyResourcesRow[];

  return {
    images: imageRows
      .map(toMediaItem)
      .filter((item): item is AdminMediaItem => item !== null),
    resources: resourceRows
      .map(toResourceItem)
      .filter((item): item is AdminResourceItem => item !== null),
    failed: false,
  };
}

/**
 * The next free sort position within a group.
 *
 * Appending rather than inserting at zero means an upload does not silently
 * reorder everything already there.
 */
export async function getNextSortOrder(
  propertyId: string,
  table: "property_images" | "property_resources",
  typeColumn: "image_type" | "resource_type",
  typeValue: string,
): Promise<number> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from(table)
    .select("sort_order")
    .eq("property_id", propertyId)
    .eq(typeColumn, typeValue)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return 0;
  }

  return ((data as unknown as { sort_order: number }).sort_order ?? -1) + 1;
}
