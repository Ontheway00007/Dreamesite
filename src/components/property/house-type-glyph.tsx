import { houseTypeTokens } from "@/lib/design/house-type";
import { cn } from "@/lib/utils/cn";
import type { ArchitecturalVariant } from "@/types";

/**
 * The house-category glyph.
 *
 * ## Why line art rather than a filled pictogram
 *
 * These sit at 16px in a filter pill, 18px on a card, and 20px inside a map
 * marker. At that size a filled house silhouette collapses into a blob: the only
 * thing that survives is the outline, so the outline is all that is drawn. Every
 * shape here is a stroke with `vector-effect="non-scaling-stroke"`, which keeps
 * the line weight constant whether the glyph is rendered at 16px in a list or
 * stretched inside the corridor map's non-uniform viewBox.
 *
 * It also matches the brand. The site already draws architecture as line work in
 * `ArchitecturalFrame` and the construction-journey material studies, so a
 * hairline house belongs and a solid one would not.
 *
 * ## What actually distinguishes the three
 *
 * One signal each, chosen so they are still separable at 16px and in
 * peripheral vision on a map:
 *
 * - **Single storey**: one wide mass, one roof, no floor line.
 * - **Two storey**: a taller mass with a floor line across it. The floor line is
 *   the whole tell, which is why it runs the full width rather than stopping at
 *   the walls.
 * - **Townhouse**: three gables in a row. A zigzag roofline reads as "several
 *   attached dwellings" instantly, where three separate outlines would read as
 *   "three houses" and a single wide box would read as an apartment block.
 *
 * The glyphs deliberately do not encode status. Status has its own glyph
 * (`StatusGlyph`) and its own colour, and a marker shows both: the house shape
 * says what kind of home it is, the ring around it says what stage it is at.
 * Collapsing the two into one symbol would mean twelve icons instead of seven.
 */
export interface HouseTypeGlyphProps {
  variant: ArchitecturalVariant;
  className?: string;
  /**
   * Adds a faint wash inside the walls. Used on the corridor map, where the
   * glyph sits over a photograph-free background and needs a little mass to
   * separate it from the blueprint grid behind it.
   */
  shaded?: boolean;
  /**
   * Renders a `<title>` so the glyph is announced. Off by default: in almost
   * every placement the category is already written next to the glyph, and a
   * second announcement is noise. Turn it on when the glyph stands alone.
   */
  labelled?: boolean;
}

export function HouseTypeGlyph({
  variant,
  className,
  shaded = false,
  labelled = false,
}: HouseTypeGlyphProps) {
  const token = houseTypeTokens[variant];

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
      role={labelled ? "img" : "presentation"}
      aria-hidden={labelled ? undefined : "true"}
      aria-label={labelled ? token.label : undefined}
    >
      {labelled ? <title>{token.label}</title> : null}

      {token.attached ? (
        <AttachedRow shaded={shaded} />
      ) : (
        <FreestandingHouse storeys={token.storeys} shaded={shaded} />
      )}
    </svg>
  );
}

/**
 * One mass on its own block.
 *
 * A two storey home is drawn taller than a single storey one rather than the
 * same height with a line through it, because the height difference is what
 * carries at a glance and the floor line is what confirms it. The roof pitch is
 * shallower on the taller one so the two do not read as the same house scaled.
 */
function FreestandingHouse({
  storeys,
  shaded,
}: {
  storeys: 1 | 2;
  shaded: boolean;
}) {
  const isTall = storeys === 2;

  // Eaves height. The taller house starts its walls higher up the viewBox.
  const eaves = isTall ? 9.4 : 11.2;
  const ridge = isTall ? 3.4 : 4.6;
  const base = 20.4;

  return (
    <>
      {shaded ? (
        <path
          d={`M4.4 ${eaves}H19.6V${base}H4.4Z`}
          fill="currentColor"
          opacity="0.14"
          stroke="none"
        />
      ) : null}

      {/* Roof. Drawn wider than the walls so it reads as an overhang. */}
      <path
        d={`M2.1 ${eaves + 0.9} 12 ${ridge}l9.9 ${eaves + 0.9 - ridge}`}
        vectorEffect="non-scaling-stroke"
      />

      {/* Walls. */}
      <path
        d={`M4.4 ${eaves}V${base}H19.6V${eaves}`}
        vectorEffect="non-scaling-stroke"
      />

      {/* The floor line: the single thing that says "two storey". */}
      {isTall ? (
        <path
          d={`M4.4 ${(eaves + base) / 2}H19.6`}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {/* Door, so the mass reads as a dwelling and not a shed. */}
      <path
        d={`M10.3 ${base}v-${isTall ? 4 : 4.6}h3.4v${isTall ? 4 : 4.6}`}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

/**
 * A row of attached dwellings.
 *
 * Three gables, one continuous base, and two party walls that stop short of the
 * roofline. The party walls are what make it attached rather than three separate
 * houses standing next to each other.
 */
function AttachedRow({ shaded }: { shaded: boolean }) {
  const eaves = 11.6;
  const ridge = 7.4;
  const base = 20.4;

  // Body spans x 3 to 21, divided into three equal 6-unit bays.
  const unitCentres = [6, 12, 18];
  const partyWalls = [9, 15];

  return (
    <>
      {shaded ? (
        <path
          d={`M3 ${eaves}H21V${base}H3Z`}
          fill="currentColor"
          opacity="0.14"
          stroke="none"
        />
      ) : null}

      {/*
        Three gables as one continuous zigzag, so the joins stay crisp instead of
        showing three separate stroke caps. Peaks sit over the unit centres and
        valleys over the party walls, which is what ties the roof to the plan
        below it.
      */}
      <path
        d={`M3 ${eaves} 6 ${ridge} 9 ${eaves} 12 ${ridge} 15 ${eaves} 18 ${ridge} 21 ${eaves}`}
        vectorEffect="non-scaling-stroke"
      />

      {/* One shared base, drawn as a single mass. */}
      <path
        d={`M3 ${eaves}V${base}H21V${eaves}`}
        vectorEffect="non-scaling-stroke"
      />

      {/*
        Party walls, stopping short of the roofline. Running them to the ridge
        would cut the roof into three and lose the attached read entirely.
      */}
      {partyWalls.map((x) => (
        <path
          key={x}
          d={`M${x} ${base}V${eaves + 1.6}`}
          vectorEffect="non-scaling-stroke"
          opacity="0.7"
        />
      ))}

      {/* One door per bay, all at the same height, to carry the repetition. */}
      {unitCentres.map((centre) => (
        <path
          key={centre}
          d={`M${centre - 1} ${base}v-3h2v3`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}
