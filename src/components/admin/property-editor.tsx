"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createPropertyAction,
  updatePropertyAction,
  deletePropertyAction,
  publishPropertyAction,
  unpublishPropertyAction,
  duplicatePropertyAction,
  type PropertyActionResult,
  type PropertyFormData,
} from "@/lib/admin/actions/property-actions";
import { slugify } from "@/lib/admin/validation/property";
import type { FieldError } from "@/lib/admin/validation/result";
import type {
  PropertiesRow,
  PropertyLocationSettingsRow,
  PropertyPrivateLocationsRow,
} from "@/types/database";
import { LocationEditor } from "@/components/admin/location-editor";
import { AdminAlert } from "@/components/admin/admin-alert";
import { Field, Toggle } from "@/components/admin/form-controls";
import { MediaManager } from "@/components/admin/media/media-manager";
import { ConstructionManager } from "@/components/admin/content/construction-manager";
import { SeoEditor } from "@/components/admin/seo/seo-editor";
import { FeatureManager } from "@/components/admin/content/feature-manager";
import type { AdminPropertyMedia } from "@/lib/admin/media-repository";
import type { AdminPropertyContent } from "@/lib/admin/content-repository";
import { derivePropertyMetadata } from "@/lib/seo/metadata";
import type { Property } from "@/types";

interface Props {
  mode: "create" | "edit";
  propertyId?: string;
  initialData?: PropertiesRow;
  privateLocation?: PropertyPrivateLocationsRow | null;
  locationSettings?: PropertyLocationSettingsRow | null;
  /** When the published projection stopped matching the property, if it has. */
  projectionStaleSince?: string | null;
  /** Reasons this property cannot be published, from the database. */
  publishBlockers?: readonly string[];
  /** Every image and resource on this property, drafts included. */
  media?: AdminPropertyMedia;
  /** Construction updates and features, drafts included. */
  content?: AdminPropertyContent;
}

type TabId =
  | "details"
  | "location"
  | "media"
  | "construction"
  | "features"
  | "seo";

/** Maps field errors to a lookup the inputs can read. */
function toFieldMap(errors: readonly FieldError[] | undefined) {
  if (!errors) return {};

  return errors.reduce<Record<string, string>>((map, error) => {
    // First message per field wins — showing two under one input is noise.
    if (!map[error.field]) {
      map[error.field] = error.message;
    }
    return map;
  }, {});
}

export function PropertyEditor({
  mode,
  propertyId,
  initialData,
  privateLocation,
  locationSettings,
  projectionStaleSince = null,
  publishBlockers = [],
  media,
  content,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabId>("details");

  // Feedback state
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<readonly string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form state
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [slugLocked, setSlugLocked] = useState(mode === "edit");
  const [summary, setSummary] = useState(initialData?.summary ?? "");
  const [status, setStatus] = useState<string>(
    initialData?.status ?? "under-construction",
  );
  const [suburb, setSuburb] = useState(initialData?.suburb ?? "");
  const [state, setState] = useState(initialData?.state ?? "VIC");
  const [bedrooms, setBedrooms] = useState(initialData?.bedrooms ?? 3);
  const [bathrooms, setBathrooms] = useState(initialData?.bathrooms ?? 2);
  const [carSpaces, setCarSpaces] = useState(initialData?.car_spaces ?? 2);
  const [landSize, setLandSize] = useState(initialData?.land_size_sqm ?? 0);
  const [houseSize, setHouseSize] = useState<number | undefined>(
    initialData?.house_size_sqm ?? undefined,
  );
  const [priceDisplay, setPriceDisplay] = useState(
    initialData?.price_display ?? "",
  );
  const [completionLabel, setCompletionLabel] = useState(
    initialData?.completion_label ?? "",
  );
  const [isFeatured, setIsFeatured] = useState(initialData?.is_featured ?? false);
  const [isPublished, setIsPublished] = useState(
    initialData?.is_published ?? false,
  );
  const [displayPriority, setDisplayPriority] = useState(
    initialData?.display_priority ?? 0,
  );
  const [displayIsHome, setDisplayIsHome] = useState(
    initialData?.display_is_home ?? false,
  );
  const [displayOpeningNote, setDisplayOpeningNote] = useState(
    initialData?.display_opening_note ?? "",
  );
  const [currentStageId, setCurrentStageId] = useState(
    initialData?.current_stage_id ?? "",
  );

  /** Location is configured once settings exist for this property. */
  const hasLocation = locationSettings !== null && locationSettings !== undefined;

  // Blockers reported on load, until an action supersedes them.
  const activeBlockers = useMemo(
    () => (blockers.length > 0 ? blockers : publishBlockers),
    [blockers, publishBlockers],
  );

  function clearFeedback() {
    setError(null);
    setNotice(null);
    setBlockers([]);
    setFieldErrors({});
  }

  function applyResult(result: PropertyActionResult): boolean {
    if (result.success) {
      return true;
    }

    setError(result.error ?? "Something went wrong.");
    setFieldErrors(toFieldMap(result.fieldErrors));
    setBlockers(result.blockers ?? []);

    // Field errors always live on the Details tab, so send the
    // administrator to where the problem actually is.
    if (result.fieldErrors && result.fieldErrors.length > 0) {
      setActiveTab("details");
    }

    return false;
  }

  function collectFormData(): PropertyFormData {
    return {
      name,
      slug,
      summary,
      status,
      suburb,
      state,
      bedrooms,
      bathrooms,
      carSpaces,
      landSizeSqm: landSize,
      houseSizeSqm: houseSize,
      priceDisplay: priceDisplay || undefined,
      completionLabel: completionLabel || undefined,
      isFeatured,
      displayPriority,
      displayIsHome,
      displayOpeningNote: displayOpeningNote || undefined,
      currentStageId: currentStageId || undefined,
    };
  }

  function handleSave() {
    clearFeedback();

    startTransition(async () => {
      const payload = collectFormData();
      const result =
        mode === "create"
          ? await createPropertyAction(payload)
          : await updatePropertyAction(propertyId as string, payload);

      if (!applyResult(result)) {
        return;
      }

      if (mode === "create" && result.id) {
        router.push(`/admin/properties/${result.id}`);
      } else {
        setNotice("Changes saved.");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!propertyId) return;

    const confirmed = window.confirm(
      `Delete "${name}"? This also removes its location, images and documents. This cannot be undone.`,
    );

    if (!confirmed) return;

    clearFeedback();

    startTransition(async () => {
      const result = await deletePropertyAction(propertyId);

      if (applyResult(result)) {
        router.push("/admin/properties");
      }
    });
  }

  function handlePublishToggle() {
    if (!propertyId) return;
    clearFeedback();

    startTransition(async () => {
      const result = isPublished
        ? await unpublishPropertyAction(propertyId)
        : await publishPropertyAction(propertyId);

      if (!applyResult(result)) {
        return;
      }

      const nowPublished = !isPublished;
      setIsPublished(nowPublished);
      setNotice(
        nowPublished
          ? "Published. It is now visible on the public site."
          : "Unpublished. It is no longer visible to visitors.",
      );
      router.refresh();
    });
  }

  function handleDuplicate() {
    if (!propertyId) return;
    clearFeedback();

    startTransition(async () => {
      const result = await duplicatePropertyAction(propertyId);

      if (applyResult(result) && result.id) {
        router.push(`/admin/properties/${result.id}`);
      }
    });
  }

  const tabs: ReadonlyArray<{ id: TabId; label: string; badge?: string }> = [
    { id: "details", label: "Details" },
    {
      id: "location",
      label: "Location & privacy",
      badge: hasLocation ? undefined : "Not set",
    },
    { id: "media", label: "Media" },
    { id: "construction", label: "Build timeline" },
    { id: "features", label: "Features" },
    { id: "seo", label: "Search" },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <AdminAlert tone="error" title={error}>
          {activeBlockers.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1">
              {activeBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
        </AdminAlert>
      )}

      {notice && <AdminAlert tone="success" title={notice} />}

      {/* Readiness shown before the administrator tries to publish, so the
          Publish button is never a surprise. */}
      {!error && !isPublished && activeBlockers.length > 0 && (
        <AdminAlert tone="info" title="Not ready to publish yet">
          <ul className="mt-2 list-inside list-disc space-y-1">
            {activeBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </AdminAlert>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {isPending
            ? "Working…"
            : mode === "create"
              ? "Create property"
              : "Save changes"}
        </button>

        {mode === "edit" && (
          <>
            <button
              type="button"
              onClick={handlePublishToggle}
              disabled={isPending || (!isPublished && activeBlockers.length > 0)}
              title={
                !isPublished && activeBlockers.length > 0
                  ? "Complete the outstanding items before publishing."
                  : undefined
              }
              className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                isPublished
                  ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              }`}
            >
              {isPublished ? "Unpublish" : "Publish"}
            </button>

            <button
              type="button"
              onClick={handleDuplicate}
              disabled={isPending}
              title="Copies the details only. Location, images and documents are not copied."
              className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              Duplicate
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="ml-auto rounded-lg border border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-60"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="border-border flex gap-1 border-b" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-accent text-accent"
                : "text-foreground-muted hover:text-foreground border-transparent"
            }`}
          >
            {tab.label}
            {tab.badge && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-400">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Details */}
      {activeTab === "details" && (
        <div className="bg-surface border-border space-y-6 rounded-xl border p-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Name" required error={fieldErrors.name}>
              <input
                type="text"
                value={name}
                onChange={(event) => {
                  const next = event.target.value;
                  setName(next);
                  // Only auto-fill the slug while the administrator has not
                  // taken control of it. Silently rewriting a chosen slug
                  // would change a live URL.
                  if (!slugLocked) {
                    setSlug(slugify(next));
                  }
                }}
                className="admin-input"
                placeholder="Single storey concept"
              />
            </Field>

            <Field
              label="Slug"
              required
              error={fieldErrors.slug}
              hint={
                mode === "edit"
                  ? "Changing this changes the public URL."
                  : "Fills in from the name until you edit it."
              }
            >
              <input
                type="text"
                value={slug}
                onChange={(event) => {
                  setSlugLocked(true);
                  setSlug(slugify(event.target.value));
                }}
                className="admin-input"
                placeholder="single-storey-concept"
              />
            </Field>
          </div>

          <Field
            label="Summary"
            required
            error={fieldErrors.summary}
            hint="One sentence, shown on cards and listings."
          >
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
              className="admin-input resize-none"
              placeholder="Single level, north-facing living, courtyard to the rear boundary."
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="Status" required error={fieldErrors.status}>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="admin-input"
              >
                <option value="move-in-ready">Move-in ready</option>
                <option value="under-construction">Under construction</option>
                <option value="completed">Completed</option>
                <option value="sold">Sold</option>
              </select>
            </Field>

            <Field label="Suburb" required error={fieldErrors.suburb}>
              <input
                type="text"
                value={suburb}
                onChange={(event) => setSuburb(event.target.value)}
                className="admin-input"
                placeholder="Mickleham"
              />
            </Field>

            <Field label="State" required error={fieldErrors.state}>
              <input
                type="text"
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="admin-input"
                placeholder="VIC"
              />
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-5">
            <Field label="Bedrooms" error={fieldErrors.bedrooms}>
              <input
                type="number"
                min={0}
                max={20}
                value={bedrooms}
                onChange={(event) => setBedrooms(Number(event.target.value))}
                className="admin-input"
              />
            </Field>
            <Field label="Bathrooms" error={fieldErrors.bathrooms}>
              <input
                type="number"
                min={0}
                max={20}
                value={bathrooms}
                onChange={(event) => setBathrooms(Number(event.target.value))}
                className="admin-input"
              />
            </Field>
            <Field label="Car spaces" error={fieldErrors.carSpaces}>
              <input
                type="number"
                min={0}
                max={10}
                value={carSpaces}
                onChange={(event) => setCarSpaces(Number(event.target.value))}
                className="admin-input"
              />
            </Field>
            <Field label="Land m²" error={fieldErrors.landSizeSqm}>
              <input
                type="number"
                min={0}
                value={landSize}
                onChange={(event) => setLandSize(Number(event.target.value))}
                className="admin-input"
              />
            </Field>
            <Field label="House m²" error={fieldErrors.houseSizeSqm}>
              <input
                type="number"
                min={0}
                value={houseSize ?? ""}
                onChange={(event) =>
                  setHouseSize(
                    event.target.value === ""
                      ? undefined
                      : Number(event.target.value),
                  )
                }
                className="admin-input"
              />
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Price display"
              error={fieldErrors.priceDisplay}
              hint="Only what the business has confirmed. Leave blank to show nothing."
            >
              <input
                type="text"
                value={priceDisplay}
                onChange={(event) => setPriceDisplay(event.target.value)}
                className="admin-input"
                placeholder="Price on application"
              />
            </Field>
            <Field
              label="Completion label"
              error={fieldErrors.completionLabel}
              hint="Plain language, e.g. “Completion window to be confirmed”."
            >
              <input
                type="text"
                value={completionLabel}
                onChange={(event) => setCompletionLabel(event.target.value)}
                className="admin-input"
              />
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <Field
              label="Display priority"
              error={fieldErrors.displayPriority}
              hint="Lower numbers appear first."
            >
              <input
                type="number"
                min={0}
                value={displayPriority}
                onChange={(event) =>
                  setDisplayPriority(Number(event.target.value))
                }
                className="admin-input"
              />
            </Field>

            <Field label="Build stage" hint="Only meaningful while under construction.">
              <select
                value={currentStageId}
                onChange={(event) => setCurrentStageId(event.target.value)}
                className="admin-input"
              >
                <option value="">None</option>
                <option value="site-design">Site &amp; design</option>
                <option value="documentation">Documentation</option>
                <option value="construction">Construction</option>
                <option value="handover">Handover</option>
              </select>
            </Field>

            <Field
              label="Opening note"
              error={fieldErrors.displayOpeningNote}
              hint="Shown only when this is a display home."
            >
              <input
                type="text"
                value={displayOpeningNote}
                onChange={(event) => setDisplayOpeningNote(event.target.value)}
                className="admin-input"
                placeholder="Open Saturdays 11–2"
              />
            </Field>
          </div>

          <div className="border-border flex flex-wrap gap-6 border-t pt-6">
            <Toggle
              label="Featured on homepage"
              checked={isFeatured}
              onChange={setIsFeatured}
            />
            <Toggle
              label="Display home"
              checked={displayIsHome}
              onChange={setDisplayIsHome}
            />
          </div>

          <p className="text-foreground-subtle text-xs">
            Publishing is handled by the Publish button above, so a record is
            never made public by a checkbox on a form.
          </p>
        </div>
      )}

      {/* Location */}
      {activeTab === "location" && (
        <LocationEditor
          propertyId={propertyId}
          privateLocation={privateLocation ?? undefined}
          locationSettings={locationSettings ?? undefined}
          projectionStaleSince={projectionStaleSince}
          onSaved={() => {
            // Saving a location can clear a publish blocker, so refresh the
            // server data that produced the warning above.
            setBlockers([]);
            router.refresh();
          }}
        />
      )}

      {/* Media */}
      {activeTab === "media" &&
        (mode === "create" || !propertyId || !media ? (
          <SaveFirstNotice>
            Media is stored against a saved property. Create it on the Details
            tab, then add photography here.
          </SaveFirstNotice>
        ) : (
          <MediaManager
            propertyId={propertyId}
            images={media.images}
            resources={media.resources}
            failed={media.failed}
          />
        ))}

      {/* Build timeline */}
      {activeTab === "construction" &&
        (mode === "create" || !propertyId || !content ? (
          <SaveFirstNotice>
            Build updates belong to a saved property. Create it on the Details
            tab, then record the timeline here.
          </SaveFirstNotice>
        ) : (
          <div className="bg-surface border-border rounded-xl border p-6">
            <ConstructionManager
              propertyId={propertyId}
              updates={content.constructionUpdates}
              failed={content.failed}
            />
          </div>
        ))}

      {/* Search */}
      {activeTab === "seo" &&
        (mode === "create" || !propertyId || !initialData ? (
          <SaveFirstNotice>
            Search settings are stored on the property record. Create it on the
            Details tab first.
          </SaveFirstNotice>
        ) : (
          <div className="bg-surface border-border rounded-xl border p-6">
            <SeoEditor
              propertyId={propertyId}
              seo={{
                metaTitle: initialData.seo_meta_title,
                metaDescription: initialData.seo_meta_description,
                ogImageId: initialData.seo_og_image_id,
                canonicalUrl: initialData.seo_canonical_url,
                noindex: initialData.seo_noindex,
              }}
              derived={derivePropertyMetadata({
                name: initialData.name,
                slug: initialData.slug,
                suburb: initialData.suburb,
                state: initialData.state,
                summary: initialData.summary,
                status: initialData.status as Property["status"],
              })}
              images={media?.images ?? []}
            />
          </div>
        ))}

      {/* Features */}
      {activeTab === "features" &&
        (mode === "create" || !propertyId || !content ? (
          <SaveFirstNotice>
            Features belong to a saved property. Create it on the Details tab,
            then add the specification here.
          </SaveFirstNotice>
        ) : (
          <div className="bg-surface border-border rounded-xl border p-6">
            <FeatureManager
              propertyId={propertyId}
              features={content.features}
              failed={content.failed}
            />
          </div>
        ))}
    </div>
  );
}

/**
 * Shown on the tabs that write to child tables.
 *
 * Media, construction updates and features are all keyed by property id, so
 * none of them can be edited before the property row exists. Saying so is
 * better than rendering an editor whose every action would fail.
 */
function SaveFirstNotice({ children }: { children: React.ReactNode }) {
  return (
    <AdminAlert tone="info" title="Save the property first">
      <p className="mt-1">{children}</p>
    </AdminAlert>
  );
}
