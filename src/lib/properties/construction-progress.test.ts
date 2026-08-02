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
