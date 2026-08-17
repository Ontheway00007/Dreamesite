import {
  STAGE_ORDER,
  type ConstructionStage,
} from "@/lib/admin/validation/construction";
import { FINISHED_STATUSES } from "@/lib/properties/construction-progress";
import type {
  ArchitecturalVariant,
  Property,
  PropertyConstructionUpdate,
  PropertyStatus,
} from "@/types";

/**
 * How far a home has physically been built, as one value.
 *
 * ## Why this module exists
 *
 * Three vocabularies already describe build position, at three different
 * resolutions:
 *
 * - `PropertyStatus` (4 values) — the commercial lifecycle. Says whether the
 *   build has finished, not where it got to.
 * - `CONSTRUCTION_STAGES` (8 values) — the real trade sequence, recorded per
 *   home in the build diary. The most precise thing the data model holds.
 * - `processStages` (4 values) — the company's documented process, referenced by
 *   `currentStageId`. Coarse: "construction" covers slab through lock-up.
 *
 * Anything that wants to *draw* build progress needs one answer, from one place.
 * This is that place. The animated map markers, and anything else that follows,
 * read `resolveBuildStage` and nothing else; they never look at `status`,
 * `currentStageId` or `constructionUpdates` themselves.
 *
 * ## The honesty rules
 *
 * Nothing here invents a stage or a percentage. Where the stored data is coarser
 * than the drawing, the result is deliberately **understated** and marked with
 * its `source`, so a caller can disclose that the position was derived rather
 * than recorded. Understating a build is a recoverable disappointment;
 * overstating one is a claim a buyer may act on.
 */

/**
 * The build states a miniature can be drawn in.
 *
 * Five, not eight, because these are the moments where a building visibly
 * changes shape. `fixing` and `final-inspection` are real trade stages but they
 * happen behind a finished envelope — a marker cannot show them without
 * inventing a difference that is not there.
 */
export type BuildStage = "site" | "slab" | "frame" | "lock-up" | "complete";

/** In build order. The index doubles as the marker's animation target. */
export const BUILD_STAGES: readonly BuildStage[] = [
  "site",
  "slab",
  "frame",
  "lock-up",
  "complete",
] as const;

export const BUILD_STAGE_LABELS: Readonly<Record<BuildStage, string>> = {
  site: "Site",
  slab: "Slab",
  frame: "Frame",
  "lock-up": "Lock-up",
  complete: "Complete",
};

/**
 * Where the answer came from, so the interface can say so.
 *
 * - `recorded` — from the home's own build diary. The strongest evidence.
 * - `status` — from the lifecycle status, which is the business's own statement
 *   that the build has finished.
 * - `process` — derived from the documented process. Coarse, and understated.
 */
export type BuildStageSource = "recorded" | "status" | "process";

export interface PropertyBuildState {
  readonly stage: BuildStage;
  /** Position in `BUILD_STAGES`. The marker animates from 0 up to this. */
  readonly stageIndex: number;
  readonly status: PropertyStatus;
  /** Which miniature to draw. */
  readonly archetype: ArchitecturalVariant;
  readonly source: BuildStageSource;
  /** Whether the build work is finished, per `FINISHED_STATUSES`. */
  readonly isFinished: boolean;
}

/**
 * The eight recorded trade stages, collapsed onto the five drawable ones.
 *
 * `fixing` maps back to `lock-up` rather than forward to `complete`: a home
 * being fitted out is weatherproof but not finished, and the lock-up shell is
 * the truthful silhouette for it.
 */
const RECORDED_STAGE_TO_BUILD_STAGE: Readonly<
  Record<ConstructionStage, BuildStage>
> = {
  planning: "site",
  "site-preparation": "site",
  slab: "slab",
  frame: "frame",
  "lock-up": "lock-up",
  fixing: "lock-up",
  "final-inspection": "complete",
  completion: "complete",
};

/**
 * The coarse documented process, collapsed onto drawable stages.
 *
 * `construction` is the honest problem: it spans site preparation to lock-up, so
 * any single answer is a guess. It resolves to `slab` — the earliest state a
 * home in construction is certainly past — because a marker that shows a slab
 * for a framed house understates, and a marker that shows a frame for a slab
 * claims a structure that is not standing.
 *
 * `handover` resolves to `lock-up` rather than `complete` for the same reason:
 * this path is only reached while the status still says the home is being built,
 * and a status that says "under construction" must not produce a finished house.
 */
const PROCESS_STAGE_TO_BUILD_STAGE: Readonly<Record<string, BuildStage>> = {
  design: "site",
  documentation: "site",
  construction: "slab",
  handover: "lock-up",
};

/** Used when `currentStageId` is absent or is not a stage we recognise. */
const PROCESS_FALLBACK_STAGE: BuildStage = "slab";

function buildStageIndex(stage: BuildStage): number {
  return BUILD_STAGES.indexOf(stage);
}

/** The furthest stage the diary says has been reached, started or finished. */
function furthestRecordedStage(
  updates: readonly PropertyConstructionUpdate[],
): ConstructionStage | null {
  let furthest: ConstructionStage | null = null;

  for (const update of updates) {
    // A `planned` entry describes work that has not happened. Drawing it would
    // be drawing the future.
    if (update.status === "planned") {
      continue;
    }

    if (furthest === null || STAGE_ORDER[update.stage] > STAGE_ORDER[furthest]) {
      furthest = update.stage;
    }
  }

  return furthest;
}

/** The subset of a property this needs. Keeps callers from passing the world. */
export type BuildStageInput = Pick<
  Property,
  "status" | "currentStageId" | "constructionUpdates" | "placeholderVariant"
>;

/**
 * The one mapping from stored property data to a drawable build state.
 *
 * Resolution order, strongest evidence first:
 *
 * 1. **A diary with work under way.** An `in-progress` entry means somebody is
 *    on site now, so the diary describes the present and wins outright — even
 *    over a finished-sounding status. This is the sold-off-the-plan case: a home
 *    can be `sold` and still be a frame, and the map must show the frame.
 * 2. **A finished status.** `move-in-ready`, `completed` and `sold` are the
 *    business's own statement that the build is done, and they outrank a diary
 *    that was simply never finished being written. This matches
 *    `resolveConstructionTimeline`, which reads 100% for the same reason.
 * 3. **A diary with completed work.** The furthest stage recorded as done.
 * 4. **A diary containing only planned work.** Nothing has happened: the site.
 * 5. **The documented process**, via `currentStageId`. Coarse and understated.
 */
export function resolveBuildStage(
  property: BuildStageInput,
): PropertyBuildState {
  const archetype = property.placeholderVariant;
  const status = property.status;
  const isFinished = FINISHED_STATUSES.has(status);
  const updates = property.constructionUpdates ?? [];

  const settle = (
    stage: BuildStage,
    source: BuildStageSource,
  ): PropertyBuildState => ({
    stage,
    stageIndex: buildStageIndex(stage),
    status,
    archetype,
    source,
    isFinished,
  });

  const furthest = furthestRecordedStage(updates);
  const isWorkUnderWay = updates.some(
    (update) => update.status === "in-progress",
  );

  if (furthest !== null && (isWorkUnderWay || !isFinished)) {
    return settle(RECORDED_STAGE_TO_BUILD_STAGE[furthest], "recorded");
  }

  if (isFinished) {
    return settle("complete", "status");
  }

  if (updates.length > 0) {
    return settle("site", "recorded");
  }

  const derived =
    property.currentStageId === undefined
      ? undefined
      : PROCESS_STAGE_TO_BUILD_STAGE[property.currentStageId];

  return settle(derived ?? PROCESS_FALLBACK_STAGE, "process");
}

/**
 * A short, honest caption for a build state.
 *
 * The provenance is part of the sentence rather than a footnote, because "Frame"
 * derived from a four-step process and "Frame" recorded on site by the builder
 * are different claims and should not read identically.
 */
export function buildStageCaption(state: PropertyBuildState): string {
  const label = BUILD_STAGE_LABELS[state.stage];

  switch (state.source) {
    case "recorded":
      return `${label} · recorded on site`;
    case "status":
      return `${label} · build finished`;
    case "process":
      return `${label} or later · from documented process`;
  }
}
