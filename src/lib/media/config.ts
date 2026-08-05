/**
 * Media configuration — the single source of truth.
 *
 * Every category name, MIME type, size limit and path rule lives here. The
 * alternative, constants beside the code that happens to need them, means a
 * limit raised in the upload form and not in the validator, or a category the
 * admin UI offers and the storage policy refuses.
 *
 * Two things in this file must stay in step with the database:
 *
 *   - `STORAGE_PATH_PATTERN` mirrors the regex inside
 *     `public.is_valid_property_media_path()` (migration 0009). A path this
 *     module builds and accepts must be one the storage policy also accepts.
 *     `config.test.ts` asserts they agree on the same cases.
 *   - `IMAGE_TYPES` and `RESOURCE_TYPES` mirror the CHECK constraints on
 *     `property_images.image_type` and `property_resources.resource_type`.
 */

/* ---------------------------------------------------------------------- */
/* Categories                                                             */
/* ---------------------------------------------------------------------- */

/**
 * Storage folder names.
 *
 * Deliberately not identical to the database enums: `floor_plan` is a column
 * value, `floor-plans` is a directory. Keeping both and mapping between them
 * is clearer than forcing one spelling to serve as a SQL identifier, a URL
 * segment and a folder name at once.
 */
export const MEDIA_CATEGORIES = [
  "hero",
  "gallery",
  "facade",
  "construction",
  "floor-plans",
  "drone",
  "documents",
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/** Matches the `property_images_image_type_check` constraint. */
export const IMAGE_TYPES = [
  "hero",
  "gallery",
  "facade",
  "construction",
  "floor_plan",
  "drone",
] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

/** Matches the `property_resources_resource_type_check` constraint. */
export const RESOURCE_TYPES = [
  "virtual-tour",
  "video",
  "drone-footage",
  "floor-plan",
  "brochure",
  "document",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Resource types that are always a link to somewhere else. */
export const EXTERNAL_RESOURCE_TYPES = [
  "virtual-tour",
  "video",
  "drone-footage",
] as const;

/** Resource types that are always a file we host. */
export const DOCUMENT_RESOURCE_TYPES = [
  "floor-plan",
  "brochure",
  "document",
] as const;

const IMAGE_TYPE_TO_CATEGORY: Readonly<Record<ImageType, MediaCategory>> = {
  hero: "hero",
  gallery: "gallery",
  facade: "facade",
  construction: "construction",
  floor_plan: "floor-plans",
  drone: "drone",
};

/** Storage folder an image of this type belongs in. */
export function categoryForImageType(imageType: ImageType): MediaCategory {
  return IMAGE_TYPE_TO_CATEGORY[imageType];
}

/**
 * Storage folder a hosted document belongs in.
 *
 * All document kinds share one folder: they are the same sort of object, and
 * the row's `resource_type` already records which kind it is. Splitting them
 * across folders would add path variants without adding information.
 */
export function categoryForResourceType(): MediaCategory {
  return "documents";
}

export function isImageType(value: unknown): value is ImageType {
  return (
    typeof value === "string" && (IMAGE_TYPES as readonly string[]).includes(value)
  );
}

export function isResourceType(value: unknown): value is ResourceType {
  return (
    typeof value === "string" &&
    (RESOURCE_TYPES as readonly string[]).includes(value)
  );
}

export function isExternalResourceType(value: ResourceType): boolean {
  return (EXTERNAL_RESOURCE_TYPES as readonly string[]).includes(value);
}

export function isDocumentResourceType(value: ResourceType): boolean {
  return (DOCUMENT_RESOURCE_TYPES as readonly string[]).includes(value);
}

/* ---------------------------------------------------------------------- */
/* Accepted file formats                                                  */
/* ---------------------------------------------------------------------- */

/**
 * Image formats accepted for upload.
 *
 * Two deliberate exclusions:
 *
 * - **SVG.** An SVG is a document that can carry script and external
 *   references. Served from our own origin it would be a stored-XSS vector.
 *   Accepting it needs a reviewed sanitisation step, which does not exist
 *   yet, so it is refused rather than half-handled.
 * - **AVIF.** Decoding depends on the `sharp` build behind `next/image`, and
 *   that has not been verified in this deployment. Adding a format whose
 *   rendering is unconfirmed risks accepting an upload the public site cannot
 *   display. It can be enabled once checked.
 */
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/** PDF only for now: it is the one format that renders predictably everywhere. */
export const DOCUMENT_MIME_TYPES = ["application/pdf"] as const;

export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

/**
 * The extension each accepted type is stored with.
 *
 * The extension is derived from the verified MIME type, never taken from the
 * uploaded filename. That is what stops `invoice.php.jpg` or a `.jpg` that is
 * really something else from reaching the bucket with a misleading name.
 */
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Extensions a browser may legitimately report for each accepted type. */
const ALLOWED_EXTENSIONS_BY_MIME: Readonly<Record<string, readonly string[]>> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

export function isImageMimeType(value: string): value is ImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function isDocumentMimeType(value: string): value is DocumentMimeType {
  return (DOCUMENT_MIME_TYPES as readonly string[]).includes(value);
}

export function storageExtensionForMimeType(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType] ?? null;
}

/**
 * True when a filename's extension is consistent with its reported MIME type.
 *
 * A mismatch is not proof of an attack — browsers get this wrong — but it is
 * enough of a signal to refuse and ask the administrator to check the file.
 */
export function extensionMatchesMimeType(
  filename: string,
  mimeType: string,
): boolean {
  const allowed = ALLOWED_EXTENSIONS_BY_MIME[mimeType];

  if (!allowed) {
    return false;
  }

  const lastDot = filename.lastIndexOf(".");

  if (lastDot === -1 || lastDot === filename.length - 1) {
    return false;
  }

  return allowed.includes(filename.slice(lastDot + 1).toLowerCase());
}

/* ---------------------------------------------------------------------- */
/* Size limits                                                            */
/* ---------------------------------------------------------------------- */

const MEGABYTE = 1024 * 1024;

/**
 * Upload ceilings per category, in bytes.
 *
 * Chosen to fit comfortably inside Supabase's default 50 MB object limit
 * while leaving headroom, and set per category because a floor plan is
 * legitimately a larger, more detailed file than a photograph, and a
 * brochure larger still.
 *
 * The browser checks these for immediate feedback; the Server Action checks
 * them again because the browser's answer is a courtesy, not a control.
 */
export const SIZE_LIMITS: Readonly<Record<MediaCategory, number>> = {
  hero: 15 * MEGABYTE,
  gallery: 15 * MEGABYTE,
  facade: 15 * MEGABYTE,
  construction: 15 * MEGABYTE,
  drone: 15 * MEGABYTE,
  "floor-plans": 20 * MEGABYTE,
  documents: 25 * MEGABYTE,
};

export function sizeLimitFor(category: MediaCategory): number {
  return SIZE_LIMITS[category];
}

/** Human-readable size, for validation messages and file listings. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < MEGABYTE) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  const megabytes = bytes / MEGABYTE;

  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

/**
 * Smallest hero photograph worth publishing.
 *
 * Advisory rather than enforced: the hero renders wide on desktop, and a
 * narrow image is visibly soft there. Warning is more useful than refusing,
 * because the administrator may have no better file available.
 */
export const RECOMMENDED_HERO_WIDTH = 1600;

/* ---------------------------------------------------------------------- */
/* Storage paths                                                          */
/* ---------------------------------------------------------------------- */

const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * The one shape a stored object name may take.
 *
 * Mirrors the regex in `public.is_valid_property_media_path()`. Anchored, and
 * every segment is either a UUID or a fixed category word, so traversal
 * sequences cannot match — `..` is not a UUID. Path escape is prevented by
 * the grammar rather than by stripping characters.
 */
export const STORAGE_PATH_PATTERN = new RegExp(
  `^properties/(${UUID_SEGMENT})/(${MEDIA_CATEGORIES.join("|")})/(${UUID_SEGMENT})\\.([a-z0-9]{2,5})$`,
  "i",
);

export interface ParsedStoragePath {
  readonly propertyId: string;
  readonly category: MediaCategory;
  readonly objectId: string;
  readonly extension: string;
}

/**
 * Decomposes a storage path, or returns null when it does not match.
 *
 * Callers use the `propertyId` this returns to confirm an object belongs to
 * the property being edited — the check that stops one property's media being
 * attached to, or deleted from, another.
 */
export function parseStoragePath(path: string): ParsedStoragePath | null {
  const match = STORAGE_PATH_PATTERN.exec(path);

  if (!match) {
    return null;
  }

  const [, propertyId, category, objectId, extension] = match;

  return {
    propertyId: propertyId.toLowerCase(),
    category: category.toLowerCase() as MediaCategory,
    objectId: objectId.toLowerCase(),
    extension: extension.toLowerCase(),
  };
}

/** True when a path matches the required layout. */
export function isValidStoragePath(path: string): boolean {
  return parseStoragePath(path) !== null;
}

/**
 * Builds the object name for a new upload.
 *
 * The name is generated here, server-side, from a fresh UUID and the
 * extension implied by the verified MIME type. The uploaded filename never
 * contributes to it, which is what guarantees the result matches
 * `STORAGE_PATH_PATTERN` and cannot collide with or overwrite an existing
 * object.
 *
 * @param generateId injected only so tests can assert an exact path
 */
export function buildStoragePath(
  propertyId: string,
  category: MediaCategory,
  mimeType: string,
  generateId: () => string = () => crypto.randomUUID(),
): string | null {
  const extension = storageExtensionForMimeType(mimeType);

  if (!extension) {
    return null;
  }

  const path = `properties/${propertyId}/${category}/${generateId()}.${extension}`;

  // A property id that is not a UUID would produce a path the storage policy
  // rejects. Failing here turns that into a clear error instead of an opaque
  // upload denial.
  return isValidStoragePath(path) ? path : null;
}
