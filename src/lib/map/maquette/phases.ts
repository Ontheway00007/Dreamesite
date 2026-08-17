import { BUILD_STAGES, type BuildStage } from "@/lib/properties/build-stage";

/**
 * What a miniature looks like at each frame of its construction, and how long
 * each frame lasts.
 *
 * ## Why phases rather than 36 hand-drawn frames
 *
 * Every frame of every archetype is the same drawing routine given a different
 * `BuildPhase`. So a frame is a set of numbers, not a picture: the studs are at
 * 45% of their height, the cladding has not started, the roof is not on. Tuning
 * the sequence means editing this table, and the change applies to all three
 * archetypes at once — which is the only way three archetypes stay a family
 * rather than three separate drawings.
 *
 * Each field is 0–1. Fields are independent because real construction overlaps:
 * cladding starts before the roof is finished, openings are cut before they are
 * glazed.
 */
export interface BuildPhase {
  /** The lot itself: a shallow plinth of ground. */
  readonly lot: number;
  /** Set-out lines on the ground, before anything is poured. */
  readonly setOut: number;
  /** The slab, rising to its full thickness. */
  readonly slab: number;
  /** Stud height, as a fraction of the wall. */
  readonly studs: number;
  /** The top plate, which closes the frame. */
  readonly plates: number;
  /** Open roof trusses. */
  readonly trusses: number;
  /** Wall cladding height, as a fraction of the wall. */
  readonly cladding: number;
  /** Roof sheeting, replacing the trusses. */
  readonly roof: number;
  /** Openings cut into the clad walls. */
  readonly openings: number;
  /** Glazing, entry accent and ground treatment. */
  readonly finish: number;
}

const NOTHING: BuildPhase = {
  lot: 0,
  setOut: 0,
  slab: 0,
  studs: 0,
  plates: 0,
  trusses: 0,
  cladding: 0,
  roof: 0,
  openings: 0,
  finish: 0,
};

function phase(overrides: Partial<BuildPhase>): BuildPhase {
  return { ...NOTHING, ...overrides };
}

/**
 * The frames belonging to each build stage, in order.
 *
 * A stage gets more frames when more visibly happens during it. `site` is one
 * frame because an empty lot has one appearance; `frame` gets three because
 * studs rising, the plate closing and the trusses going on are three distinctly
 * different silhouettes.
 */
const STAGE_PHASES: Readonly<Record<BuildStage, readonly BuildPhase[]>> = {
  /*
    An empty lot is an empty lot: a plinth of ground and nothing on it. Set-out
    lines belong to the slab stage, because setting out is the first thing that
    happens once work starts — putting them here would mean a property in
    planning appeared to have a plan pegged out on the ground.
  */
  site: [phase({ lot: 1 })],

  slab: [
    // Set out and formed up, then poured. Two clearly different pictures rather
    // than the same pad at two thicknesses.
    phase({ lot: 1, setOut: 1 }),
    phase({ lot: 1, setOut: 0.3, slab: 1 }),
  ],

  frame: [
    phase({ lot: 1, setOut: 0.3, slab: 1, studs: 0.45 }),
    phase({ lot: 1, setOut: 0.2, slab: 1, studs: 1, plates: 1 }),
    phase({ lot: 1, setOut: 0.2, slab: 1, studs: 1, plates: 1, trusses: 1 }),
  ],

  "lock-up": [
    // Cladding climbs the frame, then the roof goes on, then openings appear.
    phase({ lot: 1, slab: 1, studs: 1, plates: 1, trusses: 1, cladding: 0.5 }),
    phase({ lot: 1, slab: 1, studs: 1, plates: 1, trusses: 0.5, cladding: 1, roof: 0.6 }),
    phase({ lot: 1, slab: 1, cladding: 1, roof: 1, openings: 0.75 }),
  ],

  complete: [
    phase({ lot: 1, slab: 1, cladding: 1, roof: 1, openings: 1, finish: 0.35 }),
    phase({ lot: 1, slab: 1, cladding: 1, roof: 1, openings: 1, finish: 0.7 }),
    phase({ lot: 1, slab: 1, cladding: 1, roof: 1, openings: 1, finish: 1 }),
  ],
};

/**
 * How long the marker spends traversing each stage, in milliseconds.
 *
 * Slow and deliberate. The whole build of a finished house is about two and a
 * half seconds, and it then rests for longer than it moved — a marker that is
 * always animating stops reading as construction and starts reading as a loading
 * spinner.
 */
const STAGE_DURATIONS_MS: Readonly<Record<BuildStage, number>> = {
  site: 320,
  slab: 420,
  frame: 640,
  "lock-up": 560,
  complete: 660,
};

/**
 * The rest at the end of the cycle. Longer than the build, so the state a
 * visitor is most likely to see is the property's real one.
 */
export const HOLD_MS = 3400;

/** The dissolve back to an empty lot. Quick, and deliberately not a rewind. */
export const RESET_MS = 300;

/** One frame of the atlas: which archetype row, which column. */
export interface FrameDescriptor {
  readonly stage: BuildStage;
  readonly phase: BuildPhase;
}

/**
 * Every frame, in a single flat sequence.
 *
 * The atlas has one column per entry here, so a frame index is both a position in
 * the animation and a position in the sprite sheet. One number, not two.
 */
export const FRAMES: readonly FrameDescriptor[] = BUILD_STAGES.flatMap((stage) =>
  STAGE_PHASES[stage].map((phaseValue) => ({ stage, phase: phaseValue })),
);

export const FRAME_COUNT = FRAMES.length;

/** How long each frame is held while the marker is building. */
export const FRAME_DURATIONS_MS: readonly number[] = FRAMES.map(
  (frame) => STAGE_DURATIONS_MS[frame.stage] / STAGE_PHASES[frame.stage].length,
);

/**
 * The last frame belonging to each stage: where a marker stops.
 *
 * This is the mechanism that makes the animation honest. A property at `slab`
 * animates frames 0–2 and stops; it has no way to reach the frames that show a
 * frame or a roof, because the sequence it is given ends.
 */
export const FINAL_FRAME_FOR_STAGE: Readonly<Record<BuildStage, number>> =
  Object.fromEntries(
    BUILD_STAGES.map((stage) => [
      stage,
      FRAMES.reduce(
        (last, frame, index) => (frame.stage === stage ? index : last),
        0,
      ),
    ]),
  ) as Record<BuildStage, number>;

/** Total time to build up to, and including, the given stage. */
export function buildDurationMs(stage: BuildStage): number {
  const final = FINAL_FRAME_FOR_STAGE[stage];
  let total = 0;

  for (let index = 0; index <= final; index += 1) {
    total += FRAME_DURATIONS_MS[index];
  }

  return total;
}

/** Build, hold and reset: one full loop for a property at this stage. */
export function cycleDurationMs(stage: BuildStage): number {
  return buildDurationMs(stage) + HOLD_MS + RESET_MS;
}

export type LoopPhaseName = "building" | "holding" | "resetting";

export interface LoopPosition {
  readonly frame: number;
  readonly phase: LoopPhaseName;
  /** 0–1 through the reset dissolve. Zero unless `phase` is `resetting`. */
  readonly resetProgress: number;
}

/**
 * Where a marker is in its loop, given how far into the cycle it is.
 *
 * Pure arithmetic on a single elapsed number, so every marker on the map can be
 * resolved from one clock without any of them holding a timer.
 */
export function loopPositionAt(
  stage: BuildStage,
  elapsedMs: number,
): LoopPosition {
  const final = FINAL_FRAME_FOR_STAGE[stage];
  const cycle = cycleDurationMs(stage);
  const at = ((elapsedMs % cycle) + cycle) % cycle;

  let consumed = 0;

  for (let index = 0; index <= final; index += 1) {
    consumed += FRAME_DURATIONS_MS[index];

    if (at < consumed) {
      return { frame: index, phase: "building", resetProgress: 0 };
    }
  }

  if (at < consumed + HOLD_MS) {
    return { frame: final, phase: "holding", resetProgress: 0 };
  }

  return {
    frame: final,
    phase: "resetting",
    resetProgress: Math.min(1, (at - consumed - HOLD_MS) / RESET_MS),
  };
}

/**
 * A stable per-property offset into the cycle.
 *
 * Without this, every marker on the map builds in unison and the map reads as one
 * synchronised animation rather than as a number of separate building sites. The
 * offset is derived from the property id so it is the same on every load and on
 * every device — a random offset would make the map flicker differently on each
 * visit and would be impossible to screenshot consistently.
 */
export function loopOffsetMs(id: string, stage: BuildStage): number {
  let hash = 2166136261;

  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % Math.round(cycleDurationMs(stage));
}
