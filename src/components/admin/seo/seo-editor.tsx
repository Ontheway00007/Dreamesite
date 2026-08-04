"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  updatePropertySeo,
  type SeoActionResult,
} from "@/lib/admin/actions/seo-actions";
import {
  SEO_LIMITS,
  type SeoAdvisory,
} from "@/lib/admin/validation/seo";
import type { FieldError } from "@/lib/admin/validation/result";
import type { AdminMediaItem } from "@/lib/admin/media-repository";
import { AdminAlert } from "@/components/admin/admin-alert";
import { Field, Toggle } from "@/components/admin/form-controls";

/**
 * Per-property search and social settings.
 *
 * Every field is optional and every one shows what will be used when it is left
 * blank. That is the point of the tab: an administrator should be able to see
 * that the derived title is already correct and close it again, rather than
 * feeling obliged to fill in five boxes.
 *
 * The preview is a plain rendering of the resolved title and description at the
 * lengths search results actually use. Not a pixel-accurate mock of Google —
 * that would imply a precision nobody has.
 */

interface Props {
  readonly propertyId: string;
  /** Current stored overrides. */
  readonly seo: {
    readonly metaTitle: string | null;
    readonly metaDescription: string | null;
    readonly ogImageId: string | null;
    readonly canonicalUrl: string | null;
    readonly noindex: boolean;
  };
  /** What the page would use with no override at all. */
  readonly derived: {
    readonly title: string;
    readonly description: string;
    readonly canonicalUrl: string;
  };
  /** Images on this property, for the social image picker. */
  readonly images: readonly AdminMediaItem[];
}

function toFieldMap(errors: readonly FieldError[] | undefined) {
  if (!errors) return {};

  return errors.reduce<Record<string, string>>((map, error) => {
    if (!map[error.field]) map[error.field] = error.message;
    return map;
  }, {});
}

export function SeoEditor({ propertyId, seo, derived, images }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [metaTitle, setMetaTitle] = useState(seo.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(
    seo.metaDescription ?? "",
  );
  const [ogImageId, setOgImageId] = useState(seo.ogImageId ?? "");
  const [canonicalUrl, setCanonicalUrl] = useState(seo.canonicalUrl ?? "");
  const [noindex, setNoindex] = useState(seo.noindex);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [advisories, setAdvisories] = useState<readonly SeoAdvisory[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /*
    Only published photographs are offered. A draft image would be a broken
    preview everywhere the link is shared, and a floor plan reads as a fault when
    it is the single image representing the home. The action re-checks all of
    this against the database — this list is a courtesy, not the control.
  */
  const shareableImages = useMemo(
    () =>
      images.filter(
        (image) =>
          image.isPublished &&
          image.imageType !== "floor_plan" &&
          image.previewUrl !== null,
      ),
    [images],
  );

  /*
    An override that points at an image no longer eligible — unpublished since,
    or recategorised as a floor plan. It would not appear in the list above, so
    the select would silently show "Hero photograph" while the database still
    holds the override.
  */
  const staleSelection =
    ogImageId !== "" &&
    !shareableImages.some((image) => image.id === ogImageId);

  const effectiveTitle = metaTitle.trim() || derived.title;
  const effectiveDescription = metaDescription.trim() || derived.description;

  function handleSave() {
    setError(null);
    setNotice(null);
    setAdvisories([]);
    setFieldErrors({});

    startTransition(async () => {
      const result: SeoActionResult = await updatePropertySeo(propertyId, {
        metaTitle: metaTitle.trim() || undefined,
        metaDescription: metaDescription.trim() || undefined,
        ogImageId: ogImageId || undefined,
        canonicalUrl: canonicalUrl.trim() || undefined,
        noindex,
      });

      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        setFieldErrors(toFieldMap(result.fieldErrors));
        return;
      }

      setNotice("Search settings saved.");
      setAdvisories(result.advisories ?? []);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && <AdminAlert tone="error" title={error} />}
      {notice && <AdminAlert tone="success" title={notice} />}

      {advisories.length > 0 && (
        <AdminAlert tone="warning" title="Saved, with some things worth knowing">
          <ul className="mt-2 list-inside list-disc space-y-1">
            {advisories.map((advisory) => (
              <li key={`${advisory.field}-${advisory.message}`}>
                {advisory.message}
              </li>
            ))}
          </ul>
        </AdminAlert>
      )}

      <div>
        <h3 className="text-foreground text-sm font-semibold uppercase tracking-wider">
          Search and sharing
        </h3>
        <p className="text-foreground-subtle mt-1 text-xs leading-relaxed">
          Leave a field blank to use the property&rsquo;s own content. Nothing
          here needs filling in for the page to have a sensible title and
          description.
        </p>
      </div>

      {/* Preview first: it shows what the current settings produce, which is
          what the administrator is actually trying to decide. */}
      <div className="border-border bg-background rounded-xl border p-5">
        <p className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
          How this reads in search results
        </p>
        <p className="text-accent mt-3 text-base">
          {clampPreview(effectiveTitle, SEO_LIMITS.metaTitle)}
        </p>
        <p className="text-foreground-subtle mt-1 text-xs break-all">
          {canonicalUrl.trim() || derived.canonicalUrl}
        </p>
        <p className="text-foreground-muted mt-2 text-sm leading-relaxed">
          {clampPreview(effectiveDescription, SEO_LIMITS.metaDescription)}
        </p>
        {noindex && (
          <p className="mt-3 text-xs text-amber-400">
            Excluded from search results while noindex is on.
          </p>
        )}
      </div>

      <Field
        label="Meta title"
        error={fieldErrors.metaTitle}
        hint={`${metaTitle.trim().length}/${SEO_LIMITS.metaTitle}. Blank uses “${derived.title}”.`}
      >
        <input
          type="text"
          value={metaTitle}
          maxLength={SEO_LIMITS.metaTitle * 2}
          onChange={(event) => setMetaTitle(event.target.value)}
          className="admin-input"
          placeholder={derived.title}
        />
      </Field>

      <Field
        label="Meta description"
        error={fieldErrors.metaDescription}
        hint={`${metaDescription.trim().length}/${SEO_LIMITS.metaDescription}. Blank uses the summary with the status and suburb appended.`}
      >
        <textarea
          value={metaDescription}
          rows={3}
          maxLength={SEO_LIMITS.metaDescription * 2}
          onChange={(event) => setMetaDescription(event.target.value)}
          className="admin-input resize-none"
          placeholder={derived.description}
        />
      </Field>

      <Field
        label="Social preview image"
        error={fieldErrors.ogImageId}
        hint="Used when the page is shared. Blank uses the hero photograph."
      >
        <select
          value={staleSelection ? "" : ogImageId}
          onChange={(event) => setOgImageId(event.target.value)}
          className="admin-input"
        >
          <option value="">Hero photograph</option>
          {shareableImages.map((image) => (
            <option key={image.id} value={image.id}>
              {image.altText ?? image.originalFilename ?? image.imageType}
            </option>
          ))}
        </select>
      </Field>

      {staleSelection && (
        <AdminAlert tone="warning" title="The chosen social image is no longer usable">
          <p className="mt-1">
            It has been unpublished, deleted or recategorised since it was
            chosen. Pick another image or leave it on the hero photograph, then
            save — the stored choice stays until you do.
          </p>
        </AdminAlert>
      )}

      {shareableImages.length === 0 && (
        <AdminAlert tone="info" title="No shareable photographs yet">
          <p className="mt-1">
            Only published photographs can be used, and floor plans are excluded.
            Publish an image on the Media tab to choose one here.
          </p>
        </AdminAlert>
      )}

      <Field
        label="Canonical URL override"
        error={fieldErrors.canonicalUrl}
        hint="Almost always blank. Only set this if this page genuinely duplicates another."
      >
        <input
          type="url"
          value={canonicalUrl}
          onChange={(event) => setCanonicalUrl(event.target.value)}
          className="admin-input"
          placeholder={derived.canonicalUrl}
        />
      </Field>

      <div className="border-border border-t pt-6">
        <Toggle
          label="Hide from search engines (noindex)"
          checked={noindex}
          onChange={setNoindex}
          hint="The page stays public and reachable. It just asks not to be listed."
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save search settings"}
      </button>
    </div>
  );
}

/** Preview-only truncation, mirroring how a result list clips. */
function clampPreview(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  const clipped = value.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");

  return `${lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped}…`;
}
