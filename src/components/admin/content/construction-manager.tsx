"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createConstructionUpdate,
  deleteConstructionUpdate,
  reorderConstructionUpdates,
  setConstructionUpdatePublished,
  updateConstructionUpdate,
  type ContentActionResult,
} from "@/lib/admin/actions/construction-actions";
import type { AdminConstructionUpdate } from "@/lib/admin/content-repository";
import {
  CONSTRUCTION_STAGES,
  CONSTRUCTION_STATUSES,
  STAGE_LABELS,
  STAGE_ORDER,
  STATUS_LABELS,
  defaultProgressForStatus,
  type ConstructionStage,
  type ConstructionStatus,
} from "@/lib/admin/validation/construction";
import type { FieldError } from "@/lib/admin/validation/result";
import { AdminAlert } from "@/components/admin/admin-alert";
import { Field, Toggle } from "@/components/admin/form-controls";

/**
 * Build-diary editor.
 *
 * One update per stage, which is why the stage selector offers only the stages
 * not yet used: being told after submitting that a stage is taken is worse than
 * never being offered it.
 *
 * Ordering uses explicit move buttons. The list is also shown in build order
 * so a missing stage is visible at a glance, while the buttons control the
 * order the public timeline uses.
 */

interface Props {
  readonly propertyId: string;
  readonly updates: readonly AdminConstructionUpdate[];
  readonly failed: boolean;
}

function toFieldMap(errors: readonly FieldError[] | undefined) {
  if (!errors) return {};

  return errors.reduce<Record<string, string>>((map, error) => {
    if (!map[error.field]) map[error.field] = error.message;
    return map;
  }, {});
}

/** Moves an id one place, returning the new order or null at the ends. */
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

function formatDate(iso: string | null): string {
  if (!iso) return "No date";

  try {
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "No date";
  }
}

/** Splits an ISO timestamp into the value a date input expects. */
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";

  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export function ConstructionManager({ propertyId, updates, failed }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const orderedIds = useMemo(() => updates.map((update) => update.id), [updates]);

  const availableStages = useMemo(() => {
    const used = new Set(updates.map((update) => update.stage));
    return CONSTRUCTION_STAGES.filter((stage) => !used.has(stage));
  }, [updates]);

  function apply(result: ContentActionResult): boolean {
    if (result.success) {
      setError(null);
      setFieldErrors({});
      router.refresh();
      return true;
    }

    setError(result.error ?? "Something went wrong.");
    setFieldErrors(toFieldMap(result.fieldErrors));
    return false;
  }

  function run(action: () => Promise<ContentActionResult>, onDone?: () => void) {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      if (apply(await action())) {
        onDone?.();
      }
    });
  }

  function handleMove(id: string, direction: -1 | 1) {
    const nextOrder = moved(orderedIds, id, direction);

    if (!nextOrder) return;

    run(() => reorderConstructionUpdates(propertyId, nextOrder));
  }

  function handleDelete(update: AdminConstructionUpdate) {
    if (
      !window.confirm(
        `Delete the “${update.title}” update? This removes it from the build timeline permanently.`,
      )
    ) {
      return;
    }

    run(() => deleteConstructionUpdate(propertyId, update.id));
  }

  if (failed) {
    return (
      <AdminAlert tone="error" title="Could not load the build timeline">
        <p className="mt-1">
          The database did not respond. Reload the page to try again — the
          details are in the server logs.
        </p>
      </AdminAlert>
    );
  }

  return (
    <div className="space-y-6">
      {error && <AdminAlert tone="error" title={error} />}
      {notice && <AdminAlert tone="success" title={notice} />}

      <div>
        <h3 className="text-foreground text-sm font-semibold uppercase tracking-wider">
          Build timeline
        </h3>
        <p className="text-foreground-subtle mt-1 text-xs">
          Published updates replace the derived timeline on the property page.
          With none, the page falls back to the company&rsquo;s documented
          process — so an empty timeline is a valid state, not a gap.
        </p>
      </div>

      {updates.length === 0 ? (
        <AdminAlert tone="info" title="No updates recorded yet">
          <p className="mt-1">
            The property page shows the standard build process until the first
            update is added here.
          </p>
        </AdminAlert>
      ) : (
        <ul className="space-y-3">
          {updates.map((update, index) => (
            <li
              key={update.id}
              className="border-border bg-surface rounded-xl border p-4"
            >
              {editingId === update.id ? (
                <ConstructionForm
                  propertyId={propertyId}
                  update={update}
                  availableStages={[...availableStages, update.stage].sort(
                    (a, b) => STAGE_ORDER[a] - STAGE_ORDER[b],
                  )}
                  fieldErrors={fieldErrors}
                  disabled={isPending}
                  onSubmit={(input) =>
                    run(
                      () => updateConstructionUpdate(propertyId, update.id, input),
                      () => {
                        setEditingId(null);
                        setNotice("Update saved.");
                      },
                    )
                  }
                  onCancel={() => {
                    setEditingId(null);
                    setFieldErrors({});
                  }}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-accent/15 text-accent rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                          {STAGE_LABELS[update.stage]}
                        </span>
                        <StatusChip status={update.status} />
                        <PublishChip isPublished={update.isPublished} />
                      </div>
                      <p className="text-foreground mt-2 text-sm font-medium">
                        {update.title}
                      </p>
                      {update.description && (
                        <p className="text-foreground-muted mt-1 text-sm">
                          {update.description}
                        </p>
                      )}
                      <p className="text-foreground-subtle mt-1 text-xs">
                        {formatDate(update.occurredAt)}
                        {update.progressValue !== null &&
                          ` · ${update.progressValue}% complete`}
                      </p>
                    </div>

                    <span className="flex shrink-0 items-center gap-1">
                      <IconButton
                        label={`Move earlier (currently ${index + 1} of ${updates.length})`}
                        onClick={() => handleMove(update.id, -1)}
                        disabled={isPending || index === 0}
                      >
                        ↑
                      </IconButton>
                      <IconButton
                        label={`Move later (currently ${index + 1} of ${updates.length})`}
                        onClick={() => handleMove(update.id, 1)}
                        disabled={isPending || index === updates.length - 1}
                      >
                        ↓
                      </IconButton>
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <SmallButton
                      onClick={() =>
                        run(() =>
                          setConstructionUpdatePublished(
                            propertyId,
                            update.id,
                            !update.isPublished,
                          ),
                        )
                      }
                      disabled={isPending}
                    >
                      {update.isPublished ? "Unpublish" : "Publish"}
                    </SmallButton>
                    <SmallButton
                      onClick={() => {
                        setFieldErrors({});
                        setEditingId(update.id);
                      }}
                      disabled={isPending}
                    >
                      Edit
                    </SmallButton>
                    <SmallButton
                      onClick={() => handleDelete(update)}
                      disabled={isPending}
                      tone="danger"
                    >
                      Delete
                    </SmallButton>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdding ? (
        <div className="border-border rounded-xl border border-dashed p-4">
          <ConstructionForm
            propertyId={propertyId}
            availableStages={availableStages}
            fieldErrors={fieldErrors}
            disabled={isPending}
            onSubmit={(input) =>
              run(
                () => createConstructionUpdate(propertyId, input),
                () => {
                  setIsAdding(false);
                  setNotice("Update added.");
                },
              )
            }
            onCancel={() => {
              setIsAdding(false);
              setFieldErrors({});
            }}
          />
        </div>
      ) : availableStages.length === 0 ? (
        <AdminAlert tone="info" title="Every stage has an update">
          <p className="mt-1">
            All eight build stages are recorded. Edit an existing one to make a
            change.
          </p>
        </AdminAlert>
      ) : (
        <button
          type="button"
          onClick={() => {
            setFieldErrors({});
            setIsAdding(true);
          }}
          disabled={isPending}
          className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
        >
          Add an update
        </button>
      )}
    </div>
  );
}

/* --- Form -------------------------------------------------------------- */

interface FormInput {
  stage: string;
  title: string;
  description?: string;
  status: string;
  progressValue?: number;
  occurredAt?: string;
  isPublished: boolean;
}

function ConstructionForm({
  update,
  availableStages,
  fieldErrors,
  disabled,
  onSubmit,
  onCancel,
}: {
  propertyId: string;
  update?: AdminConstructionUpdate;
  availableStages: readonly ConstructionStage[];
  fieldErrors: Record<string, string>;
  disabled: boolean;
  onSubmit: (input: FormInput) => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<string>(
    update?.stage ?? availableStages[0] ?? "planning",
  );
  const [title, setTitle] = useState(update?.title ?? "");
  const [description, setDescription] = useState(update?.description ?? "");
  const [status, setStatus] = useState<string>(update?.status ?? "planned");
  const [progress, setProgress] = useState<string>(
    update?.progressValue !== null && update?.progressValue !== undefined
      ? String(update.progressValue)
      : "",
  );
  const [occurredAt, setOccurredAt] = useState(
    toDateInputValue(update?.occurredAt ?? null),
  );
  const [isPublished, setIsPublished] = useState(update?.isPublished ?? false);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stage" required error={fieldErrors.stage}>
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            className="admin-input"
          >
            {availableStages.map((option) => (
              <option key={option} value={option}>
                {STAGE_LABELS[option]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status" required error={fieldErrors.status}>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              // Clear a manual figure so the status default applies, unless
              // the administrator sets one again.
              setProgress("");
            }}
            className="admin-input"
          >
            {CONSTRUCTION_STATUSES.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Title"
        required
        error={fieldErrors.title}
        hint="What happened at this stage, in a few words."
      >
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="admin-input"
          placeholder="Slab poured and cured"
        />
      </Field>

      <Field label="Description" error={fieldErrors.description} hint="Optional.">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="admin-input resize-none"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Date"
          error={fieldErrors.occurredAt}
          hint="Optional. Leave blank if not recorded."
        >
          <input
            type="date"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            className="admin-input"
          />
        </Field>

        <Field
          label="Progress"
          error={fieldErrors.progressValue}
          hint={`Optional. Defaults to ${defaultProgressForStatus(
            status as ConstructionStatus,
          )}% for “${STATUS_LABELS[status as ConstructionStatus] ?? status}”.`}
        >
          <input
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(event) => setProgress(event.target.value)}
            className="admin-input"
          />
        </Field>
      </div>

      <Toggle label="Published" checked={isPublished} onChange={setIsPublished} />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onSubmit({
              stage,
              title,
              description: description || undefined,
              status,
              progressValue: progress === "" ? undefined : Number(progress),
              occurredAt: occurredAt || undefined,
              isPublished,
            })
          }
          className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {update ? "Save update" : "Add update"}
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

function StatusChip({ status }: { status: ConstructionStatus }) {
  const tones: Record<ConstructionStatus, string> = {
    planned: "bg-zinc-500/20 text-zinc-400",
    "in-progress": "bg-amber-500/20 text-amber-400",
    complete: "bg-emerald-500/20 text-emerald-400",
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tones[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

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
