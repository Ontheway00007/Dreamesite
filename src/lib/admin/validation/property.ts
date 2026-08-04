import {
  ErrorBag,
  invalid,
  isBlank,
  isRealNumber,
  valid,
  type ValidationResult,
} from "@/lib/admin/validation/result";

/**
 * Property form validation.
 *
 * These rules mirror the database constraints in
 * `supabase/migrations/0001_extensions_and_schema.sql`. The database remains
 * the authority — it will reject bad data whatever this module says — but
 * catching problems here produces a message an administrator can act on
 * instead of a constraint violation they cannot.
 *
 * Pure and dependency-free on purpose: no database, no session, no request.
 */

export interface PropertyInput {
  readonly name: string;
  readonly slug: string;
  readonly summary: string;
  readonly descriptionBlocks?: ReadonlyArray<{ id: string; text: string }>;
  readonly descriptionSource?: "written" | "ai-assisted";
  readonly status: string;
  readonly suburb: string;
  readonly state: string;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly carSpaces: number;
  readonly landSizeSqm: number;
  readonly houseSizeSqm?: number;
  readonly priceDisplay?: string;
  readonly completionLabel?: string;
  readonly isFeatured: boolean;
  readonly isPublished: boolean;
  readonly displayPriority: number;
  readonly displayIsHome: boolean;
  readonly displayOpeningNote?: string;
  readonly currentStageId?: string;
}

/** Matches the `properties_slug_format` CHECK constraint exactly. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PROPERTY_STATUSES = [
  "move-in-ready",
  "under-construction",
  "completed",
  "sold",
] as const;

export const LIMITS = {
  name: 200,
  slug: 100,
  summary: 500,
  priceDisplay: 100,
  completionLabel: 120,
  openingNote: 200,
  bedrooms: 20,
  bathrooms: 20,
  carSpaces: 10,
  /** Generous upper bounds that still catch a mistyped extra digit. */
  landSizeSqm: 1_000_000,
  houseSizeSqm: 100_000,
  displayPriority: 100_000,
} as const;

/**
 * Validates a slug on its own.
 *
 * Exported separately because the create form checks the slug as the
 * administrator types, before the rest of the record is complete.
 */
export function validateSlug(slug: string): ValidationResult<string> {
  const errors = new ErrorBag();

  if (isBlank(slug)) {
    errors.add("slug", "Add a URL slug.");
    return invalid(errors.all);
  }

  if (slug.length > LIMITS.slug) {
    errors.add("slug", `Keep the slug to ${LIMITS.slug} characters or fewer.`);
  } else if (!SLUG_PATTERN.test(slug)) {
    errors.add(
      "slug",
      "Use lowercase letters, numbers and single hyphens only — for example single-storey-concept.",
    );
  }

  return errors.isEmpty ? valid(slug) : invalid(errors.all);
}

/** Converts a title into a valid slug. Shared by the form and any importer. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    // Strip accents so "Café" becomes "cafe" rather than losing the letter.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug)
    // A trailing hyphen can survive the slice.
    .replace(/-+$/, "");
}

function checkWholeNumber(
  errors: ErrorBag,
  field: string,
  label: string,
  value: number,
  max: number,
): void {
  if (!isRealNumber(value)) {
    errors.add(field, `${label} must be a number.`);
    return;
  }

  if (!Number.isInteger(value)) {
    errors.add(field, `${label} must be a whole number.`);
    return;
  }

  if (value < 0) {
    errors.add(field, `${label} cannot be negative.`);
    return;
  }

  if (value > max) {
    errors.add(field, `${label} looks too high — the maximum is ${max}.`);
  }
}

/**
 * Validates a complete property record.
 *
 * Returns the trimmed, normalised value on success so callers write the
 * cleaned version rather than trimming again at the call site.
 */
export function validateProperty(
  input: PropertyInput,
): ValidationResult<PropertyInput> {
  const errors = new ErrorBag();

  /* --- Identity --- */

  if (isBlank(input.name)) {
    errors.add("name", "Add a property name.");
  } else if (input.name.trim().length > LIMITS.name) {
    errors.add("name", `Keep the name to ${LIMITS.name} characters or fewer.`);
  }

  const slugResult = validateSlug(input.slug);
  if (!slugResult.ok) {
    for (const error of slugResult.errors) {
      errors.add(error.field, error.message);
    }
  }

  if (isBlank(input.summary)) {
    errors.add("summary", "Add a one-sentence summary.");
  } else if (input.summary.trim().length > LIMITS.summary) {
    errors.add(
      "summary",
      `Keep the summary to ${LIMITS.summary} characters or fewer.`,
    );
  }

  /* --- Classification --- */

  if (!(PROPERTY_STATUSES as readonly string[]).includes(input.status)) {
    errors.add("status", "Choose one of the four property statuses.");
  }

  if (isBlank(input.suburb)) {
    errors.add("suburb", "Add a suburb.");
  }

  if (isBlank(input.state)) {
    errors.add("state", "Add a state.");
  }

  /* --- Measurements --- */

  checkWholeNumber(errors, "bedrooms", "Bedrooms", input.bedrooms, LIMITS.bedrooms);
  checkWholeNumber(errors, "bathrooms", "Bathrooms", input.bathrooms, LIMITS.bathrooms);
  checkWholeNumber(errors, "carSpaces", "Car spaces", input.carSpaces, LIMITS.carSpaces);
  checkWholeNumber(
    errors,
    "landSizeSqm",
    "Land size",
    input.landSizeSqm,
    LIMITS.landSizeSqm,
  );

  if (input.houseSizeSqm !== undefined) {
    checkWholeNumber(
      errors,
      "houseSizeSqm",
      "House size",
      input.houseSizeSqm,
      LIMITS.houseSizeSqm,
    );
  }

  checkWholeNumber(
    errors,
    "displayPriority",
    "Display priority",
    input.displayPriority,
    LIMITS.displayPriority,
  );

  /* --- Optional copy --- */

  if (
    input.priceDisplay !== undefined &&
    input.priceDisplay.length > LIMITS.priceDisplay
  ) {
    errors.add(
      "priceDisplay",
      `Keep the price text to ${LIMITS.priceDisplay} characters or fewer.`,
    );
  }

  if (
    input.completionLabel !== undefined &&
    input.completionLabel.length > LIMITS.completionLabel
  ) {
    errors.add(
      "completionLabel",
      `Keep the completion label to ${LIMITS.completionLabel} characters or fewer.`,
    );
  }

  if (
    input.displayOpeningNote !== undefined &&
    input.displayOpeningNote.length > LIMITS.openingNote
  ) {
    errors.add(
      "displayOpeningNote",
      `Keep the opening note to ${LIMITS.openingNote} characters or fewer.`,
    );
  }

  /* --- Description blocks --- */
  //
  // Block ids are React keys and CMS identities. A duplicate or empty id
  // would make paragraphs swap places on edit.

  if (input.descriptionBlocks && input.descriptionBlocks.length > 0) {
    const seen = new Set<string>();

    for (const block of input.descriptionBlocks) {
      if (isBlank(block.id)) {
        errors.add("description", "Every description block needs an id.");
        break;
      }

      if (seen.has(block.id)) {
        errors.add(
          "description",
          "Two description blocks share the same id. Ids must be unique.",
        );
        break;
      }

      seen.add(block.id);
    }

    const allEmpty = input.descriptionBlocks.every((block) =>
      isBlank(block.text),
    );

    if (allEmpty) {
      errors.add(
        "description",
        "Remove the empty description blocks or add text to them.",
      );
    }
  }

  if (
    input.descriptionSource !== undefined &&
    input.descriptionSource !== "written" &&
    input.descriptionSource !== "ai-assisted"
  ) {
    errors.add("descriptionSource", "Description source is not recognised.");
  }

  if (!errors.isEmpty) {
    return invalid(errors.all);
  }

  return valid(normaliseProperty(input));
}

/**
 * Trims text and collapses empty optional strings to `undefined`.
 *
 * Doing this once, here, is what lets the Server Actions write the value
 * straight through without re-trimming — and stops an empty string being
 * stored where the schema means "not set".
 */
export function normaliseProperty(input: PropertyInput): PropertyInput {
  const optional = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  };

  return {
    ...input,
    name: input.name.trim(),
    slug: input.slug.trim(),
    summary: input.summary.trim(),
    suburb: input.suburb.trim(),
    state: input.state.trim(),
    priceDisplay: optional(input.priceDisplay),
    completionLabel: optional(input.completionLabel),
    displayOpeningNote: optional(input.displayOpeningNote),
    currentStageId: optional(input.currentStageId),
    descriptionBlocks: input.descriptionBlocks
      ?.map((block) => ({ id: block.id.trim(), text: block.text.trim() }))
      .filter((block) => block.text !== ""),
  };
}
