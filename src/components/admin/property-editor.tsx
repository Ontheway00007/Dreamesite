"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createPropertyAction,
  updatePropertyAction,
  deletePropertyAction,
  publishPropertyAction,
  unpublishPropertyAction,
  duplicatePropertyAction,
  type PropertyFormData,
} from "@/lib/admin/actions/property-actions";
import type { PropertiesRow, PropertyLocationSettingsRow, PropertyPrivateLocationsRow } from "@/types/database";
import { LocationEditor } from "@/components/admin/location-editor";

interface Props {
  mode: "create" | "edit";
  propertyId?: string;
  initialData?: PropertiesRow;
  privateLocation?: PropertyPrivateLocationsRow | null;
  locationSettings?: PropertyLocationSettingsRow | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100);
}

export function PropertyEditor({
  mode,
  propertyId,
  initialData,
  privateLocation,
  locationSettings,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "location" | "media">("details");

  // Form state
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [summary, setSummary] = useState(initialData?.summary ?? "");
  const [status, setStatus] = useState<string>(initialData?.status ?? "under-construction");
  const [suburb, setSuburb] = useState(initialData?.suburb ?? "");
  const [state, setState] = useState(initialData?.state ?? "VIC");
  const [bedrooms, setBedrooms] = useState(initialData?.bedrooms ?? 3);
  const [bathrooms, setBathrooms] = useState(initialData?.bathrooms ?? 2);
  const [carSpaces, setCarSpaces] = useState(initialData?.car_spaces ?? 2);
  const [landSize, setLandSize] = useState(initialData?.land_size_sqm ?? 0);
  const [houseSize, setHouseSize] = useState(initialData?.house_size_sqm ?? undefined);
  const [priceDisplay, setPriceDisplay] = useState(initialData?.price_display ?? "");
  const [completionLabel, setCompletionLabel] = useState(initialData?.completion_label ?? "");
  const [isFeatured, setIsFeatured] = useState(initialData?.is_featured ?? false);
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);
  const [displayPriority, setDisplayPriority] = useState(initialData?.display_priority ?? 0);
  const [displayIsHome, setDisplayIsHome] = useState(initialData?.display_is_home ?? false);
  const [displayOpeningNote, setDisplayOpeningNote] = useState(initialData?.display_opening_note ?? "");
  const [currentStageId, setCurrentStageId] = useState(initialData?.current_stage_id ?? "");

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
      houseSizeSqm: houseSize ?? undefined,
      priceDisplay: priceDisplay || undefined,
      completionLabel: completionLabel || undefined,
      isFeatured,
      isPublished,
      displayPriority,
      displayIsHome,
      displayOpeningNote: displayOpeningNote || undefined,
      currentStageId: currentStageId || undefined,
    };
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const formData = collectFormData();
      const result =
        mode === "create"
          ? await createPropertyAction(formData)
          : await updatePropertyAction(propertyId!, formData);

      if (!result.success) {
        setError(result.error ?? "An error occurred.");
      } else if (mode === "create" && result.id) {
        router.push(`/admin/properties/${result.id}`);
      }
    });
  }

  function handleDelete() {
    if (!propertyId) return;
    if (!confirm("Are you sure you want to delete this property? This cannot be undone.")) return;

    startTransition(async () => {
      const result = await deletePropertyAction(propertyId);
      if (result.success) {
        router.push("/admin/properties");
      } else {
        setError(result.error ?? "Failed to delete.");
      }
    });
  }

  function handlePublishToggle() {
    if (!propertyId) return;
    startTransition(async () => {
      const result = isPublished
        ? await unpublishPropertyAction(propertyId)
        : await publishPropertyAction(propertyId);
      if (result.success) {
        setIsPublished(!isPublished);
      } else {
        setError(result.error ?? "Failed to update publish status.");
      }
    });
  }

  function handleDuplicate() {
    if (!propertyId) return;
    startTransition(async () => {
      const result = await duplicatePropertyAction(propertyId);
      if (result.success && result.id) {
        router.push(`/admin/properties/${result.id}`);
      } else {
        setError(result.error ?? "Failed to duplicate.");
      }
    });
  }

  const tabs = [
    { id: "details" as const, label: "Details" },
    { id: "location" as const, label: "Location & Privacy" },
    { id: "media" as const, label: "Media" },
  ];

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border-red-500/20 rounded-lg border px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {isPending ? "Saving..." : mode === "create" ? "Create property" : "Save changes"}
        </button>

        {mode === "edit" && (
          <>
            <button
              onClick={handlePublishToggle}
              disabled={isPending}
              className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                isPublished
                  ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              }`}
            >
              {isPublished ? "Unpublish" : "Publish"}
            </button>

            <button
              onClick={handleDuplicate}
              disabled={isPending}
              className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              Duplicate
            </button>

            <button
              onClick={handleDelete}
              disabled={isPending}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 ml-auto rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="border-border flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "details" && (
        <div className="bg-surface border-border space-y-6 rounded-xl border p-6">
          {/* Name + Slug */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (mode === "create" && !slug) {
                    setSlug(slugify(e.target.value));
                  }
                }}
                className="admin-input"
                placeholder="Single storey concept"
              />
            </Field>
            <Field label="Slug" required hint="URL-safe identifier">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                className="admin-input"
                placeholder="single-storey-concept"
              />
            </Field>
          </div>

          {/* Summary */}
          <Field label="Summary" required hint="One sentence for cards and listings">
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className="admin-input resize-none"
              placeholder="Single level, north-facing living, courtyard to the rear boundary."
            />
          </Field>

          {/* Status + Suburb + State */}
          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="Status" required>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="admin-input"
              >
                <option value="move-in-ready">Move-in ready</option>
                <option value="under-construction">Under construction</option>
                <option value="completed">Completed</option>
                <option value="sold">Sold</option>
              </select>
            </Field>
            <Field label="Suburb" required>
              <input
                type="text"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                className="admin-input"
                placeholder="Mickleham"
              />
            </Field>
            <Field label="State">
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="admin-input"
                placeholder="VIC"
              />
            </Field>
          </div>

          {/* Measurements */}
          <div className="grid gap-6 sm:grid-cols-5">
            <Field label="Bedrooms">
              <input type="number" min={0} max={20} value={bedrooms} onChange={(e) => setBedrooms(Number(e.target.value))} className="admin-input" />
            </Field>
            <Field label="Bathrooms">
              <input type="number" min={0} max={20} value={bathrooms} onChange={(e) => setBathrooms(Number(e.target.value))} className="admin-input" />
            </Field>
            <Field label="Car spaces">
              <input type="number" min={0} max={10} value={carSpaces} onChange={(e) => setCarSpaces(Number(e.target.value))} className="admin-input" />
            </Field>
            <Field label="Land (sqm)">
              <input type="number" min={0} value={landSize} onChange={(e) => setLandSize(Number(e.target.value))} className="admin-input" />
            </Field>
            <Field label="House (sqm)">
              <input type="number" min={0} value={houseSize ?? ""} onChange={(e) => setHouseSize(e.target.value ? Number(e.target.value) : undefined)} className="admin-input" />
            </Field>
          </div>

          {/* Price + Completion */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Price display" hint="Shown to visitors, e.g. 'Price on application'">
              <input type="text" value={priceDisplay} onChange={(e) => setPriceDisplay(e.target.value)} className="admin-input" placeholder="Price on application" />
            </Field>
            <Field label="Completion label" hint="e.g. 'Completion window Q4 2026'">
              <input type="text" value={completionLabel} onChange={(e) => setCompletionLabel(e.target.value)} className="admin-input" />
            </Field>
          </div>

          {/* Display options */}
          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="Display priority" hint="Lower numbers appear first">
              <input type="number" min={0} value={displayPriority} onChange={(e) => setDisplayPriority(Number(e.target.value))} className="admin-input" />
            </Field>
            <Field label="Construction stage" hint="ID from content/process.ts">
              <select value={currentStageId} onChange={(e) => setCurrentStageId(e.target.value)} className="admin-input">
                <option value="">None</option>
                <option value="site-design">Site & Design</option>
                <option value="documentation">Documentation</option>
                <option value="construction">Construction</option>
                <option value="handover">Handover</option>
              </select>
            </Field>
            <Field label="Display home note" hint="Opening hours when property is a display home">
              <input type="text" value={displayOpeningNote} onChange={(e) => setDisplayOpeningNote(e.target.value)} className="admin-input" placeholder="Open Saturdays 11-2" />
            </Field>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-6">
            <Toggle label="Featured on homepage" checked={isFeatured} onChange={setIsFeatured} />
            <Toggle label="Display home" checked={displayIsHome} onChange={setDisplayIsHome} />
            <Toggle label="Published" checked={isPublished} onChange={setIsPublished} />
          </div>
        </div>
      )}

      {activeTab === "location" && (
        <LocationEditor
          propertyId={propertyId}
          privateLocation={privateLocation ?? undefined}
          locationSettings={locationSettings ?? undefined}
        />
      )}

      {activeTab === "media" && (
        <div className="bg-surface border-border rounded-xl border p-6">
          <p className="text-foreground-muted text-sm">
            Media management is available once the property is saved.
            {mode === "create" && " Create the property first, then manage media from the edit page."}
          </p>
        </div>
      )}
    </div>
  );
}

/* --- Shared field components --- */

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-foreground-muted block text-sm font-medium">
        {label}
        {required && <span className="text-accent ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-foreground-subtle text-xs">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <div
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}
        tabIndex={0}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-zinc-700"
        }`}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-foreground-muted text-sm">{label}</span>
    </label>
  );
}
