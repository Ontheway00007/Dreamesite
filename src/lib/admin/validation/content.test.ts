import { describe, expect, it } from "vitest";

import {
  CONSTRUCTION_STAGES,
  STAGE_ORDER,
  defaultProgressForStatus,
  isConstructionStage,
  validateConstructionUpdate,
} from "@/lib/admin/validation/construction";
import {
  FEATURE_CATEGORIES,
  FEATURE_CATEGORY_META,
  duplicatesCoreSpecification,
  isFeatureCategory,
  validateFeature,
} from "@/lib/admin/validation/features";

/**
 * Construction updates and features share a shape — a fixed vocabulary, a
 * label, an optional body, a publish flag — so they are tested together.
 */

const update = {
  stage: "slab",
  title: "Slab poured and cured",
  status: "complete",
  isPublished: true,
};

function submitUpdate(overrides: Record<string, unknown> = {}) {
  return validateConstructionUpdate({ ...update, ...overrides });
}

function fieldsOf(result: { ok: boolean; errors?: readonly { field: string }[] }) {
  return result.ok ? [] : (result.errors ?? []).map((error) => error.field);
}

describe("construction stage vocabulary", () => {
  it("orders every stage exactly once", () => {
    const positions = CONSTRUCTION_STAGES.map((stage) => STAGE_ORDER[stage]);

    expect(new Set(positions).size).toBe(CONSTRUCTION_STAGES.length);
    expect([...positions].sort((a, b) => a - b)).toEqual(
      CONSTRUCTION_STAGES.map((_, index) => index),
    );
  });

  it("rejects a stage outside the vocabulary", () => {
    expect(isConstructionStage("framing")).toBe(false);
    expect(isConstructionStage("frame")).toBe(true);
  });
});

describe("validateConstructionUpdate", () => {
  it("accepts an ordinary update", () => {
    expect(submitUpdate().ok).toBe(true);
  });

  it("rejects an unknown stage or status", () => {
    expect(fieldsOf(submitUpdate({ stage: "framing" }))).toContain("stage");
    expect(fieldsOf(submitUpdate({ status: "finished" }))).toContain("status");
  });

  it("requires a title and rejects markup in it", () => {
    expect(fieldsOf(submitUpdate({ title: " " }))).toContain("title");
    expect(fieldsOf(submitUpdate({ title: "<b>Slab</b>" }))).toContain("title");
  });

  it("bounds progress to a whole number between 0 and 100", () => {
    expect(fieldsOf(submitUpdate({ progressValue: 101 }))).toContain(
      "progressValue",
    );
    expect(fieldsOf(submitUpdate({ progressValue: -1 }))).toContain(
      "progressValue",
    );
    expect(fieldsOf(submitUpdate({ progressValue: 42.5 }))).toContain(
      "progressValue",
    );
    expect(submitUpdate({ progressValue: 0 }).ok).toBe(true);
  });

  it("rejects a date far in the future as a typed year", () => {
    const farAhead = new Date();
    farAhead.setFullYear(farAhead.getFullYear() + 5);

    expect(
      fieldsOf(submitUpdate({ occurredAt: farAhead.toISOString().slice(0, 10) })),
    ).toContain("occurredAt");
  });

  it("rejects a date before the business could have existed", () => {
    expect(fieldsOf(submitUpdate({ occurredAt: "1998-04-01" }))).toContain(
      "occurredAt",
    );
  });

  it("normalises a date to an ISO timestamp", () => {
    const result = submitUpdate({ occurredAt: "2025-03-14" });

    expect(result.ok && result.value.occurredAt).toMatch(/^2025-03-14T/);
  });

  it("treats a blank description as absent", () => {
    const result = submitUpdate({ description: "   " });

    expect(result.ok && result.value.description).toBeUndefined();
  });
});

describe("defaultProgressForStatus", () => {
  it("gives a figure for each status without overriding a supplied one", () => {
    expect(defaultProgressForStatus("planned")).toBe(0);
    expect(defaultProgressForStatus("in-progress")).toBe(50);
    expect(defaultProgressForStatus("complete")).toBe(100);

    const result = submitUpdate({ status: "complete", progressValue: 90 });
    expect(result.ok && result.value.progressValue).toBe(90);
  });
});

describe("feature categories", () => {
  it("gives every category a public heading, in a stable order", () => {
    expect(FEATURE_CATEGORY_META.map((meta) => meta.category)).toEqual([
      ...FEATURE_CATEGORIES,
    ]);

    for (const meta of FEATURE_CATEGORY_META) {
      expect(meta.heading.length).toBeGreaterThan(0);
    }
  });

  it("rejects a category outside the vocabulary", () => {
    expect(isFeatureCategory("kitchen")).toBe(false);
    expect(isFeatureCategory("inclusion")).toBe(true);
  });
});

describe("validateFeature", () => {
  const feature = {
    category: "energy",
    label: "Energy rating",
    value: "7 stars",
    isPublished: true,
  };

  it("accepts a label with a value", () => {
    expect(validateFeature(feature).ok).toBe(true);
  });

  it("accepts a label on its own", () => {
    const result = validateFeature({ ...feature, value: "" });

    expect(result.ok).toBe(true);
    // A statement needing no second half stores null, not "".
    expect(result.ok && result.value.value).toBeUndefined();
  });

  it("requires a label", () => {
    expect(fieldsOf(validateFeature({ ...feature, label: "  " }))).toContain(
      "label",
    );
  });

  it("rejects markup in either half", () => {
    expect(
      fieldsOf(validateFeature({ ...feature, label: "<i>Rating</i>" })),
    ).toContain("label");
    expect(
      fieldsOf(validateFeature({ ...feature, value: "<b>7</b> stars" })),
    ).toContain("value");
  });

  it("rejects an unknown group", () => {
    expect(
      fieldsOf(validateFeature({ ...feature, category: "kitchen" })),
    ).toContain("category");
  });
});

describe("duplicatesCoreSpecification", () => {
  it("recognises labels the specifications table already shows", () => {
    expect(duplicatesCoreSpecification("Bedrooms")).toBe(true);
    expect(duplicatesCoreSpecification("  land size ")).toBe(true);
  });

  it("does not flag a label that adds detail", () => {
    expect(duplicatesCoreSpecification("Bedrooms with built-in robes")).toBe(
      false,
    );
    expect(duplicatesCoreSpecification("Energy rating")).toBe(false);
  });
});
