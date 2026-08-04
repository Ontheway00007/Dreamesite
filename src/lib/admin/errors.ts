/**
 * Error translation for the admin surface.
 *
 * Database errors are useful to an engineer reading a server log and
 * actively harmful in a browser: constraint names, column names and table
 * names describe the schema to anyone who provokes a failure, and none of it
 * tells an administrator what to do differently.
 *
 * Every write path therefore passes failures through `toFriendlyError`,
 * which returns a sentence written for the person using the dashboard. The
 * original error is logged server-side by `logAdminError` and never
 * travels back with the response.
 *
 * This module is deliberately free of `server-only` so the same mapping can
 * be unit-tested and reused by future API routes.
 */

/** Shape both `postgrest-js` errors and thrown `Error`s reduce to. */
export interface DatabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

const FALLBACK =
  "Something went wrong saving your changes. Please try again.";

/**
 * PostgreSQL error codes that have a meaningful admin-facing explanation.
 * Anything absent falls through to the generic message on purpose — an
 * unrecognised failure must not leak its own description.
 */
const BY_CODE: Readonly<Record<string, string>> = {
  // 23505 unique_violation
  "23505": "Something with those details already exists. Check the slug is unique.",
  // 23503 foreign_key_violation
  "23503": "That record links to something that no longer exists. Refresh and try again.",
  // 23502 not_null_violation
  "23502": "A required field is missing. Check every field marked required.",
  // 23514 check_violation — the database's own integrity rules
  "23514": "Those values are not a valid combination. Check the location and privacy settings.",
  // 42501 insufficient_privilege — RLS refused the write
  "42501":
    "You do not have permission to make that change. Your administrator access may have been withdrawn — sign out and back in.",
  // 42P17 infinite_recursion — a policy misconfiguration, not a user error
  "42P17":
    "The server is misconfigured and cannot check your permissions. Contact a system administrator.",
  // P0002 no_data_found, raised by our own functions
  P0002: "That record no longer exists. It may have been deleted by someone else.",
  // PGRST116 — PostgREST: no rows where exactly one was expected
  PGRST116: "That record could not be found.",
  // PGRST301 — PostgREST: JWT expired
  PGRST301: "Your session has expired. Please sign in again.",
  // 57014 query_canceled / statement timeout
  "57014": "That took too long to complete. Please try again.",
  // 40001 serialization_failure, 40P01 deadlock_detected
  "40001": "Someone else changed this at the same time. Reload and try again.",
  "40P01": "Someone else changed this at the same time. Reload and try again.",
};

/**
 * Messages our own database functions raise deliberately. These are written
 * for an administrator already, so they pass through verbatim.
 *
 * Matching on the text is acceptable here precisely because we author both
 * sides; it is never used to interpret an error PostgreSQL itself produced.
 */
const PASS_THROUGH_PREFIXES: readonly string[] = [
  "Administrator access is required.",
  "That property no longer exists.",
  "You cannot remove your own administrator access.",
  "You cannot change your own administrator role or status.",
  "audit_log is append-only",
];

function normalise(error: unknown): DatabaseErrorLike {
  if (error === null || error === undefined) {
    return {};
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (typeof error === "object") {
    const candidate = error as Record<string, unknown>;

    return {
      code: typeof candidate.code === "string" ? candidate.code : undefined,
      message:
        typeof candidate.message === "string" ? candidate.message : undefined,
      details:
        typeof candidate.details === "string" ? candidate.details : undefined,
      hint: typeof candidate.hint === "string" ? candidate.hint : undefined,
    };
  }

  return {};
}

/**
 * Turns any failure into a sentence safe to show an administrator.
 *
 * `fallback` lets a caller describe the operation that failed ("Could not
 * publish this property.") while still refusing to surface the underlying
 * error text.
 */
export function toFriendlyError(error: unknown, fallback = FALLBACK): string {
  const { code, message } = normalise(error);

  if (code && BY_CODE[code]) {
    return BY_CODE[code];
  }

  if (message) {
    // Our own raised messages are already administrator-facing.
    const passthrough = PASS_THROUGH_PREFIXES.find((prefix) =>
      message.startsWith(prefix),
    );

    if (passthrough) {
      return message;
    }

    // A raised exception arrives with the PL/pgSQL prefix attached; strip it
    // and re-check, so `save_property_location` messages still pass through.
    const stripped = message.replace(/^ERROR:\s*/i, "").trim();
    const strippedMatch = PASS_THROUGH_PREFIXES.find((prefix) =>
      stripped.startsWith(prefix),
    );

    if (strippedMatch) {
      return stripped;
    }
  }

  return fallback;
}

/**
 * Records the full error where engineers can reach it.
 *
 * Kept separate from `toFriendlyError` so it is obvious at every call site
 * that the detailed error was captured and the sanitised one returned.
 */
export function logAdminError(context: string, error: unknown): void {
  const { code, message, details, hint } = normalise(error);

  console.error(`[admin] ${context}`, {
    code,
    message,
    details,
    hint,
    // The raw object last, so structured fields stay readable in log viewers
    // that truncate long lines.
    raw: error,
  });
}

/**
 * Logs the real failure and returns the sanitised message in one step —
 * the shape almost every Server Action wants.
 */
export function handleAdminError(
  context: string,
  error: unknown,
  fallback?: string,
): string {
  logAdminError(context, error);

  return toFriendlyError(error, fallback);
}
