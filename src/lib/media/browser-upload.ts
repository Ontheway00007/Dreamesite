"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  isImageMimeType,
  isDocumentMimeType,
  sizeLimitFor,
  formatFileSize,
  extensionMatchesMimeType,
  type MediaCategory,
} from "@/lib/media/config";

/**
 * Direct browser-to-Storage upload.
 *
 * The file never passes through the Next.js server. A 20 MB floor plan sent
 * through a Server Action would hit the request-body limit and, below it,
 * would still be buffered in server memory for no benefit — the destination
 * is Supabase either way.
 *
 * The upload runs under the administrator's own session, so the Storage
 * policy from migration 0009 evaluates it: bucket, admin status, and path
 * layout are all re-checked server-side. This function cannot grant itself
 * access by choosing a different path.
 */

export interface BrowserUploadResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Client-side pre-checks, mirroring `validateUploadRequest` on the server.
 *
 * Purely a courtesy: it saves an administrator waiting for a 40 MB transfer
 * only to be told the limit is 15 MB. The server repeats every one of these
 * checks and is the authority — nothing here is a security control.
 */
export function precheckFile(
  file: File,
  category: MediaCategory,
): string | null {
  const wantsDocument = category === "documents";

  if (wantsDocument) {
    if (!isDocumentMimeType(file.type)) {
      return "Documents must be PDF files.";
    }
  } else if (!isImageMimeType(file.type)) {
    return "Images must be JPEG, PNG or WebP. SVG is not accepted.";
  }

  if (!extensionMatchesMimeType(file.name, file.type)) {
    return "The file extension does not match its contents. Check you selected the right file.";
  }

  if (file.size <= 0) {
    return "That file appears to be empty.";
  }

  const limit = sizeLimitFor(category);

  if (file.size > limit) {
    return `That file is ${formatFileSize(file.size)}. The limit here is ${formatFileSize(limit)}.`;
  }

  return null;
}

/**
 * Reads pixel dimensions without decoding the file twice.
 *
 * Stored alongside the row so the media manager can warn that a hero
 * photograph is narrower than the width it will be displayed at. Returns null
 * for anything that will not decode — the dimensions are useful, not
 * required, so failing to read them must not fail the upload.
 */
export async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return null;
  }
}

/**
 * Uploads a file to the path the server issued.
 *
 * `upsert: false` is deliberate. The path contains a freshly generated UUID,
 * so a collision would mean something has gone wrong; failing is the correct
 * response, and allowing an overwrite would turn a bug into silent data loss.
 *
 * Supabase's JS client does not expose upload progress, so callers show an
 * indeterminate indicator rather than a percentage. A fabricated percentage
 * would be worse than none.
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: File,
): Promise<BrowserUploadResult> {
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    // The message is not surfaced verbatim: a Storage error can describe the
    // bucket layout or the policy that refused. The caller shows its own text.
    console.error("[media] Upload failed", error);
    return { ok: false, error: "The upload failed. Please try again." };
  }

  return { ok: true };
}
