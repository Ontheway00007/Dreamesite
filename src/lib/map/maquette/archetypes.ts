import type { Footprint, RidgeAxis } from "@/lib/map/maquette/geometry";
import type { ArchitecturalVariant } from "@/types";

/**
 * The massing of each miniature, in plan units.
 *
 * ## Why archetypes rather than per-property models
 *
 * A marker exists to say how far a house has been built and roughly what kind of
 * house it is. It is 48 pixels wide; a faithful façade would be invisible at that
 * size, and the data model has no geometry to build one from anyway — the only
 * building-shape field a property carries is `placeholderVariant`.
 *
 * So there are three shapes, chosen to be distinguishable in silhouette at map
 * scale: one long and low, one tall and compact with a wing, one narrow and
 * vertical against a party wall. If per-property geometry is ever captured, a
 * fourth spec is added here and nothing else changes.
 *
 * ## Units
 *
 * The lot is 10 × 8. `z` is the same unit, so a 2.6 wall is a plausible storey
 * against a 5-unit-deep house. Nothing is scaled here; the projection decides how
 * many pixels a unit becomes.
 */

export const LOT: Footprint = { x0: 0, x1: 10, y0: 0, y1: 8 };

/** One built volume within an archetype. */
export interface Volume {
  readonly footprint: Footprint;
  /** Wall height above the slab. */
  readonly wallHeight: number;
  /** Roof form and how far it rises above the walls. */
  readonly roof:
    | { readonly kind: "gable"; readonly ridge: RidgeAxis; readonly rise: number; readonly overhang: number }
    | { readonly kind: "hip"; readonly rise: number; readonly overhang: number }
    | { readonly kind: "parapet"; readonly rise: number };
  /** Studs at this spacing while the volume is a frame. */
  readonly studSpacing: number;
  /** Floor-to-floor height, which is what sizes the openings. */
  readonly storeyHeight: number;
  /** Openings are only cut into the volume a visitor reads as the house. */
  readonly openings: boolean;
  /** An intermediate floor line, drawn once the volume is clad. */
  readonly floorLine?: number;
}

export interface ArchetypeSpec {
  readonly id: ArchitecturalVariant;
  /** The slab, which is usually slightly larger than the walls that sit on it. */
  readonly slab: Footprint;
  readonly slabHeight: number;
  /** Painted in ascending depth order by the renderer. */
  readonly volumes: readonly Volume[];
  /**
   * A neighbouring form, drawn muted. Only the townhouse has one, where the
   * party wall is the defining fact about the building.
   */
  readonly neighbour?: {
    readonly footprint: Footprint;
    readonly wallHeight: number;
  };
  /** A small terracotta plane at the entry, drawn only in the finished states. */
  readonly entry?: Footprint;
}

const SINGLE_STOREY: ArchetypeSpec = {
  id: "single-storey",
  slab: { x0: 1.1, x1: 8.9, y0: 1.1, y1: 6.9 },
  slabHeight: 0.32,
  volumes: [
    // Garage wing: lower, set back, and drawn first because it sits further away.
    {
      footprint: { x0: 1.5, x1: 4.0, y0: 1.5, y1: 4.4 },
      wallHeight: 2.1,
      roof: { kind: "gable", ridge: "x", rise: 0.75, overhang: 0.22 },
      studSpacing: 0.62,
      storeyHeight: 2.1,
      openings: false,
    },
    // The house: long, low, ridge running along the lot's length.
    {
      footprint: { x0: 1.5, x1: 8.5, y0: 4.4, y1: 6.5 },
      wallHeight: 2.55,
      roof: { kind: "gable", ridge: "x", rise: 1.15, overhang: 0.3 },
      studSpacing: 0.58,
      storeyHeight: 2.55,
      openings: true,
    },
  ],
  entry: { x0: 7.0, x1: 8.5, y0: 6.5, y1: 7.1 },
};

const DOUBLE_STOREY: ArchetypeSpec = {
  id: "double-storey",
  slab: { x0: 1.4, x1: 8.6, y0: 1.2, y1: 6.8 },
  slabHeight: 0.34,
  volumes: [
    // Single-storey garage, so the two-storey mass beside it reads as taller.
    {
      footprint: { x0: 1.8, x1: 4.2, y0: 1.6, y1: 4.2 },
      wallHeight: 2.25,
      roof: { kind: "parapet", rise: 0.28 },
      studSpacing: 0.6,
      storeyHeight: 2.25,
      openings: false,
    },
    // The two-storey mass, with a floor line so the storey count is visible.
    {
      footprint: { x0: 4.2, x1: 8.2, y0: 2.0, y1: 6.4 },
      wallHeight: 5.1,
      roof: { kind: "hip", rise: 1.05, overhang: 0.28 },
      studSpacing: 0.56,
      storeyHeight: 2.55,
      openings: true,
      floorLine: 2.6,
    },
  ],
  entry: { x0: 8.2, x1: 8.9, y0: 4.6, y1: 6.0 },
};

const TOWNHOUSE: ArchetypeSpec = {
  id: "townhouse",
  slab: { x0: 2.2, x1: 7.6, y0: 0.9, y1: 7.1 },
  slabHeight: 0.3,
  volumes: [
    {
      footprint: { x0: 2.6, x1: 6.0, y0: 1.3, y1: 6.7 },
      wallHeight: 5.5,
      roof: { kind: "parapet", rise: 0.42 },
      studSpacing: 0.54,
      storeyHeight: 2.75,
      openings: true,
      floorLine: 2.75,
    },
  ],
  // The attached dwelling next door. Muted, and deliberately not detailed: it is
  // context, and detailing it would make the marker read as two properties.
  neighbour: {
    footprint: { x0: 6.0, x1: 7.4, y0: 1.3, y1: 6.7 },
    wallHeight: 5.5,
  },
  entry: { x0: 6.0, x1: 6.6, y0: 5.2, y1: 6.7 },
};

export const ARCHETYPES: Readonly<Record<ArchitecturalVariant, ArchetypeSpec>> =
  {
    "single-storey": SINGLE_STOREY,
    "double-storey": DOUBLE_STOREY,
    townhouse: TOWNHOUSE,
  };

/** Display order, and the atlas row order. */
export const ARCHETYPE_ORDER: readonly ArchitecturalVariant[] = [
  "single-storey",
  "double-storey",
  "townhouse",
] as const;
