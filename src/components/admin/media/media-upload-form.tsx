"use client";

import { useId, useState, useTransition } from "react";

import {
  addExternalImage,
  addExternalResource,
  finaliseDocumentUpload,
  finaliseImageUpload,
  requestDocumentUpload,
  requestImageUpload,
  type MediaActionResult,
} from "@/lib/admin/actions/media-actions";
import {
  categoryForImageType,
  formatFileSize,
  sizeLimitFor,
  type ImageType,
  type ResourceType,
} from "@/lib/media/config";
import {
  precheckFile,
  readImageDimensions,
  uploadToStorage,
} from "@/lib/media/browser-upload";
import { AdminAlert } from "@/components/admin/admin-alert";
import { Field, Toggle } from "@/components/admin/form-controls";

/**
 * Adds media to a property.
 *
 * Two modes, because uploading a file and pasting a link are different tasks
 * with different fields. Combining them into one form with conditionally
 * hidden inputs would make both harder to follow.
 *
 * The file input is a standard `<input type="file">`. It is the control, not a
 * fallback behind a drop zone: it works with a keyboard, with a screen reader,
 * and on a phone, none of which is true of a drag target. Drag-and-drop can be
 * layered on later without changing this.
 */

type Mode = "upload" | "link";

interface Props {
  readonly propertyId: string;
  /** Image category, when this form adds images. */
  readonly imageType?: ImageType;
  /** Resource type, when this form adds documents or links. */
  readonly resourceType?: ResourceType;
  readonly allowUpload: boolean;
  readonly allowLink: boolean;
  readonly onAdded: () => void;
}

export function MediaUploadForm({
  propertyId,
  imageType,
  resourceType,
  allowUpload,
  allowLink,
  onAdded,
}: Props) {
  const [mode, setMode] = useState<Mode>(allowUpload ? "upload" : "link");
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [altText, setAltText] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [url, setUrl] = useState("");
  const [publishNow, setPublishNow] = useState(false);

  const fileInputId = useId();
  const isImageForm = imageType !== undefined;
  const category = isImageForm
    ? categoryForImageType(imageType)
    : "documents";

  function reset() {
    setAltText("");
    setTitle("");
    setCaption("");
    setUrl("");
    setPublishNow(false);
  }

  function handleResult(result: MediaActionResult): void {
    if (result.success) {
      setError(null);
      setStatus(result.warning ?? "Added.");
      reset();
      onAdded();
      return;
    }

    setStatus(null);
    setError(result.error ?? "Something went wrong.");
  }

  /**
   * Upload sequence: validate locally, ask the server for a path, send the
   * file straight to Storage, then have the server confirm and record it.
   */
  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setStatus("Checking the file…");

    try {
      const precheck = precheckFile(file, category);

      if (precheck) {
        setStatus(null);
        setError(precheck);
        return;
      }

      setStatus("Preparing…");

      const ticket = isImageForm
        ? await requestImageUpload(
            propertyId,
            imageType,
            file.name,
            file.type,
            file.size,
          )
        : await requestDocumentUpload(
            propertyId,
            file.name,
            file.type,
            file.size,
          );

      if (!ticket.success || !ticket.path || !ticket.bucket) {
        setStatus(null);
        setError(ticket.error ?? "Could not start the upload.");
        return;
      }

      setStatus(`Uploading ${formatFileSize(file.size)}…`);

      const upload = await uploadToStorage(ticket.bucket, ticket.path, file);

      if (!upload.ok) {
        setStatus(null);
        setError(upload.error ?? "The upload failed.");
        return;
      }

      setStatus("Saving…");

      const dimensions = await readImageDimensions(file);

      const result = isImageForm
        ? await finaliseImageUpload(propertyId, {
            path: ticket.path,
            imageType,
            altText,
            caption,
            isPublished: publishNow,
            originalFilename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            width: dimensions?.width,
            height: dimensions?.height,
          })
        : await finaliseDocumentUpload(propertyId, {
            path: ticket.path,
            resourceType: resourceType ?? "document",
            title: title || file.name,
            caption,
            isPublished: publishNow,
            originalFilename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          });

      handleResult(result);
    } finally {
      setBusy(false);
    }
  }

  function handleLink() {
    setError(null);
    setStatus(null);

    startTransition(async () => {
      const result = isImageForm
        ? await addExternalImage(propertyId, {
            url,
            imageType,
            altText,
            caption,
            isPublished: publishNow,
          })
        : await addExternalResource(propertyId, {
            url,
            resourceType: resourceType ?? "video",
            title,
            caption,
            isPublished: publishNow,
          });

      handleResult(result);
    });
  }

  const working = busy || isPending;
  const limit = formatFileSize(sizeLimitFor(category));

  return (
    <div className="border-border space-y-4 rounded-lg border border-dashed p-4">
      {allowUpload && allowLink && (
        <div className="flex gap-2" role="group" aria-label="How to add media">
          <ModeButton
            active={mode === "upload"}
            onClick={() => setMode("upload")}
          >
            Upload a file
          </ModeButton>
          <ModeButton active={mode === "link"} onClick={() => setMode("link")}>
            Add a link
          </ModeButton>
        </div>
      )}

      {error && <AdminAlert tone="error" title={error} />}

      {/*
        Progress is announced politely so a screen reader user hears that the
        upload finished without the message interrupting them mid-sentence.
        The indicator is indeterminate: Supabase's client does not report
        upload progress, and inventing a percentage would be a lie.
      */}
      {status && (
        <p role="status" aria-live="polite" className="text-foreground-muted text-sm">
          {working && (
            <span
              aria-hidden="true"
              className="border-accent mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent align-[-1px]"
            />
          )}
          {status}
        </p>
      )}

      {isImageForm ? (
        <Field
          label="Description"
          hint="What the image shows. Required before it can be published."
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
        <Field
          label="Title"
          required={mode === "link"}
          hint={
            mode === "upload"
              ? "Becomes the download link text. Defaults to the filename."
              : "Becomes the link text."
          }
        >
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="admin-input"
            placeholder="Floor plan (PDF)"
          />
        </Field>
      )}

      <Field label="Caption" hint="Optional.">
        <input
          type="text"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          className="admin-input"
        />
      </Field>

      {mode === "link" ? (
        <>
          <Field label="Link" required hint="Must start with https://">
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="admin-input"
              placeholder="https://my.matterport.com/show/?m=…"
            />
          </Field>

          <Toggle
            label="Publish immediately"
            checked={publishNow}
            onChange={setPublishNow}
          />

          <button
            type="button"
            onClick={handleLink}
            disabled={working || url.trim() === ""}
            className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {working ? "Adding…" : "Add link"}
          </button>
        </>
      ) : (
        <>
          <Toggle
            label="Publish immediately"
            checked={publishNow}
            onChange={setPublishNow}
            hint={
              isImageForm
                ? "An image needs a description before it can be published."
                : undefined
            }
          />

          <div className="space-y-1.5">
            <label
              htmlFor={fileInputId}
              className="text-foreground-muted block text-sm font-medium"
            >
              Choose a file
            </label>
            <input
              id={fileInputId}
              type="file"
              accept={
                isImageForm
                  ? "image/jpeg,image/png,image/webp"
                  : "application/pdf"
              }
              disabled={working}
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Cleared so selecting the same file twice still fires.
                event.target.value = "";
                if (file) void handleFile(file);
              }}
              className="text-foreground-muted file:bg-surface-raised file:border-border file:text-foreground hover:file:bg-surface w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:opacity-60"
            />
            <p className="text-foreground-subtle text-xs">
              {isImageForm
                ? `JPEG, PNG or WebP, up to ${limit}.`
                : `PDF, up to ${limit}.`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-accent/15 text-accent"
          : "text-foreground-muted hover:bg-surface-raised"
      }`}
    >
      {children}
    </button>
  );
}
