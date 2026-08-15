import type { ArchitecturalVariant } from "@/types";

/**
 * The house categories, as a design system.
 *
 * ## Why this exists
 *
 * `ArchitecturalVariant` has been in the type system since Phase 1, but nothing
 * ever described it. It was used for one thing: picking which abstract
 * background composition `ArchitecturalFrame` should draw when a property has no
 * photography. So the site knew a home was a townhouse and never said so.
 *
 * That left every small glyph in the application keyed to *status* instead. A
 * visitor scanning the map could tell which homes were finished and which were
 * still on site, but not which were single storey and which were townhouses,
 * which is usually the first thing somebody filters on.
 *
 * This module is the missing half. It gives each category a label, a plain
 * description, and the two structural facts a glyph needs to draw itself, so the
 * marker, the legend, the filter and the card can all read from one place.
 *
 * ## On the naming mismatch
 *
 * The union member is `double-storey` but every human-facing string in the
 * fixtures says "Two storey". The union member is stored in the database and
 * inferred from slugs by `row-mappers.ts`, so renaming it would be a data
 * migration for a cosmetic gain. The label carries the human wording instead,
 * and this comment is here so the discrepancy reads as a decision.
 */
export interface HouseTypeToken {
  readonly variant: ArchitecturalVariant;
  /** Human label. Sentence case, because it appears mid-sentence in lists. */
  readonly label: string;
  /** For a marker tooltip or a narrow filter pill, where the full label wraps. */
  readonly shortLabel: string;
  readonly description: string;
  /**
   * How many floors the glyph should draw. The single visual difference between
   * a single and a double storey silhouette is the floor line, so the glyph
   * reads this rather than branching on the variant name.
   */
  readonly storeys: 1 | 2;
  /**
   * Whether the glyph draws one freestanding mass or a row of attached units.
   * Only the townhouse is attached, but expressing it as a property means a
   * future duplex or terrace variant needs no new glyph branch.
   */
  readonly attached: boolean;
}

export const houseTypeTokens: Readonly<
  Record<ArchitecturalVariant, HouseTypeToken>
> = {
  "single-storey": {
    variant: "single-storey",
    label: "Single storey",
    shortLabel: "Single",
    description: "One level, on its own block.",
    storeys: 1,
    attached: false,
  },
  "double-storey": {
    variant: "double-storey",
    label: "Two storey",
    shortLabel: "Two storey",
    description: "Two levels, on its own block.",
    storeys: 2,
    attached: false,
  },
  townhouse: {
    variant: "townhouse",
    label: "Townhouse",
    shortLabel: "Townhouse",
    description: "Attached, in a row of dwellings.",
    storeys: 2,
    attached: true,
  },
};

/**
 * Display order: freestanding before attached, fewest floors first. Used by the
 * legend and the filter so both list the categories the same way.
 */
export const houseTypeOrder: readonly ArchitecturalVariant[] = [
  "single-storey",
  "double-storey",
  "townhouse",
] as const;

/** Human label for a variant. Safe for any variant the type system allows. */
export function houseTypeLabel(variant: ArchitecturalVariant): string {
  return houseTypeTokens[variant].label;
}
