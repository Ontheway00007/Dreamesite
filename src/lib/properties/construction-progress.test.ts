import { describe, expect, it } from "vitest";

import { processStages } from "@/content/process";
import { resolveConstructionProgress } from "@/lib/properties/construction-progress";
import type { PropertyStatus } from "@/types";

function progress(status: PropertyStatus, currentStageId?: string) {
  return resolveConstructionProgress({ status, currentStageId });
}

describe("resolveConstructionProgress", () => {
  it("uses the published build stages, in order", () => {
    const { milestones } = progress("under-construction", "construction");

    expect(milestones.map((milestone) => milestone.id)).toEqual(
      processStages.map((stage) => stage.id),
    );
  });

  it("marks every stage complete for a finished home", () => {
    for (const status of ["move-in-ready", "completed", "sold"] as const) {
      const { milestones, percentComplete, currentStage } = progress(status);

      expect(
        milestones.every((milestone) => milestone.state === "complete"),
      ).toBe(true);
      expect(percentComplete).toBe(100);
      expect(currentStage).toBeNull();
    }
  });

  it("splits the stages around the one under way", () => {
    const { milestones, currentStage } = progress(
      "under-construction",
      "construction",
    );

    expect(milestones.map((milestone) => milestone.state)).toEqual([
      "complete",
      "complete",
      "in-progress",
      "upcoming",
    ]);
    expect(currentStage?.id).toBe("construction");
  });

  it("reports partial progress for a home still being built", () => {
    expect(progress("under-construction", "documentation").percentComplete).toBe(
      38,
    );
    expect(progress("under-construction", "handover").percentComplete).toBe(88);
  });

  it("falls back to the construction stage when none is recorded", () => {
    expect(progress("under-construction").currentStage?.id).toBe(
      "construction",
    );
  });

  it("falls back for a stage id that does not exist", () => {
    expect(progress("under-construction", "landscaping").currentStage?.id).toBe(
      "construction",
    );
  });
});


/* -------------------------------------------------------------------------- */
/* Recorded diary                                                             */
/* -------------------------------------------------------------------------- */

import { CONSTRUCTION_STAGES } from "@/lib/admin/validation/construction";
import { resolveConstructionTimeline } from "@/lib/properties/construction-progress";
import type { PropertyConstructionUpdate } from "@/types";

function recorded(
  updates: readonly Partial<PropertyConstructionUpdate>[],
  status: PropertyStatus = "under-construction",
) {
  return resolveConstructionTimeline({
    status,
    currentStageId: undefined,
    constructionUpdates: updates.map((update, index) => ({
      id: `update-${index}`,
      stage: "planning",
      title: "Untitled",
      status: "complete",
      ...update,
    })) as readonly PropertyConstructionUpdate[],
  });
}

describe("resolveConstructionTimeline", () => {
  it("falls back to the documented process when nothing is recorded", () => {
    const timeline = resolveConstructionTimeline({
      status: "under-construction",
      currentStageId: "construction",
      constructionUpdates: [],
    });

    expect(timeline.source).toBe("process");
    expect(timeline.milestones.map((milestone) => milestone.id)).toEqual(
      processStages.map((stage) => stage.id),
    );
  });

  it("uses the recorded diary when there is one", () => {
    const timeline = recorded([
      { stage: "slab", title: "Slab poured" },
      { stage: "planning", title: "Plans approved" },
    ]);

    expect(timeline.source).toBe("recorded");
    // Re-sorted into build order, whatever order they were stored in.
    expect(timeline.milestones.map((milestone) => milestone.title)).toEqual([
      "Plans approved",
      "Slab poured",
    ]);
  });

  it("numbers each entry by its position in the whole build, so gaps show", () => {
    const timeline = recorded([
      { stage: "planning" },
      { stage: "frame" },
    ]);

    // Planning is first, frame is fourth — the jump is the missing stages.
    expect(timeline.milestones.map((milestone) => milestone.step)).toEqual([
      "01",
      "04",
    ]);
  });

  it("does not overstate progress from a single recorded stage", () => {
    // One completed stage out of the whole vocabulary, not "100% built".
    const timeline = recorded([{ stage: "planning", status: "complete" }]);

    expect(timeline.percentComplete).toBe(
      Math.round(100 / CONSTRUCTION_STAGES.length),
    );
  });

  it("reaches 100% when every stage is recorded complete", () => {
    const timeline = recorded(
      CONSTRUCTION_STAGES.map((stage) => ({ stage, status: "complete" as const })),
    );

    expect(timeline.percentComplete).toBe(100);
  });

  it("uses a supplied progress figure over the status default", () => {
    const timeline = recorded([
      { stage: "frame", status: "in-progress", progressValue: 80 },
    ]);

    expect(timeline.percentComplete).toBe(
      Math.round(80 / CONSTRUCTION_STAGES.length),
    );
  });

  it("reads 100% for a finished home regardless of the diary", () => {
    // The business's own statement about the home outranks an incomplete diary.
    for (const status of ["move-in-ready", "completed", "sold"] as const) {
      const timeline = recorded([{ stage: "planning", status: "planned" }], status);

      expect(timeline.percentComplete).toBe(100);
      expect(
        timeline.milestones.every((milestone) => milestone.state === "complete"),
      ).toBe(true);
      expect(timeline.currentStage).toBeNull();
    }
  });

  it("maps each recorded status to a milestone state", () => {
    const timeline = recorded([
      { stage: "planning", status: "complete" },
      { stage: "frame", status: "in-progress" },
      { stage: "fixing", status: "planned" },
    ]);

    expect(timeline.milestones.map((milestone) => milestone.state)).toEqual([
      "complete",
      "in-progress",
      "upcoming",
    ]);
    expect(timeline.currentStage?.stageLabel).toBe("Frame");
  });

  it("carries the stage label and date through for display", () => {
    const timeline = recorded([
      { stage: "slab", occurredAt: "2025-03-14T00:00:00.000Z" },
    ]);

    expect(timeline.milestones[0].stageLabel).toBe("Slab");
    expect(timeline.milestones[0].occurredAt).toBe("2025-03-14T00:00:00.000Z");
  });
});
