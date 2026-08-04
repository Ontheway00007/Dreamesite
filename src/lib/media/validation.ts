import {
  categoryForImageType,
  extensionMatchesMimeType,
  formatFileSize,
  isDocumentMimeType,
  isImageMimeType,
  isImageType,
  isResourceType,
  parseStoragePath,
  sizeLimitFor,
  type ImageType,
  type MediaCategory,
  type ResourceType,
} from "@/lib/media/config";
import {
  ErrorBag,
  invalid,
  isBlank,
  valid,
  type ValidationResult,
} from "@/lib/admin/validation/result";

/**
 * Media validation.
 *
 * Three separate jobs, kept apart because they answer different questions:
 *
 *   - `validateUploadRequest` — may this file be accepted at all?
 *   - `validateExternalUrl`  — is this link safe to put in an `href`?
 *   - `assertPathBelongsTo`  — does this stored object belong to the property
 *                              the caller claims to be editing?
 *
 * The third is the one that prevents cross-property tampering, and it is
 * cheap: the property id is part of the path, so ownership is checked by
 * comparison rather than by a database round trip.
 *
 * Pure and dependency-free, so every rule is testable without a session, a
 * database or a file.
 */

/* ---------------------------------------------------------------------- */
/* Text limits                                                            */
/* ---------------------------------------------------------------------- */

export const TEXT_LIMITS = {
  altText: 300,
  caption: 300,
  title: 160,
  filename: 255,
} as const;

/**
 * Rejects markup in text destined for the public site.
 *
 * React escapes interpolated text, so a caption containing `<script>` renders
 * as visible characters rather than executing — this is not the control that
 * prevents XSS. It is refused anyway for two reasons: an administrator typing
 * a tag has misunderstood what the field does, and the guarantee should not
 * depend on every future consumer choosing to escape. If a caption is ever
 * fed to something that renders HTML, this is what makes that safe.
 */
const MARKUP_PATTERN = /<[^>]*>/;

function checkPublicText(
  errors: ErrorBag,
  field: string,
  label: string,
  value: string | undefined,
  limit: number,
): void {
  if (value === undefined) {
    return;
  }

  if (value.length > limit) {
    errors.add(field, `Keep the ${label} to ${limit} characters or fewer.`);
    return;
  }

  if (MARKUP_PATTERN.test(value)) {
    errors.add(
      field,
      `Remove the HTML tags from the ${label} — it is shown as plain text.`,
    );
  }
}

/* ---------------------------------------------------------------------- */
/* External URLs                                                          */
/* ---------------------------------------------------------------------- */

/**
 * The only protocol accepted for external media.
 *
 * `javascript:` in an `href` executes on click, which is a stored-XSS vector
 * reachable by anyone who can save a media record. `data:` can carry an HTML
 * document with the same effect. `file:` points at the visitor's own disk.
 * None of them has a legitimate use for a tour or video link, so rather than
 * enumerating what to block, only `https:` is allowed through.
 *
 * Plain `http:` is excluded as well: the site is served over HTTPS, so an
 * `http:` embed is blocked as mixed content and a plain link downgrades the
 * visitor's connection.
 */
const ALLOWED_PROTOCOL = "https:";

export interface ExternalUrlResult {
  readonly url: string;
  readonly host: string;
}

/**
 * Validates and normalises an external media URL.
 *
 * Returns the URL as the parser serialises it, which removes a class of
 * look-alike inputs — trailing whitespace, uppercase scheme, missing
 * trailing slash on a bare host.
 */
export function validateExternalUrl(
  rawUrl: string,
  field = "url",
): ValidationResult<ExternalUrlResult> {
  const errors = new ErrorBag();
  const trimmed = rawUrl.trim();

  if (isBlank(trimmed)) {
    errors.add(field, "Add a link.");
    return invalid(errors.all);
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    errors.add(
      field,
      "That is not a complete web address. It should start with https://",
    );
    return invalid(errors.all);
  }

  if (parsed.protocol !== ALLOWED_PROTOCOL) {
    // Deliberately does not echo the protocol back. Naming it invites
    // another attempt at the same idea; stating the requirement does not.
    errors.add(field, "Links must start with https://");
    return invalid(errors.all);
  }

  // A URL carrying credentials would put them in the page source and in the
  // referrer. It is also almost always a paste accident.
  if (parsed.username !== "" || parsed.password !== "") {
    errors.add(field, "Remove the username and password from the link.");
    return invalid(errors.all);
  }

  if (isBlank(parsed.hostname)) {
    errors.add(field, "That link has no website address in it.");
    return invalid(errors.all);
  }

  // A link to the visitor's own machine is never what was intended, and it
  // would be a confusing dead end on the public site.
  const host = parsed.hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1") {
    errors.add(field, "That link points at a local machine, not a public site.");
    return invalid(errors.all);
  }

  return valid({ url: parsed.toString(), host });
}

/* ---------------------------------------------------------------------- */
/* Upload requests                                                        */
/* ---------------------------------------------------------------------- */

export interface UploadRequest {
  readonly propertyId: string;
  /** Image category, or 'documents' for a hosted file. */
  readonly category: MediaCategory;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/**
 * Decides whether a file may be uploaded.
 *
 * Runs on the server, which is the only place the answer counts. The browser
 * checks the same rules first so the administrator learns about a 30 MB file
 * before waiting for it to transfer, but that check is a convenience and is
 * assumed to be absent or wrong.
 */
export function validateUploadRequest(
  request: UploadRequest,
): ValidationResult<UploadRequest> {
  const errors = new ErrorBag();

  if (isBlank(request.propertyId)) {
    errors.add("propertyId", "The property could not be identified.");
  }

  if (isBlank(request.filename)) {
    errors.add("file", "Choose a file.");
  } else if (request.filename.length > TEXT_LIMITS.filename) {
    errors.add("file", "That filename is too long.");
  }

  const wantsDocument = request.category === "documents";

  // The MIME type decides what the file is allowed to be, and the extension
  // must agree with it. Checking both catches a PDF renamed to .jpg and a
  // browser reporting a type the extension contradicts.
  if (wantsDocument) {
    if (!isDocumentMimeType(request.mimeType)) {
      errors.add("file", "Documents must be PDF files.");
    }
  } else if (!isImageMimeType(request.mimeType)) {
    errors.add(
      "file",
      "Images must be JPEG, PNG or WebP. SVG is not accepted.",
    );
  }

  if (
    !isBlank(request.filename) &&
    (isImageMimeType(request.mimeType) || isDocumentMimeType(request.mimeType)) &&
    !extensionMatchesMimeType(request.filename, request.mimeType)
  ) {
    errors.add(
      "file",
      "The file extension does not match its contents. Check you selected the right file.",
    );
  }

  if (!Number.isFinite(request.sizeBytes) || request.sizeBytes <= 0) {
    errors.add("file", "That file appears to be empty.");
  } else {
    const limit = sizeLimitFor(request.category);

    if (request.sizeBytes > limit) {
      errors.add(
        "file",
        `That file is ${formatFileSize(request.sizeBytes)}. The limit here is ${formatFileSize(limit)}.`,
      );
    }
  }

  return errors.isEmpty ? valid(request) : invalid(errors.all);
}

/* ---------------------------------------------------------------------- */
/* Storage path ownership                                                 */
/* ---------------------------------------------------------------------- */

export type PathOwnershipFailure =
  | "malformed"
  | "wrong-property"
  | "wrong-category";

export interface PathOwnershipResult {
  readonly ok: boolean;
  readonly reason?: PathOwnershipFailure;
}

/**
 * Confirms a storage path belongs to the property being edited.
 *
 * This is the IDOR guard for every operation that takes a path from the
 * client — delete, replace, and finalising an upload. Without it, an
 * administrator editing property A could name an object under property B and
 * have it deleted or reattached.
 *
 * The property id is a segment of the path, so the check is a comparison. It
 * does not prove the object exists — Storage answers that — but it does prove
 * that if it exists, it is this property's.
 *
 * `expectedCategory` additionally pins the folder, so a path under
 * `documents/` cannot be attached as a gallery image.
 */
export function checkPathOwnership(
  path: string,
  expectedPropertyId: string,
  expectedCategory?: MediaCategory,
): PathOwnershipResult {
  const parsed = parseStoragePath(path);

  if (!parsed) {
    return { ok: false, reason: "malformed" };
  }

  if (parsed.propertyId !== expectedPropertyId.toLowerCase()) {
    return { ok: false, reason: "wrong-property" };
  }

  if (expectedCategory && parsed.category !== expectedCategory) {
    return { ok: false, reason: "wrong-category" };
  }

  return { ok: true };
}

/** Administrator-facing explanation for a rejected path. */
export function describePathFailure(reason: PathOwnershipFailure): string {
  switch (reason) {
    case "malformed":
      return "That file reference is not valid.";
    case "wrong-property":
      return "That file belongs to a different property.";
    case "wrong-category":
      return "That file is not stored in the expected place for this media type.";
  }
}

/* ---------------------------------------------------------------------- */
/* Image metadata                                                         */
/* ---------------------------------------------------------------------- */

export interface ImageMetadataInput {
  readonly imageType: string;
  readonly altText?: string;
  readonly caption?: string;
  readonly isPublished: boolean;
}

export interface ValidatedImageMetadata {
  readonly imageType: ImageType;
  readonly altText?: string;
  readonly caption?: string;
  readonly isPublished: boolean;
}

/**
 * Alt-text policy, stated once so it can be documented and tested.
 *
 * **Publishing an image requires alt text. All image categories, no
 * exceptions.**
 *
 * The tempting exception is a "decorative" image that needs no description.
 * None of these categories is decorative: every one of them shows something
 * about the home, which is the whole reason it is published. A gallery
 * photograph without a description is simply missing from the page for
 * someone using a screen reader.
 *
 * The requirement applies at publication rather than at upload, so an
 * administrator can upload a batch and describe them afterwards without the
 * form fighting them.
 */
export function requiresAltTextToPublish(): boolean {
  return true;
}

export function validateImageMetadata(
  input: ImageMetadataInput,
): ValidationResult<ValidatedImageMetadata> {
  const errors = new ErrorBag();

  if (!isImageType(input.imageType)) {
    errors.add("imageType", "Choose a valid image category.");
  }

  checkPublicText(
    errors,
    "altText",
    "description",
    input.altText,
    TEXT_LIMITS.altText,
  );
  checkPublicText(
    errors,
    "caption",
    "caption",
    input.caption,
    TEXT_LIMITS.caption,
  );

  if (input.isPublished && requiresAltTextToPublish() && isBlank(input.altText)) {
    errors.add(
      "altText",
      "Describe this image before publishing it, so it is not missing for visitors using a screen reader.",
    );
  }

  if (!errors.isEmpty) {
    return invalid(errors.all);
  }

  const altText = input.altText?.trim();
  const caption = input.caption?.trim();

  return valid({
    imageType: input.imageType as ImageType,
    altText: altText === "" ? undefined : altText,
    caption: caption === "" ? undefined : caption,
    isPublished: input.isPublished,
  });
}

/* ---------------------------------------------------------------------- */
/* Resource metadata                                                      */
/* ---------------------------------------------------------------------- */

export interface ResourceMetadataInput {
  readonly resourceType: string;
  readonly title: string;
  readonly caption?: string;
  readonly isPublished: boolean;
}

export interface ValidatedResourceMetadata {
  readonly resourceType: ResourceType;
  readonly title: string;
  readonly caption?: string;
  readonly isPublished: boolean;
}

export function validateResourceMetadata(
  input: ResourceMetadataInput,
): ValidationResult<ValidatedResourceMetadata> {
  const errors = new ErrorBag();

  if (!isResourceType(input.resourceType)) {
    errors.add("resourceType", "Choose a valid media type.");
  }

  if (isBlank(input.title)) {
    // The title is the visible link text, so an untitled resource renders as
    // an unlabelled link.
    errors.add("title", "Add a title — it becomes the link text.");
  } else {
    checkPublicText(errors, "title", "title", input.title, TEXT_LIMITS.title);
  }

  checkPublicText(
    errors,
    "caption",
    "caption",
    input.caption,
    TEXT_LIMITS.caption,
  );

  if (!errors.isEmpty) {
    return invalid(errors.all);
  }

  const caption = input.caption?.trim();

  return valid({
    resourceType: input.resourceType as ResourceType,
    title: input.title.trim(),
    caption: caption === "" ? undefined : caption,
    isPublished: input.isPublished,
  });
}

/* ---------------------------------------------------------------------- */
/* Hero eligibility                                                       */
/* ---------------------------------------------------------------------- */

export interface HeroCandidate {
  readonly imageType: string;
  readonly hasSource: boolean;
  readonly altText?: string | null;
  readonly isPublished: boolean;
}

/**
 * Whether an image may become the hero.
 *
 * A hero is published on cards, the property page and social previews, so it
 * has to be an image that resolves and is described. A floor plan is excluded:
 * it is a diagram, and a card showing a line drawing where every other card
 * shows a photograph reads as a fault.
 */
export function checkHeroEligibility(
  candidate: HeroCandidate,
): ValidationResult<true> {
  const errors = new ErrorBag();

  if (!isImageType(candidate.imageType)) {
    errors.add("imageType", "That is not an image.");
  } else if (candidate.imageType === "floor_plan") {
    errors.add(
      "imageType",
      "A floor plan cannot be the main image. Choose a photograph.",
    );
  }

  if (!candidate.hasSource) {
    errors.add("source", "That image has no file or link attached.");
  }

  if (candidate.isPublished && isBlank(candidate.altText ?? undefined)) {
    errors.add(
      "altText",
      "Describe this image before making it the main image.",
    );
  }

  return errors.isEmpty ? valid(true) : invalid(errors.all);
}

/* ---------------------------------------------------------------------- */
/* Reorder requests                                                       */
/* ---------------------------------------------------------------------- */

/**
 * Checks a reorder request before it reaches the database.
 *
 * The RPC validates ownership authoritatively — it can see which rows exist.
 * This catches the malformed cases early and cheaply: an empty list, a
 * duplicate, or a value that is not an id at all.
 */
export function validateReorderIds(
  ids: readonly string[],
): ValidationResult<readonly string[]> {
  const errors = new ErrorBag();

  if (ids.length === 0) {
    errors.add("order", "Nothing to reorder.");
    return invalid(errors.all);
  }

  if (new Set(ids).size !== ids.length) {
    errors.add("order", "The new order lists the same item twice.");
  }

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (ids.some((id) => !UUID.test(id))) {
    errors.add("order", "The new order contains an invalid reference.");
  }

  return errors.isEmpty ? valid(ids) : invalid(errors.all);
}

/** Category an image of this type must be stored under. */
export function expectedCategoryForImageType(imageType: ImageType): MediaCategory {
  return categoryForImageType(imageType);
}
