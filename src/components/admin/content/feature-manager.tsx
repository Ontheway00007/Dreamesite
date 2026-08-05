"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createFeature,
  deleteFeature,
  reorderFeatures,
  setFeaturePublished,
  updateFeature,
  type FeatureActionResult,
} from "@/lib/admin/actions/feature-actions";
import type { AdminFeature } from "@/lib/admin/content-repository";
import {
  FEATURE_CATEGORIES,
  FEATURE_CATEGORY_META,
  FEATURE_LIMITS,
  duplicatesCoreSpecification,
  type FeatureCategory,
} from "@/lib/admin/validation/features";
import type { FieldError } from "@/lib/admin/validation/result";
import { AdminAlert } from "@/components/admin/admin-alert";
import { Field, Toggle } from "@/components/admin/form-controls";

/**
 * Feature editor.
 *
 * Features are grouped, and each group becomes a heading on the property page.
 * The editor therefore shows the groups themselves — all six, including the
 * empty ones — rather than a flat list with a category column. That makes the
 * vocabulary discoverable, shows where a new feature will land before it is
 * added, and keeps the admin view shaped like the page it produces.
 *
 * Reordering is scoped to a group, matching the RPC: an item cannot be moved
 * out of its category by dragging it past the last one.
 */

interface Props {
  readonly propertyId: string;
  readonly features: readonly AdminFeature[];
  readonly failed: boolean;
}

/** Which form is open, if any. `category` distinguishes the six add forms. */
type OpenForm =
  | { readonly kind: "add"; readonly category: FeatureCategory }
  | { readonly kind: "edit"; readonly id: string }
  | null;

function toFieldMap(errors: readonly FieldError[] | undefined) {
  if (!errors) return {};

  return errors.reduce<Record<string, string>>((map, error) => {
    if (!map[error.field]) map[error.field] = error.message;
    return map;
  }, {});
}

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

export function FeatureManager({ propertyId, features, failed }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Grouped once per render. The repository already sorted by category then
  // sort_order then id, so insertion order here is display order.
  const grouped = useMemo(() => {
    const map = new Map<FeatureCategory, AdminFeature[]>(
      FEATURE_CATEGORIES.map((category) => [category, []]),
    );

    for (const feature of features) {
      map.get(feature.category)?.push(feature);
    }

    return map;
  }, [features]);

  const publishedCount = useMemo(
    () => features.filter((feature) => feature.isPublished).length,
    [features],
  );

  function run(action: () => Promise<FeatureActionResult>, onDone?: () => void) {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await action();

      if (result.success) {
        setError(null);
        setFieldErrors({});
        router.refresh();
        onDone?.();
        return;
      }

      setError(result.error ?? "Something went wrong.");
      setFieldErrors(toFieldMap(result.fieldErrors));
    });
  }

  function handleMove(
    category: FeatureCategory,
    id: string,
    direction: -1 | 1,
  ) {
    const ids = (grouped.get(category) ?? []).map((feature) => feature.id);
    const nextOrder = moved(ids, id, direction);

    if (!nextOrder) return;

    run(() => reorderFeatures(propertyId, category, nextOrder));
  }

  function handleDelete(feature: AdminFeature) {
    if (
      !window.confirm(
        `Delete “${feature.label}”? This removes it from the property page permanently.`,
      )
    ) {
      return;
    }

    run(() => deleteFeature(propertyId, feature.id));
  }

  function closeForm() {
    setOpenForm(null);
    setFieldErrors({});
  }

  if (failed) {
    return (
      <AdminAlert tone="error" title="Could not load the features">
        <p className="mt-1">
          The database did not respond. Reload the page to try again — the
          details are in the server logs.
        </p>
      </AdminAlert>
    );
  }

  return (
    <div className="space-y-8">
      {error && <AdminAlert tone="error" title={error} />}
      {notice && <AdminAlert tone="success" title={notice} />}

      <div>
        <h3 className="text-foreground text-sm font-semibold uppercase tracking-wider">
          Features and specifications
        </h3>
        <p className="text-foreground-subtle mt-1 text-xs">
          {features.length === 0
            ? "Nothing added yet. The property page shows only the headline specifications until a feature is published here."
            : `${features.length} ${
                features.length === 1 ? "feature" : "features"
              }, ${publishedCount} published. Each group below is a heading on the property page; groups with no published features are hidden there.`}
        </p>
      </div>

      {FEATURE_CATEGORY_META.map((meta) => {
        const items = grouped.get(meta.category) ?? [];
        const isAddingHere =
          openForm?.kind === "add" && openForm.category === meta.category;

        return (
          <section key={meta.category} className="space-y-3">
            <div>
              <h4 className="text-foreground text-sm font-medium">
                {meta.heading}
              </h4>
              <p className="text-foreground-subtle mt-0.5 text-xs">
                {meta.description}
              </p>
            </div>

            {items.length === 0 ? (
              <p className="text-foreground-subtle border-border rounded-lg border border-dashed px-3 py-2.5 text-xs">
                Empty. This heading will not appear on the property page.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((feature, index) => (
                  <li
                    key={feature.id}
                    className="border-border bg-surface rounded-xl border p-3"
                  >
                    {openForm?.kind === "edit" && openForm.id === feature.id ? (
                      <FeatureForm
                        feature={feature}
                        fieldErrors={fieldErrors}
                        disabled={isPending}
                        onSubmit={(input) =>
                          run(
                            () => updateFeature(propertyId, feature.id, input),
                            () => {
                              setOpenForm(null);
                              setNotice("Feature saved.");
                            },
                          )
                        }
                        onCancel={closeForm}
                      />
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-foreground text-sm font-medium">
                              {feature.label}
                            </span>
                            {feature.value && (
                              <span className="text-foreground-muted text-sm">
                                — {feature.value}
                              </span>
                            )}
                            <PublishChip isPublished={feature.isPublished} />
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <SmallButton
                              onClick={() =>
                                run(() =>
                                  setFeaturePublished(
                                    propertyId,
                                    feature.id,
                                    !feature.isPublished,
                                  ),
                                )
                              }
                              disabled={isPending}
                            >
                              {feature.isPublished ? "Unpublish" : "Publish"}
                            </SmallButton>
                            <SmallButton
                              onClick={() => {
                                setFieldErrors({});
                                setOpenForm({ kind: "edit", id: feature.id });
                              }}
                              disabled={isPending}
                            >
                              Edit
                            </SmallButton>
                            <SmallButton
                              onClick={() => handleDelete(feature)}
                              disabled={isPending}
                              tone="danger"
                            >
                              Delete
                            </SmallButton>
                          </div>
                        </div>

                        <span className="flex shrink-0 items-center gap-1">
                          <IconButton
                            label={`Move “${feature.label}” up within ${meta.heading} (currently ${
                              index + 1
                            } of ${items.length})`}
                            onClick={() =>
                              handleMove(meta.category, feature.id, -1)
                            }
                            disabled={isPending || index === 0}
                          >
                            ↑
                          </IconButton>
                          <IconButton
                            label={`Move “${feature.label}” down within ${meta.heading} (currently ${
                              index + 1
                            } of ${items.length})`}
                            onClick={() =>
                              handleMove(meta.category, feature.id, 1)
                            }
                            disabled={isPending || index === items.length - 1}
                          >
                            ↓
                          </IconButton>
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {isAddingHere ? (
              <div className="border-border rounded-xl border border-dashed p-4">
                <FeatureForm
                  defaultCategory={meta.category}
                  fieldErrors={fieldErrors}
                  disabled={isPending}
                  onSubmit={(input) =>
                    run(
                      () => createFeature(propertyId, input),
                      () => {
                        setOpenForm(null);
                        setNotice("Feature added.");
                      },
                    )
                  }
                  onCancel={closeForm}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFieldErrors({});
                  setOpenForm({ kind: "add", category: meta.category });
                }}
                disabled={isPending}
                className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
              >
                Add to {meta.heading.toLowerCase()}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* --- Form -------------------------------------------------------------- */

interface FormInput {
  category: string;
  label: string;
  value?: string;
  isPublished: boolean;
}

function FeatureForm({
  feature,
  defaultCategory,
  fieldErrors,
  disabled,
  onSubmit,
  onCancel,
}: {
  feature?: AdminFeature;
  defaultCategory?: FeatureCategory;
  fieldErrors: Record<string, string>;
  disabled: boolean;
  onSubmit: (input: FormInput) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<string>(
    feature?.category ?? defaultCategory ?? "highlight",
  );
  const [label, setLabel] = useState(feature?.label ?? "");
  const [value, setValue] = useState(feature?.value ?? "");
  const [isPublished, setIsPublished] = useState(feature?.isPublished ?? false);

  // Advisory, not blocking: "Bedrooms — 4, all with built-in robes" says more
  // than the figure the specifications table already shows, so the decision
  // belongs to the administrator.
  const duplicates = duplicatesCoreSpecification(label);

  return (
    <div className="space-y-4">
      <Field
        label="Group"
        required
        error={fieldErrors.category}
        hint="Which heading this appears under on the property page."
      >
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="admin-input"
        >
          {FEATURE_CATEGORY_META.map((meta) => (
            <option key={meta.category} value={meta.category}>
              {meta.heading}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Label"
          required
          error={fieldErrors.label}
          hint={`Up to ${FEATURE_LIMITS.label} characters.`}
        >
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="admin-input"
            placeholder="Energy rating"
          />
        </Field>

        <Field
          label="Value"
          error={fieldErrors.value}
          hint="Optional — leave blank for a statement that needs no second half."
        >
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="admin-input"
            placeholder="7 stars"
          />
        </Field>
      </div>

      {duplicates && (
        <AdminAlert tone="warning" title="This repeats a headline specification">
          <p className="mt-1">
            The property page already shows{" "}
            <span className="lowercase">{label.trim()}</span> in the
            specifications table. Keep this only if it adds detail the figure
            alone does not.
          </p>
        </AdminAlert>
      )}

      <Toggle
        label="Published"
        checked={isPublished}
        onChange={setIsPublished}
        hint="Drafts stay in the admin only."
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onSubmit({
              category,
              label,
              value: value || undefined,
              isPublished,
            })
          }
          className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {feature ? "Save feature" : "Add feature"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* --- Chips and buttons ------------------------------------------------- */

function PublishChip({ isPublished }: { isPublished: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        isPublished
          ? "bg-emerald-500/20 text-emerald-400"
          : "bg-zinc-500/20 text-zinc-400"
      }`}
    >
      {isPublished ? "Published" : "Draft"}
    </span>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
      aria-label={label}
      className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-30"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
