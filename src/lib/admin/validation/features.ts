import {
  ErrorBag,
  invalid,
  isBlank,
  valid,
  type ValidationResult,
} from "@/lib/admin/validation/result";

/**
 * Property feature validation.
 *
 * Features are the richer specification the fixed columns cannot express:
 * "Energy rating — 7 stars", "Kitchen — 40 mm stone benchtops". Mirrors the
 * constraints migration 0010 adds to `property_features`.
 */

/**
 * Feature categories, which become the headings on the public page.
 *
 * A fixed vocabulary because each one is a section: free text would produce a
 * page of one-item groups, each with its own heading.
 */
export const FEATURE_CATEGORIES = [
  "highlight",
  "inclusion",
  "specification",
  "material",
  "energy",
  "design",
] as const;

export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

/** Public heading for each group, and the order they appear in. */
export const FEATURE_CATEGORY_META: ReadonlyArray<{
  readonly category: FeatureCategory;
  readonly heading: string;
  readonly description: string;
}> = [
  {
    category: "highlight",
    heading: "Highlights",
    description: "The two or three things that define this home.",
  },
  {
    category: "inclusion",
    heading: "Inclusions",
    description: "What comes with the home as built.",
  },
  {
    category: "specification",
    heading: "Specifications",
    description: "Measured detail beyond the headline figures.",
  },
  {
    category: "material",
    heading: "Materials and finishes",
    description: "What the home is made of.",
  },
  {
    category: "energy",
    heading: "Energy and comfort",
    description: "Ratings, heating, cooling and insulation.",
  },
  {
    category: "design",
    heading: "Design",
    description: "Layout and architectural decisions.",
  },
];

export const FEATURE_LIMITS = {
  label: 120,
  value: 200,
} as const;

const MARKUP_PATTERN = /<[^>]*>/;

export interface FeatureInput {
  readonly category: string;
  readonly label: string;
  readonly value?: string;
  readonly isPublished: boolean;
}

export interface ValidatedFeature {
  readonly category: FeatureCategory;
  readonly label: string;
  readonly value?: string;
  readonly isPublished: boolean;
}

export function isFeatureCategory(value: unknown): value is FeatureCategory {
  return (
    typeof value === "string" &&
    (FEATURE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function featureCategoryHeading(category: FeatureCategory): string {
  return (
    FEATURE_CATEGORY_META.find((meta) => meta.category === category)?.heading ??
    category
  );
}

export function validateFeature(
  input: FeatureInput,
): ValidationResult<ValidatedFeature> {
  const errors = new ErrorBag();

  if (!isFeatureCategory(input.category)) {
    errors.add("category", "Choose a feature group.");
  }

  if (isBlank(input.label)) {
    errors.add("label", "Add a label, for example “Energy rating”.");
  } else if (input.label.trim().length > FEATURE_LIMITS.label) {
    errors.add(
      "label",
      `Keep the label to ${FEATURE_LIMITS.label} characters or fewer.`,
    );
  } else if (MARKUP_PATTERN.test(input.label)) {
    errors.add("label", "Remove the HTML tags — the label is shown as plain text.");
  }

  if (input.value !== undefined && input.value.trim() !== "") {
    if (input.value.trim().length > FEATURE_LIMITS.value) {
      errors.add(
        "value",
        `Keep the value to ${FEATURE_LIMITS.value} characters or fewer.`,
      );
    } else if (MARKUP_PATTERN.test(input.value)) {
      errors.add("value", "Remove the HTML tags — the value is shown as plain text.");
    }
  }

  if (!errors.isEmpty) {
    return invalid(errors.all);
  }

  const value = input.value?.trim();

  return valid({
    category: input.category as FeatureCategory,
    label: input.label.trim(),
    // A label with no value is legitimate — "Double glazing throughout" needs
    // no second half — so an empty value becomes null rather than "".
    value: value === "" ? undefined : value,
    isPublished: input.isPublished,
  });
}

/**
 * Labels that duplicate a fixed column.
 *
 * The property record already carries bedrooms, bathrooms, car spaces and both
 * sizes, and the specifications table renders them. A feature repeating one of
 * those shows the same number twice.
 *
 * Advisory rather than blocking: an administrator may legitimately want
 * "Bedrooms — 4, all with built-in robes", which says more than the figure.
 */
const DUPLICATED_LABELS = [
  "bedroom",
  "bedrooms",
  "bathroom",
  "bathrooms",
  "car space",
  "car spaces",
  "garage",
  "land size",
  "house size",
  "floor area",
] as const;

export function duplicatesCoreSpecification(label: string): boolean {
  const normalised = label.trim().toLowerCase();

  return (DUPLICATED_LABELS as readonly string[]).includes(normalised);
}
