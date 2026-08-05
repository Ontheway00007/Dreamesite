"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  saveEnquiryNotes,
  setEnquiryStatus,
  type EnquiryActionResult,
} from "@/lib/admin/actions/enquiry-actions";
import type { AdminEnquiry } from "@/lib/admin/enquiry-repository";
import {
  ENQUIRY_LIMITS,
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  type EnquiryStatus,
} from "@/lib/admin/validation/enquiry";
import { AdminAlert } from "@/components/admin/admin-alert";

/**
 * The enquiry queue.
 *
 * Each enquiry is a card rather than a table row: the message is the point of
 * the record, and a message does not fit in a cell. The sender's details,
 * the property asked about and the reply link are all visible without expanding
 * anything; the full message and the notes field open on demand.
 *
 * There is no delete control. See the note at the foot of the list.
 */

interface Props {
  readonly enquiries: readonly AdminEnquiry[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
}

const STATUS_TONES: Readonly<Record<EnquiryStatus, string>> = {
  new: "bg-accent/20 text-accent",
  read: "bg-sky-500/20 text-sky-400",
  replied: "bg-emerald-500/20 text-emerald-400",
  archived: "bg-zinc-500/20 text-zinc-400",
};

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Collapsed preview length. Long enough to recognise the enquiry. */
const PREVIEW_LENGTH = 180;

export function EnquiryList({ enquiries, total, page, perPage }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function run(action: () => Promise<EnquiryActionResult>, onDone?: () => void) {
    setError(null);

    startTransition(async () => {
      const result = await action();

      if (result.success) {
        router.refresh();
        onDone?.();
        return;
      }

      setError(result.error ?? "Something went wrong.");
    });
  }

  function handlePageChange(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextPage > 1) {
      params.set("page", String(nextPage));
    } else {
      params.delete("page");
    }

    const query = params.toString();

    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  if (enquiries.length === 0) {
    return (
      <div className="bg-surface border-border rounded-xl border p-12 text-center">
        <p className="text-foreground-muted">
          No enquiries match these filters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <AdminAlert tone="error" title={error} />}

      <ul className="space-y-3">
        {enquiries.map((enquiry) => {
          const isExpanded = expandedId === enquiry.id;
          const needsTruncating = enquiry.message.length > PREVIEW_LENGTH;

          return (
            <li
              key={enquiry.id}
              className={`border-border bg-surface rounded-xl border p-5 ${
                enquiry.status === "new" ? "border-l-accent border-l-2" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground text-sm font-medium">
                      {enquiry.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        STATUS_TONES[enquiry.status]
                      }`}
                    >
                      {ENQUIRY_STATUS_LABELS[enquiry.status]}
                    </span>
                    {enquiry.suspectedSpam && (
                      <span
                        className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400"
                        title="The message contains a link, which most spam does. Judge it yourself."
                      >
                        Possible spam
                      </span>
                    )}
                    {!enquiry.consentToContact && (
                      <span
                        className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400"
                        title="This sender did not confirm consent to be contacted."
                      >
                        No consent
                      </span>
                    )}
                  </div>

                  <p className="text-foreground-muted mt-1.5 text-sm">
                    <a
                      href={`mailto:${enquiry.email}`}
                      className="hover:text-accent transition-colors"
                    >
                      {enquiry.email}
                    </a>
                    {enquiry.phone && (
                      <>
                        {" · "}
                        <a
                          href={`tel:${enquiry.phone.replace(/[^0-9+]/g, "")}`}
                          className="hover:text-accent transition-colors"
                        >
                          {enquiry.phone}
                        </a>
                      </>
                    )}
                  </p>

                  <p className="text-foreground-subtle mt-1 text-xs">
                    {formatWhen(enquiry.createdAt)}
                    {" · "}
                    {enquiry.property ? (
                      <>
                        About{" "}
                        <a
                          href={`/admin/properties/${enquiry.property.id}`}
                          className="hover:text-foreground-muted underline decoration-dotted"
                        >
                          {enquiry.property.name}
                        </a>
                      </>
                    ) : (
                      "General enquiry"
                    )}
                    {` · via ${enquiry.source}`}
                  </p>
                </div>

                <StatusSelect
                  value={enquiry.status}
                  disabled={isPending}
                  onChange={(next) =>
                    run(() => setEnquiryStatus(enquiry.id, next))
                  }
                />
              </div>

              {/* The message. Pre-wrapped so the sender's line breaks survive,
                  and never rendered as HTML. */}
              <p className="text-foreground mt-4 text-sm leading-relaxed whitespace-pre-wrap">
                {isExpanded || !needsTruncating
                  ? enquiry.message
                  : `${enquiry.message.slice(0, PREVIEW_LENGTH).trimEnd()}…`}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : enquiry.id)}
                  aria-expanded={isExpanded}
                  className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  {isExpanded ? "Hide detail" : "Open"}
                </button>

                <a
                  href={`mailto:${enquiry.email}?subject=${encodeURIComponent(
                    enquiry.property
                      ? `Your enquiry about ${enquiry.property.name}`
                      : "Your enquiry",
                  )}`}
                  className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  Reply by email
                </a>

                {enquiry.adminNotes && !isExpanded && (
                  <span className="text-foreground-subtle text-xs">
                    Has notes
                  </span>
                )}
              </div>

              {isExpanded && (
                <NotesEditor
                  enquiryId={enquiry.id}
                  notes={enquiry.adminNotes ?? ""}
                  disabled={isPending}
                  onSave={(value, done) =>
                    run(() => saveEnquiryNotes(enquiry.id, value), done)
                  }
                />
              )}
            </li>
          );
        })}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-foreground-subtle text-sm">
            Showing {(page - 1) * perPage + 1}–
            {Math.min(page * perPage, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || isPending}
              className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-foreground-muted text-sm">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || isPending}
              className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/*
        Stated on the page, not only in the code: an administrator looking for a
        delete button should find out here why there isn't one.
      */}
      <p className="text-foreground-subtle border-border border-t pt-4 text-xs leading-relaxed">
        Enquiries cannot be deleted from this interface. Archiving takes one out
        of the queue while keeping the record of the question that was asked. A
        permanent deletion route belongs with a written retention policy — until
        the business has one, there is nothing here that can quietly destroy
        someone&rsquo;s enquiry.
      </p>
    </div>
  );
}

/* --- Status control ----------------------------------------------------- */

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: EnquiryStatus;
  disabled: boolean;
  onChange: (next: EnquiryStatus) => void;
}) {
  return (
    <span className="shrink-0">
      <label className="sr-only" htmlFor={`status-${value}`}>
        Change status
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as EnquiryStatus)}
        className="bg-surface border-border text-foreground-muted rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
      >
        {ENQUIRY_STATUSES.map((status) => (
          <option key={status} value={status}>
            {ENQUIRY_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </span>
  );
}

/* --- Notes -------------------------------------------------------------- */

function NotesEditor({
  enquiryId,
  notes,
  disabled,
  onSave,
}: {
  enquiryId: string;
  notes: string;
  disabled: boolean;
  onSave: (value: string, onDone: () => void) => void;
}) {
  const [draft, setDraft] = useState(notes);
  const [saved, setSaved] = useState(false);

  const isDirty = draft !== notes;

  return (
    <div className="border-border mt-5 border-t pt-5">
      <label
        htmlFor={`notes-${enquiryId}`}
        className="text-foreground-muted block text-sm font-medium"
      >
        Internal notes
      </label>
      <p className="text-foreground-subtle mt-1 text-xs">
        Visible to administrators only. Never shown to the sender or published.
      </p>
      <textarea
        id={`notes-${enquiryId}`}
        value={draft}
        maxLength={ENQUIRY_LIMITS.notes}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaved(false);
        }}
        rows={3}
        className="bg-surface border-border text-foreground focus:border-accent focus:ring-accent/20 mt-2 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2"
        placeholder="Called back on Tuesday, sending the Mickleham plans."
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || !isDirty}
          onClick={() => onSave(draft, () => setSaved(true))}
          className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
        >
          Save notes
        </button>
        {saved && !isDirty && (
          <span role="status" className="text-xs text-emerald-400">
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
