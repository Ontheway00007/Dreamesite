import { processStages } from "@/content/process";
import {
  CONSTRUCTION_STAGES,
  STAGE_LABELS,
  STAGE_ORDER,
  defaultProgressForStatus,
} from "@/lib/admin/validation/construction";
import type {
  Property,
  PropertyConstructionUpdate,
  PropertyStatus,
} from "@/types";

/**
 * Build progress for a single home.
 *
 * Two sources, in order of preference:
 *
 * 1. Updates recorded against the home itself. A real record of what happened,
 *    written per property, with dates.
 * 2. The company's documented build stages, with each stage's state derived
 *    from `currentStageId`. One definition of the process — the same one the
 *    homepage explains — so a home cannot claim a stage that does not exist.
 *
 * The derived form is the floor, not a placeholder: a home with no diary still
 * shows an accurate, if coarser, position in the build. Nothing here is
 * hardcoded to a stage count; both paths read their length from their source.
 */

export type MilestoneState = "complete" | "in-progress" | "upcoming";

export interface ConstructionMilestone {
  readonly id: string;
  readonly step: string;
  readonly title: string;
  readonly body: string;
  readonly state: MilestoneState;
  /** The build stage this describes, when it came from a recorded update. */
  readonly stageLabel?: string;
  /** ISO timestamp of when the work happened, when recorded. */
  readonly occurredAt?: string;
}

export interface ConstructionProgress {
  readonly milestones: readonly ConstructionMilestone[];
  /** 0–100, for the progress rail. */
  readonly percentComplete: number;
  /** The stage under way, when the home is still being built. */
  readonly currentStage: ConstructionMilestone | null;
}

export interface ConstructionTimeline extends ConstructionProgress {
  /**
   * Which source produced this. The page discloses it, so a visitor can tell a
   * recorded diary from the standard process.
   */
  readonly source: "recorded" | "process";
}

/**
 * Statuses whose build work has finished.
 *
 * Exported because it is the one definition of "this home is built", and the map
 * markers need the same answer the timeline gives. Two sets that disagree would
 * show a finished house on the map beside a timeline that says otherwise.
 */
export const FINISHED_STATUSES: ReadonlySet<PropertyStatus> = new Set<PropertyStatus>([
  "move-in-ready",
  "completed",
  "sold",
]);

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


/** A recorded update's status, as a milestone state. */
function milestoneStateFor(
  status: PropertyConstructionUpdate["status"],
): MilestoneState {
  switch (status) {
    case "complete":
      return "complete";
    case "in-progress":
      return "in-progress";
    case "planned":
      return "upcoming";
  }
}

/**
 * Progress across the recorded diary.
 *
 * The denominator is the full stage vocabulary, not the number of updates
 * recorded. Averaging over recorded updates only would report a home with one
 * completed planning entry as 100% built. Counting unrecorded stages as zero
 * understates rather than overstates, which is the safe direction for a claim
 * a buyer may rely on.
 *
 * A home whose status says the build is finished reads 100% regardless, because
 * the status is the business's own statement about the home and outranks an
 * incomplete diary.
 */
function recordedPercentComplete(
  updates: readonly PropertyConstructionUpdate[],
  isFinished: boolean,
): number {
  if (isFinished) {
    return 100;
  }

  const total = updates.reduce((sum, update) => {
    const value = update.progressValue ?? defaultProgressForStatus(update.status);
    return sum + Math.min(100, Math.max(0, value));
  }, 0);

  return Math.round(total / CONSTRUCTION_STAGES.length);
}

/**
 * The timeline to show for a home: its recorded diary if it has one, otherwise
 * the derived process view.
 *
 * Recorded updates arrive already filtered to published rows and ordered by the
 * administrator's chosen `sort_order`. They are re-sorted here into build order
 * so the public timeline always reads forwards — a diary written out of sequence
 * should not present the frame before the slab.
 */
export function resolveConstructionTimeline(
  property: Pick<Property, "status" | "currentStageId" | "constructionUpdates">,
): ConstructionTimeline {
  const updates = property.constructionUpdates ?? [];

  if (updates.length === 0) {
    return { source: "process", ...resolveConstructionProgress(property) };
  }

  const isFinished = FINISHED_STATUSES.has(property.status);

  const milestones: ConstructionMilestone[] = [...updates]
    .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage])
    .map((update) => ({
      id: update.id,
      // Position within the whole build, not within the recorded subset, so a
      // skipped stage is visible as a gap in the numbering.
      step: String(STAGE_ORDER[update.stage] + 1).padStart(2, "0"),
      title: update.title,
      body: update.description ?? "",
      state: isFinished ? "complete" : milestoneStateFor(update.status),
      stageLabel: STAGE_LABELS[update.stage],
      occurredAt: update.occurredAt,
    }));

  return {
    source: "recorded",
    milestones,
    percentComplete: recordedPercentComplete(updates, isFinished),
    currentStage:
      milestones.find((milestone) => milestone.state === "in-progress") ?? null,
  };
}
