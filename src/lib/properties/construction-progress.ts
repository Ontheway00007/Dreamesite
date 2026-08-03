import { processStages } from "@/content/process";
import type { Property } from "@/types";

/**
 * Build progress for a single home.
 *
 * Derived from the company's documented build stages and the property's
 * `currentStageId`, rather than stored stage by stage. That keeps one definition
 * of the process — the same one the homepage explains — and means a home cannot
 * claim a stage that does not exist.
 */

export type MilestoneState = "complete" | "in-progress" | "upcoming";

export interface ConstructionMilestone {
  readonly id: string;
  readonly step: string;
  readonly title: string;
  readonly body: string;
  readonly state: MilestoneState;
}

export interface ConstructionProgress {
  readonly milestones: readonly ConstructionMilestone[];
  /** 0–100, for the progress rail. */
  readonly percentComplete: number;
  /** The stage under way, when the home is still being built. */
  readonly currentStage: ConstructionMilestone | null;
}

/** Statuses whose build work has finished. */
const FINISHED_STATUSES = new Set(["move-in-ready", "completed", "sold"]);

function stateFor(index: number, currentIndex: number): MilestoneState {
  if (index < currentIndex) {
    return "complete";
  }

  return index === currentIndex ? "in-progress" : "upcoming";
}

export function resolveConstructionProgress(
  property: Pick<Property, "status" | "currentStageId">,
): ConstructionProgress {
  const isFinished = FINISHED_STATUSES.has(property.status);

  // A finished home has been through every stage. An unfinished one is at the
  // stage it records, falling back to construction when that stage is missing or
  // unrecognised — never overriding a stage that was recorded correctly.
  const recordedIndex = processStages.findIndex(
    (stage) => stage.id === property.currentStageId,
  );
  const fallbackIndex = processStages.findIndex(
    (stage) => stage.id === "construction",
  );
  const currentIndex = isFinished
    ? processStages.length
    : recordedIndex >= 0
      ? recordedIndex
      : fallbackIndex;

  const milestones = processStages.map((stage, index) => ({
    id: stage.id,
    step: stage.step,
    title: stage.title,
    body: stage.body,
    state: stateFor(index, currentIndex),
  }));

  const completed = milestones.filter(
    (milestone) => milestone.state === "complete",
  ).length;
  const inProgress = milestones.some(
    (milestone) => milestone.state === "in-progress",
  )
    ? 0.5
    : 0;

  return {
    milestones,
    percentComplete: Math.round(
      ((completed + inProgress) / processStages.length) * 100,
    ),
    currentStage:
      milestones.find((milestone) => milestone.state === "in-progress") ?? null,
  };
}
