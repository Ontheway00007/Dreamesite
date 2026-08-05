/**
 * Shared validation vocabulary for the admin platform.
 *
 * Validation used to live inside each Server Action, which meant it could
 * only ever run there. Extracting it makes the same rules available to
 * future API routes, bulk imports and client-side hints, and — more
 * importantly — makes each rule testable without a database or a session.
 *
 * Errors are structured rather than a single string so a form can highlight
 * the field at fault instead of showing one message above everything.
 */

export interface FieldError {
  /** Form field the message belongs to. */
  readonly field: string;
  /** Written for the administrator, never for an engineer. */
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly FieldError[] };

export function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function invalid<T>(
  errors: readonly FieldError[],
): ValidationResult<T> {
  return { ok: false, errors };
}

/** Collects field errors while keeping call sites readable. */
export class ErrorBag {
  private readonly entries: FieldError[] = [];

  add(field: string, message: string): void {
    this.entries.push({ field, message });
  }

  /** Adds only when `condition` holds. Keeps rules to a single line. */
  addIf(condition: boolean, field: string, message: string): void {
    if (condition) {
      this.add(field, message);
    }
  }

  get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  get all(): readonly FieldError[] {
    return this.entries;
  }
}

/**
 * Flattens field errors into one sentence.
 *
 * The dashboard shows field-level messages inline, but a few surfaces — a
 * toast, a redirect, an API response — only have room for one string.
 */
export function summarise(errors: readonly FieldError[]): string {
  if (errors.length === 0) {
    return "";
  }

  if (errors.length === 1) {
    return errors[0].message;
  }

  return errors.map((error) => error.message).join(" ");
}

/* --- Primitive helpers shared across validators ----------------------- */

export function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim() === "";
}

/** True when the value is a real, finite number — not NaN, not Infinity. */
export function isRealNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isWithin(
  value: number,
  min: number,
  max: number,
): boolean {
  return isRealNumber(value) && value >= min && value <= max;
}
