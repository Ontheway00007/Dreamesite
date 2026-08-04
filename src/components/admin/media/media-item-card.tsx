"use client";

import { useState, useTransition } from "react";

import {
  deleteImage,
  deleteResource,
  reorderImages,
  reorderResources,
  replaceImageFile,
  setHeroImage,
  setImagePublished,
  setResourcePublished,
  updateImageMetadata,
  updateResourceMetadata,
  type MediaActionResult,
} from "@/lib/admin/actions/media-actions";
import { requestImageUpload } from "@/lib/admin/actions/media-actions";
import type {
  AdminMediaItem,
  AdminResourceItem,
} from "@/lib/admin/media-repository";
import {
  formatFileSize,
  type ImageType,
  type ResourceType,
} from "@/lib/media/config";
import {
  precheckFile,
  readImageDimensions,
  uploadToStorage,
} from "@/lib/media/browser-upload";
import { categoryForImageType } from "@/lib/media/config";
import { checkHeroEligibility } from "@/lib/media/validation";
import { Field } from "@/components/admin/form-controls";
import { AdminAlert } from "@/components/admin/admin-alert";

/**
 * One media item and its actions.
 *
 * Every action is a visible, focusable button. Nothing is revealed on hover:
 * a control that only exists while a pointer is over it cannot be reached by
 * keyboard or touch, and this interface has to work on a tablet on site.
 *
 * Reordering uses explicit up and down buttons rather than dragging. Drag is a
 * pleasant addition for a mouse and an impossibility without one, so the
 * button pair is the interface rather than a fallback for it.
 */

interface ImageCardProps {
  readonly kind: "image";
  readonly item: AdminMediaItem;
  readonly propertyId: string;
  readonly siblingIds: readonly string[];
  readonly canBeHero: boolean;
  readonly isHero: boolean;
  readonly onChanged: () => void;
}

interface ResourceCardProps {
  readonly kind: "resource";
  readonly item: AdminResourceItem;
  readonly propertyId: string;
  readonly siblingIds: readonly string[];
  readonly onChanged: () => void;
}

type Props = ImageCardProps | ResourceCardProps;

/** Moves an id one place in either direction, returning the new order. */
function moved(
  ids: readonly string[],
  id: string,
  direction: -1 | 1,
): string[] | null {
  const index = ids.indexOf(id);
  const target = index + direction;

  if (index === -1 || target < 0 || target >= ids.length) {
    return null;
  }

  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];

  return next;
}

/**
 * Why this image cannot be the main one yet, or null when it can.
 *
 * Derived from `checkHeroEligibility` so there is one rule, not a second copy
 * of it in the UI. Only the first reason is shown — the control is a few words
 * wide, and an administrator fixing one thing at a time is fine here.
 */
function heroBlockedReason(item: AdminMediaItem): string | null {
  const eligibility = checkHeroEligibility({
    imageType: item.imageType,
    hasSource: item.source !== null,
    altText: item.altText,
    isPublished: item.isPublished,
  });

  if (eligibility.ok) {
    return null;
  }

  const first = eligibility.errors[0];

  switch (first.field) {
    case "isPublished":
      return "Publish to use as main image";
    case "altText":
      return "Add alt text to use as main image";
    default:
      return null;
  }
}

export function MediaItemCard(props: Props) {
  const { propertyId, siblingIds, onChanged } = props;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const isImage = props.kind === "image";
  const id = props.item.id;
  const position = siblingIds.indexOf(id);
  const isFirst = position <= 0;
  const isLast = position === siblingIds.length - 1;

  function apply(result: MediaActionResult): boolean {
    setWarning(result.warning ?? null);

    if (!result.success) {
      setError(result.error ?? "Something went wrong.");
      return false;
    }

    setError(null);
    onChanged();
    return true;
  }

  function run(action: () => Promise<MediaActionResult>) {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      apply(await action());
    });
  }

  function handleMove(direction: -1 | 1) {
    const nextOrder = moved(siblingIds, id, direction);

    if (!nextOrder) {
      return;
    }

    run(() =>
      isImage
        ? reorderImages(
            propertyId,
            (props.item as AdminMediaItem).imageType as ImageType,
            nextOrder,
          )
        : reorderResources(
            propertyId,
            (props.item as AdminResourceItem).resourceType as ResourceType,
            nextOrder,
          ),
    );
  }

  function handleDelete() {
    const label = isImage
      ? ((props.item as AdminMediaItem).altText ?? "this image")
      : (props.item as AdminResourceItem).title;

    const isStored = props.item.source.kind === "storage";

    const message = isStored
      ? `Delete ${label}? The file is permanently removed from storage. This cannot be undone.`
      : `Remove ${label}? The link is removed from this property. The linked content itself is not affected.`;

    if (!window.confirm(message)) {
      return;
    }

    run(() =>
      isImage ? deleteImage(propertyId, id) : deleteResource(propertyId, id),
    );
  }

  return (
    <li className="border-border bg-surface rounded-xl border p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <MediaThumbnail item={props.item} isImage={isImage} />

        <div className="min-w-0 flex-1 space-y-3">
          <MediaSummary {...props} />

          {error && <AdminAlert tone="error" title={error} />}
          {warning && <AdminAlert tone="warning" title={warning} />}

          {/* Actions. Ordered by how often they are used, not by severity,
              except that Delete is last and visually separated. */}
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              onClick={() =>
                run(() =>
                  isImage
                    ? setImagePublished(propertyId, id, !props.item.isPublished)
                    : setResourcePublished(
                        propertyId,
                        id,
                        !props.item.isPublished,
                      ),
                )
              }
              disabled={isPending}
            >
              {props.item.isPublished ? "Unpublish" : "Publish"}
            </ActionButton>

            <ActionButton
              onClick={() => setIsEditing((open) => !open)}
              disabled={isPending}
              expanded={isEditing}
            >
              {isEditing ? "Close details" : "Edit details"}
            </ActionButton>

            {/*
              Offered only when it would actually work.

              A hero must be a published, described photograph — the same five
              conditions `checkHeroEligibility` and `set_property_hero_image`
              both enforce. Offering the button on a draft and then refusing the
              click teaches an administrator that the button is unreliable; the
              title says what to fix instead.
            */}
            {isImage &&
              props.canBeHero &&
              !props.isHero &&
              (heroBlockedReason(props.item) ? (
                <span
                  className="text-foreground-subtle text-xs"
                  title={heroBlockedReason(props.item) ?? undefined}
                >
                  {heroBlockedReason(props.item)}
                </span>
              ) : (
                <ActionButton
                  onClick={() => run(() => setHeroImage(propertyId, id))}
                  disabled={isPending}
                >
                  Make main image
                </ActionButton>
              ))}

            {props.item.source.kind === "storage" && isImage && (
              <ReplaceButton
                propertyId={propertyId}
                imageId={id}
                imageType={(props.item as AdminMediaItem).imageType}
                disabled={isPending}
                onResult={apply}
              />
            )}

            {/* Renders nothing when the source cannot be resolved. */}
            <PreviewLink item={props.item} />

            {/* Reorder. Disabled at the ends rather than hidden, so the
                control does not move around as items are shuffled. */}
            <span className="ml-auto flex items-center gap-1">
              <IconButton
                label={`Move earlier (currently ${position + 1} of ${siblingIds.length})`}
                onClick={() => handleMove(-1)}
                disabled={isPending || isFirst}
              >
                ↑
              </IconButton>
              <IconButton
                label={`Move later (currently ${position + 1} of ${siblingIds.length})`}
                onClick={() => handleMove(1)}
                disabled={isPending || isLast}
              >
                ↓
              </IconButton>
            </span>

            <ActionButton onClick={handleDelete} disabled={isPending} tone="danger">
              Delete
            </ActionButton>
          </div>

          {isEditing && (
            <MetadataForm
              {...props}
              disabled={isPending}
              onSubmit={(action) => run(action)}
            />
          )}
        </div>
      </div>
    </li>
  );
}

/* --- Thumbnail --------------------------------------------------------- */

function MediaThumbnail({
  item,
  isImage,
}: {
  item: AdminMediaItem | AdminResourceItem;
  isImage: boolean;
}) {
  const url = "previewUrl" in item ? item.previewUrl : null;

  if (isImage && url) {
    return (
      <div className="bg-background-alt border-border relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border">
        {/*
          A plain <img> rather than next/image. Admin thumbnails are 112px
          wide and never need optimising, and externally hosted images would
          otherwise each require their host to be added to
          next.config remotePatterns before they would render at all.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="bg-background-alt border-border text-foreground-subtle flex h-20 w-28 shrink-0 items-center justify-center rounded-lg border text-xs font-medium uppercase tracking-wider">
      {isImage ? "Image" : "File"}
    </div>
  );
}

/* --- Summary ----------------------------------------------------------- */

function MediaSummary(props: Props) {
  const { item } = props;
  const isImage = props.kind === "image";

  const title = isImage
    ? ((item as AdminMediaItem).altText ?? "No description yet")
    : (item as AdminResourceItem).title;

  const hasAltText = isImage
    ? Boolean((item as AdminMediaItem).altText)
    : true;

  const details: string[] = [];

  if (item.source.kind === "external") {
    details.push("Linked");
  } else {
    details.push("Uploaded");
  }

  if ("width" in item && item.width && item.height) {
    details.push(`${item.width}×${item.height}`);
  }

  if (item.fileSizeBytes) {
    details.push(formatFileSize(item.fileSizeBytes));
  }

  if (item.originalFilename) {
    details.push(item.originalFilename);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={`text-sm font-medium ${
            hasAltText ? "text-foreground" : "text-foreground-subtle italic"
          }`}
        >
          {title}
        </p>

        {isImage && props.isHero && (
          <span className="bg-accent/20 text-accent rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            Main image
          </span>
        )}

        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            item.isPublished
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-zinc-500/20 text-zinc-400"
          }`}
        >
          {item.isPublished ? "Published" : "Draft"}
        </span>

        {/* A published image with no description is missing from the page for
            anyone using a screen reader, so it is flagged rather than left to
            be noticed. */}
        {isImage && item.isPublished && !hasAltText && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
            Needs a description
          </span>
        )}
      </div>

      <p className="text-foreground-subtle text-xs">{details.join(" · ")}</p>
    </div>
  );
}

/* --- Metadata form ---------------------------------------------------- */

function MetadataForm(
  props: Props & {
    disabled: boolean;
    onSubmit: (action: () => Promise<MediaActionResult>) => void;
  },
) {
  const isImage = props.kind === "image";
  const { item, propertyId, disabled, onSubmit } = props;

  const [altText, setAltText] = useState(
    isImage ? ((item as AdminMediaItem).altText ?? "") : "",
  );
  const [title, setTitle] = useState(
    isImage ? "" : (item as AdminResourceItem).title,
  );
  const [caption, setCaption] = useState(item.caption ?? "");

  return (
    <div className="border-border space-y-4 rounded-lg border border-dashed p-4">
      {isImage ? (
        <Field
          label="Description"
          required
          hint="What the image shows, for visitors who cannot see it. Required before publishing."
        >
          <textarea
            value={altText}
            onChange={(event) => setAltText(event.target.value)}
            rows={2}
            className="admin-input resize-none"
            placeholder="North-facing living area opening onto the courtyard"
          />
        </Field>
      ) : (
        <Field label="Title" required hint="Becomes the link text.">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="admin-input"
          />
        </Field>
      )}

      <Field label="Caption" hint="Optional. Shown to everyone beneath the item.">
        <input
          type="text"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          className="admin-input"
        />
      </Field>

      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSubmit(() =>
            isImage
              ? updateImageMetadata(propertyId, item.id, {
                  imageType: (item as AdminMediaItem).imageType,
                  altText,
                  caption,
                  isPublished: item.isPublished,
                })
              : updateResourceMetadata(propertyId, item.id, {
                  resourceType: (item as AdminResourceItem).resourceType,
                  title,
                  caption,
                  isPublished: item.isPublished,
                }),
          )
        }
        className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
      >
        Save details
      </button>
    </div>
  );
}

/* --- Replace ---------------------------------------------------------- */

/**
 * Swaps the file behind an existing image.
 *
 * The new file is uploaded to a fresh path before the row is repointed, and
 * the old object is deleted only afterwards, so an interrupted replacement
 * leaves the previous image working.
 */
function ReplaceButton({
  propertyId,
  imageId,
  imageType,
  disabled,
  onResult,
}: {
  propertyId: string;
  imageId: string;
  imageType: ImageType;
  disabled: boolean;
  onResult: (result: MediaActionResult) => boolean;
}) {
  const [busy, setBusy] = useState(false);
  const inputId = `replace-${imageId}`;

  async function handleFile(file: File) {
    setBusy(true);

    try {
      const precheck = precheckFile(file, categoryForImageType(imageType));

      if (precheck) {
        onResult({ success: false, error: precheck });
        return;
      }

      const ticket = await requestImageUpload(
        propertyId,
        imageType,
        file.name,
        file.type,
        file.size,
      );

      if (!ticket.success || !ticket.path || !ticket.bucket) {
        onResult({
          success: false,
          error: ticket.error ?? "Could not start the upload.",
          fieldErrors: ticket.fieldErrors,
        });
        return;
      }

      const upload = await uploadToStorage(ticket.bucket, ticket.path, file);

      if (!upload.ok) {
        onResult({ success: false, error: upload.error });
        return;
      }

      const dimensions = await readImageDimensions(file);

      onResult(
        await replaceImageFile(propertyId, imageId, {
          newPath: ticket.path,
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          width: dimensions?.width,
          height: dimensions?.height,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label
        htmlFor={inputId}
        className={`border-border text-foreground-muted hover:bg-surface-raised cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
          disabled || busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {busy ? "Replacing…" : "Replace file"}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />
    </>
  );
}

/* --- Small controls --------------------------------------------------- */

function PreviewLink({ item }: { item: AdminMediaItem | AdminResourceItem }) {
  const url =
    "previewUrl" in item ? item.previewUrl : (item as AdminResourceItem).resolvedUrl;

  if (!url) {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
    >
      Preview
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone,
  expanded,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
        tone === "danger"
          ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
          : "border-border text-foreground-muted hover:bg-surface-raised"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // The glyph is decorative; the accessible name carries the position.
      aria-label={label}
      className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-30"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
