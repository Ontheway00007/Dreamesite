/**
 * Error translation for the admin surface.
 *
 * Database errors are useful to an engineer reading a server log and actively
 * harmful in a browser: constraint names, column names and table names describe
 * the schema to anyone who provokes a failure, and none of it tells an
 * administrator what to do differently.
 *
 * Every write path therefore passes failures through `toFriendlyError`, which
 * returns a sentence written for the person using the dashboard. The original
 * error is logged server-side by `logAdminError` and never travels back with the
 * response.
 *
 * ## Four layers, most specific first
 *
 * 1. **Authored messages.** Migration 0011 raises the schema's own rules with
 *    SQLSTATE `PT422` (a rule refused this) or `PT409` (the data changed
 *    underneath you). PostgreSQL raises nothing in class `PT`, so those codes
 *    are proof the message was written here for an administrator to read, and
 *    it is returned verbatim.
 *
 * 2. **Recognised constraints.** A unique or check violation names its
 *    constraint in the message text. The name is extracted, looked up in a
 *    table of constraints this schema actually defines, and *discarded*. The
 *    lookup is what turns "23505 somewhere" into "that slug is taken" without
 *    the caller having to say which operation it was running.
 *
 * 3. **Caller-supplied wording.** An operation that knows more than the tables
 *    below can pass its own mapping for a code or a constraint.
 *
 * 4. **Generic wording by code**, then a plain fallback.
 *
 * ## What changed, and why it mattered
 *
 * Layers 1 and 2 are new. Before them, one message was attached to each
 * PostgreSQL code: every `23505` said "check the slug is unique" and every
 * `23514` said "check the location and privacy settings". Once Phase 6 started
 * using those codes for images, construction stages, features, SEO and site
 * settings, most of those sentences were being shown to administrators who were
 * nowhere near a slug or a location.
 *
 * Authored messages were previously recognised by matching the start of the
 * message text against a list. That worked until a message was reworded, at
 * which point it silently stopped working and the administrator started seeing
 * the generic sentence instead. Recognition by SQLSTATE cannot rot that way.
 *
 * This module is deliberately free of `server-only` so the same mapping can be
 * unit-tested and reused by future API routes.
 */

/** Shape both `postgrest-js` errors and thrown `Error`s reduce to. */
export interface DatabaseErrorLike {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

const FALLBACK = "Something went wrong saving your changes. Please try again.";

/**
 * SQLSTATEs this schema raises for messages written for administrators.
 *
 * The `PT` prefix additionally asks PostgREST for a specific HTTP status, so
 * these surface as 422 and 409 rather than 500. See migration 0011 §1.
 */
const AUTHORED_CODES: ReadonlySet<string> = new Set(["PT422", "PT409"]);

/**
 * Wording for the constraints this schema defines.
 *
 * Every key is a constraint or unique index that actually exists in
 * `supabase/migrations`. Anything not listed falls through to the generic
 * message for its code — an unrecognised constraint must never have its name
 * shown, and inventing wording for a constraint nobody has looked at would be
 * guessing at what the administrator did wrong.
 *
 * Only the constraints an administrator can realistically trip are here. The
 * length and format checks are all mirrored by TypeScript validators that
 * produce a message against the offending field, so reaching the database with
 * one of those means the validator has a gap — the generic sentence is the right
 * answer, and the server log is where that gap gets noticed.
 */
const BY_CONSTRAINT: Readonly<Record<string, string>> = {
  properties_slug_key: "That slug is already used by another property.",
  property_images_one_hero_per_property:
    "This property already has a main image. Reload and try again.",
  construction_updates_one_per_stage:
    "This property already has an update for that stage.",
  suburb_references_unique: "That suburb is already in the reference list.",
  site_settings_singleton:
    "Site settings already exist. Reload the page and edit the existing settings.",
  property_images_single_source:
    "An image can have an uploaded file or a link, not both.",
  property_resources_single_source:
    "A resource can have an uploaded file or a link, not both.",
  resource_target_present: "Add either a file or a link for this resource.",
  image_source_present: "Add either a file or a link for this image.",
  manual_marker_pair:
    "A manual map position needs both a latitude and a longitude.",
  public_coordinate_pair:
    "A public map position needs both a latitude and a longitude.",
  directions_require_coordinate:
    "Directions can only be offered when a public map position exists.",
  approximate_requires_radius:
    "An approximate location needs a privacy radius.",
};

/**
 * Generic wording by PostgreSQL code.
 *
 * Deliberately operation-agnostic. None of these may name a field, a table or a
 * feature, because the same code arrives from every write in the application.
 * Anything absent falls through to the fallback on purpose — an unrecognised
 * failure must not leak its own description.
 */
const GENERIC_BY_CODE: Readonly<Record<string, string>> = {
  // 23505 unique_violation
  "23505": "A record with those details already exists.",
  // 23503 foreign_key_violation
  "23503":
    "That record links to something that no longer exists. Refresh and try again.",
  // 23502 not_null_violation
  "23502": "A required field is missing. Check every field marked required.",
  // 23514 check_violation — the database's own integrity rules
  "23514":
    "Those values do not satisfy the required rules. Review the highlighted fields and try again.",
  // 22001 string_data_right_truncation
  "22001": "One of those values is too long. Shorten it and try again.",
  // 42501 insufficient_privilege — RLS refused the write
  "42501":
    "You do not have permission to make that change. Your administrator access may have been withdrawn — sign out and back in.",
  // 42P17 infinite_recursion — a policy misconfiguration, not a user error
  "42P17":
    "The server is misconfigured and cannot check your permissions. Contact a system administrator.",
  // P0002 no_data_found, raised by our own functions
  P0002:
    "That record no longer exists. It may have been deleted by someone else.",
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
 * Per-operation wording, for the cases the tables above cannot know about.
 *
 * `byConstraint` wins over the shared table, so an operation can say something
 * better about a constraint it is specifically exercising.
 */
export interface FriendlyErrorOptions {
  /** Shown when nothing more specific matches. */
  readonly fallback?: string;
  readonly byConstraint?: Readonly<Record<string, string>>;
  readonly byCode?: Readonly<Record<string, string>>;
}

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
 * Pulls the constraint name out of a PostgreSQL violation message.
 *
 * Both forms PostgreSQL uses put it in double quotes after the word
 * "constraint":
 *
 *   duplicate key value violates unique constraint "properties_slug_key"
 *   new row for relation "x" violates check constraint "y_check"
 *
 * The name is only ever used as a lookup key. It is never returned, and an
 * unrecognised name yields nothing rather than being echoed.
 */
function constraintNameOf(message: string | undefined): string | null {
  if (!message) return null;

  const match = /constraint "([^"]+)"/.exec(message);

  return match ? match[1] : null;
}

/**
 * Turns any failure into a sentence safe to show an administrator.
 *
 * Accepts a bare string as the second argument for the common case of "just
 * give me a better fallback", which is how most call sites use it.
 */
export function toFriendlyError(
  error: unknown,
  options: string | FriendlyErrorOptions = {},
): string {
  const resolved: FriendlyErrorOptions =
    typeof options === "string" ? { fallback: options } : options;

  const fallback = resolved.fallback ?? FALLBACK;
  const { code, message } = normalise(error);

  // 1. Authored by this schema: safe to show exactly as written.
  if (code && AUTHORED_CODES.has(code)) {
    return message ?? fallback;
  }

  // 2 and 3. A named constraint, caller's wording first.
  const constraint = constraintNameOf(message);

  if (constraint) {
    const specific =
      resolved.byConstraint?.[constraint] ?? BY_CONSTRAINT[constraint];

    if (specific) {
      return specific;
    }
  }

  // 3. Caller's wording for this code.
  if (code && resolved.byCode?.[code]) {
    return resolved.byCode[code];
  }

  // 4. Generic wording for this code, then the fallback.
  if (code && GENERIC_BY_CODE[code]) {
    return GENERIC_BY_CODE[code];
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
  options?: string | FriendlyErrorOptions,
): string {
  logAdminError(context, error);

  return toFriendlyError(error, options);
}
