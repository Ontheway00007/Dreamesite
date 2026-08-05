import {
  ErrorBag,
  invalid,
  isBlank,
  valid,
  type ValidationResult,
} from "@/lib/admin/validation/result";

/**
 * Construction update validation.
 *
 * Mirrors the constraints migration 0010 adds to `construction_updates`. The
 * database stays the authority; these rules exist so a mistake produces a
 * sentence naming the field rather than a constraint violation.
 */

/**
 * The build stages an update may describe.
 *
 * A fixed vocabulary rather than free text: two updates calling the same stage
 * "Frame" and "Framing" would both appear on the public timeline as separate
 * steps. Mirrors `construction_updates_stage_check`.
 */
export const CONSTRUCTION_STAGES = [
  "planning",
  "site-preparation",
  "slab",
  "frame",
  "lock-up",
  "fixing",
  "final-inspection",
  "completion",
] as const;

export type ConstructionStage = (typeof CONSTRUCTION_STAGES)[number];

/** Reading order for the public timeline, and the order shown in the admin. */
export const STAGE_ORDER: Readonly<Record<ConstructionStage, number>> = {
  planning: 0,
  "site-preparation": 1,
  slab: 2,
  frame: 3,
  "lock-up": 4,
  fixing: 5,
  "final-inspection": 6,
  completion: 7,
};

export const STAGE_LABELS: Readonly<Record<ConstructionStage, string>> = {
  planning: "Planning",
  "site-preparation": "Site preparation",
  slab: "Slab",
  frame: "Frame",
  "lock-up": "Lock-up",
  fixing: "Fixing",
  "final-inspection": "Final inspection",
  completion: "Completion",
};

export const CONSTRUCTION_STATUSES = [
  "planned",
  "in-progress",
  "complete",
] as const;

export type ConstructionStatus = (typeof CONSTRUCTION_STATUSES)[number];

export const STATUS_LABELS: Readonly<Record<ConstructionStatus, string>> = {
  planned: "Planned",
  "in-progress": "In progress",
  complete: "Complete",
};

export const CONSTRUCTION_LIMITS = {
  title: 160,
  description: 2000,
} as const;

/** Rejects markup in text shown on the public site. */
const MARKUP_PATTERN = /<[^>]*>/;

export interface ConstructionInput {
  readonly stage: string;
  readonly title: string;
  readonly description?: string;
  readonly status: string;
  /** 0–100, or undefined when progress is not tracked for this stage. */
  readonly progressValue?: number;
  /** ISO date, or undefined when the date is not recorded. */
  readonly occurredAt?: string;
  readonly isPublished: boolean;
}

export interface ValidatedConstruction {
  readonly stage: ConstructionStage;
  readonly title: string;
  readonly description?: string;
  readonly status: ConstructionStatus;
  readonly progressValue?: number;
  readonly occurredAt?: string;
  readonly isPublished: boolean;
}

export function isConstructionStage(value: unknown): value is ConstructionStage {
  return (
    typeof value === "string" &&
    (CONSTRUCTION_STAGES as readonly string[]).includes(value)
  );
}

export function isConstructionStatus(
  value: unknown,
): value is ConstructionStatus {
  return (
    typeof value === "string" &&
    (CONSTRUCTION_STATUSES as readonly string[]).includes(value)
  );
}

export function validateConstructionUpdate(
  input: ConstructionInput,
): ValidationResult<ValidatedConstruction> {
  const errors = new ErrorBag();

  if (!isConstructionStage(input.stage)) {
    errors.add("stage", "Choose one of the documented build stages.");
  }

  if (isBlank(input.title)) {
    errors.add("title", "Add a title for this update.");
  } else if (input.title.trim().length > CONSTRUCTION_LIMITS.title) {
    errors.add(
      "title",
      `Keep the title to ${CONSTRUCTION_LIMITS.title} characters or fewer.`,
    );
  } else if (MARKUP_PATTERN.test(input.title)) {
    errors.add("title", "Remove the HTML tags — the title is shown as plain text.");
  }

  if (input.description !== undefined) {
    if (input.description.length > CONSTRUCTION_LIMITS.description) {
      errors.add(
        "description",
        `Keep the description to ${CONSTRUCTION_LIMITS.description} characters or fewer.`,
      );
    } else if (MARKUP_PATTERN.test(input.description)) {
      errors.add(
        "description",
        "Remove the HTML tags — the description is shown as plain text.",
      );
    }
  }

  if (!isConstructionStatus(input.status)) {
    errors.add("status", "Choose planned, in progress or complete.");
  }

  if (input.progressValue !== undefined) {
    if (!Number.isFinite(input.progressValue)) {
      errors.add("progressValue", "Progress must be a number.");
    } else if (!Number.isInteger(input.progressValue)) {
      errors.add("progressValue", "Progress must be a whole number.");
    } else if (input.progressValue < 0 || input.progressValue > 100) {
      errors.add("progressValue", "Progress must be between 0 and 100.");
    }
  }

  if (input.occurredAt !== undefined && input.occurredAt !== "") {
    const parsed = new Date(input.occurredAt);

    if (Number.isNaN(parsed.getTime())) {
      errors.add("occurredAt", "That is not a valid date.");
    } else {
      // A date years ahead is a typo — a build diary records what happened,
      // not what is scheduled. One year of tolerance covers a genuinely
      // forward-dated completion.
      const oneYearAhead = new Date();
      oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

      if (parsed > oneYearAhead) {
        errors.add("occurredAt", "That date is more than a year away. Check the year.");
      }

      if (parsed.getFullYear() < 2000) {
        errors.add("occurredAt", "That date looks too far in the past.");
      }
    }
  }

  if (!errors.isEmpty) {
    return invalid(errors.all);
  }

  const description = input.description?.trim();

  return valid({
    stage: input.stage as ConstructionStage,
    title: input.title.trim(),
    description: description === "" ? undefined : description,
    status: input.status as ConstructionStatus,
    progressValue: input.progressValue,
    occurredAt:
      input.occurredAt === undefined || input.occurredAt === ""
        ? undefined
        : new Date(input.occurredAt).toISOString(),
    isPublished: input.isPublished,
  });
}

/**
 * Progress implied by a status when none was entered.
 *
 * Saves the administrator typing 100 for every completed stage, without
 * overriding a figure they did supply.
 */
export function defaultProgressForStatus(status: ConstructionStatus): number {
  switch (status) {
    case "planned":
      return 0;
    case "in-progress":
      return 50;
    case "complete":
      return 100;
  }
}
