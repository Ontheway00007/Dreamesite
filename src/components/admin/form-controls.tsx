"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Form primitives shared by the admin editors.
 *
 * Extracted from the property editor so the location editor renders labels,
 * hints and validation messages identically — and so the accessibility
 * wiring (`aria-describedby`, `aria-invalid`, generated ids) exists in one
 * place rather than being re-derived per form.
 */

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** Server-side validation message for this field, when there is one. */
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-foreground-muted block text-sm font-medium">
        {label}
        {required && (
          <span className="text-accent ml-1" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>

      {/*
        The caller owns the input element, so the id and ARIA attributes are
        cloned onto it here rather than requiring every call site to thread
        them through by hand.
      */}
      <FieldControl id={id} describedBy={describedBy} invalid={Boolean(error)}>
        {children}
      </FieldControl>

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

/**
 * Applies the field's id and ARIA state to whatever control was passed in.
 *
 * `cloneElement` keeps call sites to a plain `<input>` — the alternative, a
 * render prop threading four attributes through every field, is noticeably
 * noisier for no gain.
 */
function FieldControl({
  id,
  describedBy,
  invalid,
  children,
}: {
  id: string;
  describedBy?: string;
  invalid: boolean;
  children: ReactNode;
}) {
  if (!isValidElement(children)) {
    return <>{children}</>;
  }

  const element = children as ReactElement<{
    className?: string;
    id?: string;
  }>;

  const invalidClass = invalid
    ? " border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
    : "";

  return cloneElement(element, {
    id,
    className: `${element.props.className ?? ""}${invalidClass}`,
    ...({
      "aria-describedby": describedBy,
      "aria-invalid": invalid || undefined,
    } as Record<string, unknown>),
  });
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  const id = useId();

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          id={id}
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            checked ? "bg-accent" : "bg-zinc-700"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              checked ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <label htmlFor={id} className="text-foreground-muted cursor-pointer text-sm">
          {label}
        </label>
      </div>
      {hint && <p className="text-foreground-subtle ml-11 text-xs">{hint}</p>}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent border-border h-4 w-4 rounded bg-transparent"
      />
      <label htmlFor={id} className="text-foreground-muted cursor-pointer text-sm">
        {label}
      </label>
    </div>
  );
}
