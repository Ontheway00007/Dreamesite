"use client";

import { useActionState } from "react";
import { useEffect, useId, useRef } from "react";

import {
  ENQUIRY_LIMITS,
  HONEYPOT_FIELD,
  TIMESTAMP_FIELD,
} from "@/lib/admin/validation/enquiry";
import {
  initialEnquiryState,
  type EnquiryFormState,
} from "@/lib/enquiries/form-state";
import { submitEnquiry } from "@/lib/enquiries/submit";

export interface EnquiryFormProps {
  /**
   * The property being asked about, when the form is on a property page. Must
   * be a published property — the insert policy checks.
   */
  propertyId?: string;
  /** Recorded against the enquiry so staff know which page it came from. */
  source: "homepage" | "property-page" | "contact";
  /** Prefilled opening line, e.g. naming the home. */
  defaultMessage?: string;
}

/**
 * The public enquiry form.
 *
 * A real `<form>` posting to a Server Action, so it works before hydration and
 * without JavaScript. Every field has a `<label>`, errors are attached with
 * `aria-describedby` and `aria-invalid`, and the result is announced in a live
 * region — the sender should never have to guess whether the message went.
 *
 * The two anti-abuse fields are the honeypot and the render timestamp. Both are
 * friction rather than security: they are supplied by the client and a
 * determined script can satisfy both. They exist to stop indiscriminate
 * form-filling, which is the bulk of what arrives.
 */
export function EnquiryForm({
  propertyId,
  source,
  defaultMessage,
}: EnquiryFormProps) {
  const [state, formAction, isPending] = useActionState<
    EnquiryFormState,
    FormData
  >(submitEnquiry, initialEnquiryState);

  const timestampRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Stamped on mount rather than rendered by the server: these pages are
    // cached, so a server timestamp would arrive stale and read as expired.
    // Re-runs after a failed attempt so a retry is timed from the retry.
    if (timestampRef.current) {
      timestampRef.current.value = String(Date.now());
    }
  }, [state]);

  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="border-accent/30 bg-accent/5 rounded-lg border px-5 py-6"
      >
        <p className="text-foreground text-sm font-medium">Enquiry sent</p>
        <p className="text-foreground-muted mt-2 text-sm leading-relaxed">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="max-w-xl space-y-5">
      {/*
        Announced when it appears, so a failure is not left to a sighted scan
        of the page.
      */}
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {state.message}
        </p>
      )}

      {/* Set by the page, not the sender. Validated server-side regardless. */}
      {propertyId && <input type="hidden" name="propertyId" value={propertyId} />}
      <input type="hidden" name="source" value={source} />
      {/* Empty until the mount effect fills it. A submission without it is
          accepted: absence carries no information either way. */}
      <input
        ref={timestampRef}
        type="hidden"
        name={TIMESTAMP_FIELD}
        defaultValue=""
      />

      {/*
        The honeypot. Hidden from sight and from assistive technology, and
        removed from the tab order, so no real visitor can fill it — which is
        what makes a filled value meaningful.
      */}
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <label htmlFor={`${HONEYPOT_FIELD}-field`}>Company website</label>
        <input
          id={`${HONEYPOT_FIELD}-field`}
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <TextField
        name="name"
        label="Your name"
        required
        autoComplete="name"
        maxLength={ENQUIRY_LIMITS.name}
        defaultValue={values.name}
        error={errors.name}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          name="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          maxLength={ENQUIRY_LIMITS.email}
          defaultValue={values.email}
          error={errors.email}
        />
        <TextField
          name="phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          maxLength={ENQUIRY_LIMITS.phone}
          defaultValue={values.phone}
          error={errors.phone}
          hint="Optional."
        />
      </div>

      <TextField
        name="message"
        label="Your enquiry"
        required
        multiline
        maxLength={ENQUIRY_LIMITS.message}
        defaultValue={values.message ?? defaultMessage}
        error={errors.message}
        hint="The suburb, timeframe and anything specific you would like to know."
      />

      <ConsentField error={errors.consentToContact} />

      {/* Errors with no field of their own, e.g. a tampered hidden value. */}
      {errors.form && (
        <p role="alert" className="text-sm text-red-400">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-6 py-3 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {isPending ? "Sending…" : "Send enquiry"}
      </button>

      <p className="text-foreground-subtle text-xs leading-relaxed">
        We use your details only to answer your enquiry. They are not shared
        with anyone else.
      </p>
    </form>
  );
}

/* --- Fields ------------------------------------------------------------ */

function TextField({
  name,
  label,
  type = "text",
  required,
  multiline,
  autoComplete,
  maxLength,
  defaultValue,
  error,
  hint,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  autoComplete?: string;
  maxLength?: number;
  defaultValue?: string;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  const className = `border-border bg-surface text-foreground placeholder:text-foreground-subtle focus:border-accent focus:ring-accent/20 w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none focus:ring-2 ${
    error ? "border-red-500/50" : ""
  }`;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-foreground-muted block text-sm font-medium"
      >
        {label}
        {required && <span className="sr-only"> (required)</span>}
        {required && (
          <span className="text-accent ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {multiline ? (
        <textarea
          id={id}
          name={name}
          rows={5}
          required={required}
          maxLength={maxLength}
          defaultValue={defaultValue}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${className} resize-y`}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          maxLength={maxLength}
          defaultValue={defaultValue}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={className}
        />
      )}

      {error && (
        <p id={errorId} className="text-xs text-red-400">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-foreground-subtle text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

function ConsentField({ error }: { error?: string }) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name="consentToContact"
          value="yes"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className="accent-accent border-border mt-0.5 h-4 w-4 shrink-0 rounded bg-transparent"
        />
        <label htmlFor={id} className="text-foreground-muted text-sm leading-relaxed">
          I am happy for the team to contact me about this enquiry.
        </label>
      </div>
      {error && (
        <p id={errorId} className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
