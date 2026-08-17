import {
  ARCHETYPE_ORDER,
  ARCHETYPES,
  LOT,
  type ArchetypeSpec,
  type Volume,
} from "@/lib/map/maquette/archetypes";
import { mix, parseColour, shade, tint, type Rgb } from "@/lib/map/maquette/colour";
import {
  drawBox,
  drawContactShadow,
  drawGableRoof,
  drawHipRoof,
  drawOpenings,
  drawStudFrame,
  drawTrusses,
  fillPolygon,
  footprintDepth,
  inset,
  project,
  strokeLine,
  type Projection,
} from "@/lib/map/maquette/geometry";
import { FRAMES, FRAME_COUNT, type BuildPhase } from "@/lib/map/maquette/phases";
import { readCssColor } from "@/lib/map/marker-images";
import type { ArchitecturalVariant } from "@/types";

/**
 * The sprite atlas: every archetype, at every frame of construction, rendered
 * once into a single image.
 *
 * ## Why an atlas and not live 3D
 *
 * The whole animation is 36 discrete pictures — three archetypes by twelve
 * frames. Drawing them once and then moving a `background-position` costs one
 * canvas render at map load and one style write per frame change afterwards.
 * Rendering them live would cost the same drawing work every frame, for every
 * marker, forever, and would be the reason the map got slow on a phone.
 *
 * ## Why it is generated in the browser rather than shipped as a file
 *
 * Two reasons, both about correctness rather than size.
 *
 * A shipped PNG would fix the colours at build time. These read from the same CSS
 * custom properties as the rest of the interface, so there is no second copy of
 * the palette to keep in sync, and the daylight theme gets a correctly lit model
 * without a second asset. This is the rule `marker-images.ts` already follows.
 *
 * It also ships nothing: no image request, no bytes in the bundle, no cache to
 * invalidate when a colour changes. The cost is one canvas render, measured in
 * single-digit milliseconds, memoised per theme for the life of the page.
 */

/** Logical size of one cell. Doubled for the device pixel ratio. */
const CELL = 72;
const PIXEL_RATIO = 2;

/**
 * Where the centre of the lot sits inside its cell.
 *
 * Below the middle, because a building occupies the space above its lot and
 * nothing occupies the space below it. The marker is anchored to this point so
 * the miniature stands on the coordinate rather than hovering over it.
 */
export const LOT_CENTRE_IN_CELL = { x: 0.5, y: 0.62 } as const;

export interface MaquetteAtlas {
  /** Object URL of the rendered sheet. Revoke it when the atlas is discarded. */
  readonly url: string;
  /** Logical cell size. The sheet itself is this times the pixel ratio. */
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  /** Bytes of the encoded sheet, for reporting. */
  readonly byteLength: number;
  /** How long drawing all the frames took, for reporting. */
  readonly renderMs: number;
  readonly rowForArchetype: Readonly<Record<ArchitecturalVariant, number>>;
  readonly dispose: () => void;
}

interface MaquettePalette {
  readonly body: Rgb;
  readonly roof: Rgb;
  readonly slab: Rgb;
  readonly timber: Rgb;
  readonly accent: Rgb;
  readonly glass: Rgb;
  readonly lot: Rgb;
  readonly lotEdge: Rgb;
}

function readMaquettePalette(): MaquettePalette {
  return {
    body: parseColour(readCssColor("--maquette-body", "#f1ebdd")),
    roof: parseColour(readCssColor("--maquette-roof", "#201f1b")),
    slab: parseColour(readCssColor("--maquette-slab", "#ded4c3")),
    timber: parseColour(readCssColor("--maquette-timber", "#b5a78f")),
    accent: parseColour(readCssColor("--maquette-accent", "#b85c32")),
    glass: parseColour(readCssColor("--maquette-glass", "#10161a")),
    lot: parseColour(readCssColor("--maquette-lot", "#33322f")),
    lotEdge: parseColour(readCssColor("--maquette-lot-edge", "#8c8478")),
  };
}

/* -------------------------------------------------------------------------- */
/* Drawing one frame                                                          */
/* -------------------------------------------------------------------------- */

/** The plinth of ground the miniature stands on. */
function drawLot(
  context: CanvasRenderingContext2D,
  view: Projection,
  palette: MaquettePalette,
  phase: BuildPhase,
): void {
  if (phase.lot <= 0) {
    return;
  }

  drawContactShadow(context, LOT, view, {
    strength: 0.55 * phase.lot,
    spread: 1.05,
  });

  drawBox(context, LOT, view, {
    z0: -0.26,
    z1: 0,
    colour: palette.lot,
    alpha: phase.lot,
  });

  // A hairline around the top of the plinth. This is what stops the lot reading
  // as a dark blob on a dark basemap at the empty stage.
  const corners = [
    project({ x: LOT.x0, y: LOT.y0, z: 0 }, view),
    project({ x: LOT.x1, y: LOT.y0, z: 0 }, view),
    project({ x: LOT.x1, y: LOT.y1, z: 0 }, view),
    project({ x: LOT.x0, y: LOT.y1, z: 0 }, view),
  ] as const;

  for (let index = 0; index < corners.length; index += 1) {
    strokeLine(
      context,
      corners[index],
      corners[(index + 1) % corners.length],
      palette.lotEdge,
      view.scale * 0.075,
      0.6 * phase.lot,
    );
  }
}

/** Set-out lines: the plan, marked on the ground before anything is built. */
function drawSetOut(
  context: CanvasRenderingContext2D,
  view: Projection,
  palette: MaquettePalette,
  spec: ArchetypeSpec,
  phase: BuildPhase,
): void {
  if (phase.setOut <= 0) {
    return;
  }

  const alpha = 0.85 * phase.setOut;
  const width = view.scale * 0.07;

  for (const footprint of [spec.slab, ...spec.volumes.map((v) => v.footprint)]) {
    const corners = [
      project({ x: footprint.x0, y: footprint.y0, z: 0.02 }, view),
      project({ x: footprint.x1, y: footprint.y0, z: 0.02 }, view),
      project({ x: footprint.x1, y: footprint.y1, z: 0.02 }, view),
      project({ x: footprint.x0, y: footprint.y1, z: 0.02 }, view),
    ] as const;

    for (let index = 0; index < corners.length; index += 1) {
      strokeLine(
        context,
        corners[index],
        corners[(index + 1) % corners.length],
        palette.accent,
        width,
        alpha,
      );
    }
  }
}

function drawSlab(
  context: CanvasRenderingContext2D,
  view: Projection,
  palette: MaquettePalette,
  spec: ArchetypeSpec,
  phase: BuildPhase,
): void {
  if (phase.slab <= 0) {
    return;
  }

  /*
    The pour grows upward to its finished thickness, so the slab arrives rather
    than appearing.

    Shaded down from the stone token: green concrete is darker than a rendered
    wall, and if the slab is the brightest thing in the frame the ivory building
    that later stands on it has nothing left to be brighter than.
  */
  drawBox(context, spec.slab, view, {
    z0: 0,
    z1: spec.slabHeight * phase.slab,
    colour: shade(palette.slab, 0.16),
    edge: true,
  });
}

/** One volume, at whatever point in its construction the phase describes. */
function drawVolume(
  context: CanvasRenderingContext2D,
  view: Projection,
  palette: MaquettePalette,
  spec: ArchetypeSpec,
  volume: Volume,
  phase: BuildPhase,
): void {
  const baseZ = spec.slabHeight;
  const { wallHeight, roof } = volume;

  // --- Frame -------------------------------------------------------------
  // Kept underneath the cladding rather than removed, so the transition to
  // lock-up is cladding covering a frame, not one object replacing another.
  if (phase.studs > 0 && phase.cladding < 1) {
    drawStudFrame(context, volume.footprint, view, {
      baseZ,
      height: wallHeight * phase.studs,
      colour: palette.timber,
      spacing: volume.studSpacing,
      plate: phase.plates > 0,
      alpha: 1,
    });
  }

  if (phase.trusses > 0 && roof.kind !== "parapet") {
    drawTrusses(
      context,
      volume.footprint,
      view,
      roof.kind === "gable" ? roof.ridge : "x",
      {
        baseZ: baseZ + wallHeight,
        rise: roof.rise,
        colour: palette.timber,
        count: 5,
        alpha: phase.trusses,
      },
    );
  }

  // --- Walls -------------------------------------------------------------
  const claddingHeight = wallHeight * phase.cladding;

  if (claddingHeight > 0.01) {
    drawBox(context, volume.footprint, view, {
      z0: baseZ,
      z1: baseZ + claddingHeight,
      colour: palette.body,
      edge: true,
    });

    if (volume.floorLine !== undefined && phase.cladding >= 1) {
      // A shadow line at the intermediate floor. The only thing that tells a
      // visitor at this size that the building has two storeys.
      const { x0, x1, y0, y1 } = volume.footprint;
      const z = baseZ + volume.floorLine;
      strokeLine(
        context,
        project({ x: x0, y: y1, z }, view),
        project({ x: x1, y: y1, z }, view),
        shade(palette.body, 0.42),
        view.scale * 0.075,
        0.75,
      );
      strokeLine(
        context,
        project({ x: x1, y: y1, z }, view),
        project({ x: x1, y: y0, z }, view),
        shade(palette.body, 0.32),
        view.scale * 0.075,
        0.6,
      );
    }
  }

  // --- Roof --------------------------------------------------------------
  if (phase.roof > 0 && phase.cladding >= 1) {
    const roofBase = baseZ + wallHeight;
    /*
      The roof rises into place at full opacity. Fading it in instead would mean
      the espresso reads as grey over ivory walls for the whole transition, which
      looks like an unfinished render rather than a roof going on.
    */
    const alpha = 1;

    if (roof.kind === "gable") {
      drawGableRoof(context, volume.footprint, view, roof.ridge, {
        baseZ: roofBase,
        rise: roof.rise * phase.roof,
        colour: palette.roof,
        alpha,
        overhang: roof.overhang,
      });
    } else if (roof.kind === "hip") {
      drawHipRoof(context, volume.footprint, view, {
        baseZ: roofBase,
        rise: roof.rise * phase.roof,
        colour: palette.roof,
        alpha,
        overhang: roof.overhang,
      });
    } else {
      // A parapet: a thin band standing above the wall line.
      drawBox(context, inset(volume.footprint, -0.12), view, {
        z0: roofBase,
        z1: roofBase + roof.rise * phase.roof,
        colour: palette.roof,
        alpha,
        edge: true,
      });
    }
  }

  // --- Openings ----------------------------------------------------------
  if (volume.openings && phase.openings > 0 && phase.cladding >= 1) {
    drawOpenings(context, volume.footprint, view, {
      baseZ,
      wallHeight,
      storeyHeight: volume.storeyHeight,
      voidColour: shade(palette.roof, 0.15),
      glassColour: mix(palette.glass, palette.accent, 0.08 * phase.finish),
      cut: phase.openings,
      glazed: phase.finish,
      accentColour: palette.accent,
      door: true,
    });
  }
}

/** The attached neighbour, for the townhouse. Context, not a second property. */
function drawNeighbour(
  context: CanvasRenderingContext2D,
  view: Projection,
  palette: MaquettePalette,
  spec: ArchetypeSpec,
  phase: BuildPhase,
): void {
  if (!spec.neighbour || phase.cladding <= 0) {
    return;
  }

  drawBox(context, spec.neighbour.footprint, view, {
    z0: spec.slabHeight,
    z1: spec.slabHeight + spec.neighbour.wallHeight * phase.cladding,
    colour: mix(palette.body, palette.lot, 0.55),
    alpha: 0.85,
  });
}

/** The entry threshold, in terracotta. The one place colour is spent. */
function drawEntry(
  context: CanvasRenderingContext2D,
  view: Projection,
  palette: MaquettePalette,
  spec: ArchetypeSpec,
  phase: BuildPhase,
): void {
  if (!spec.entry || phase.finish <= 0) {
    return;
  }

  drawBox(context, spec.entry, view, {
    z0: 0,
    z1: spec.slabHeight * 0.7,
    colour: palette.accent,
    alpha: 0.9 * phase.finish,
  });
}

/**
 * Ground treatment around a finished home: a soft paved apron.
 *
 * Present only in the completed frames, and only as a change of tone, because a
 * marker that grows a garden is a marker that has stopped being about
 * construction.
 */
function drawGround(
  context: CanvasRenderingContext2D,
  view: Projection,
  palette: MaquettePalette,
  spec: ArchetypeSpec,
  phase: BuildPhase,
): void {
  if (phase.finish <= 0) {
    return;
  }

  const apron = inset(spec.slab, -0.5);
  fillPolygon(
    context,
    [
      project({ x: apron.x0, y: apron.y0, z: 0.01 }, view),
      project({ x: apron.x1, y: apron.y0, z: 0.01 }, view),
      project({ x: apron.x1, y: apron.y1, z: 0.01 }, view),
      project({ x: apron.x0, y: apron.y1, z: 0.01 }, view),
    ],
    tint(palette.lot, 0.18),
    0.5 * phase.finish,
  );
}

function drawFrame(
  context: CanvasRenderingContext2D,
  view: Projection,
  palette: MaquettePalette,
  spec: ArchetypeSpec,
  phase: BuildPhase,
): void {
  drawLot(context, view, palette, phase);
  drawGround(context, view, palette, spec, phase);
  drawSetOut(context, view, palette, spec, phase);
  drawSlab(context, view, palette, spec, phase);
  drawEntry(context, view, palette, spec, phase);
  drawNeighbour(context, view, palette, spec, phase);

  // Back to front, so nearer volumes overlap further ones.
  const ordered = [...spec.volumes].sort(
    (a, b) => footprintDepth(a.footprint) - footprintDepth(b.footprint),
  );

  for (const volume of ordered) {
    drawVolume(context, view, palette, spec, volume, phase);
  }
}

/* -------------------------------------------------------------------------- */
/* The sheet                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fits the lot into a cell.
 *
 * Derived rather than tuned by hand so that changing `CELL`, or the lot size,
 * cannot silently crop a roof. The scale is chosen from the plan's diagonal
 * extent, and the vertical headroom the tallest archetype needs is checked
 * against it.
 */
function projectionForCell(cell: number, pixelRatio: number): Projection {
  const size = cell * pixelRatio;
  const planSpan = LOT.x1 - LOT.x0 + (LOT.y1 - LOT.y0);
  const horizontalPadding = size * 0.06;
  const scale = (size - horizontalPadding * 2) / (planSpan * Math.cos(Math.PI / 6));

  const centre = {
    x: (LOT.x0 + LOT.x1) / 2,
    y: (LOT.y0 + LOT.y1) / 2,
    z: 0,
  };
  const unshifted = project(centre, { originX: 0, originY: 0, scale });

  return {
    originX: size * LOT_CENTRE_IN_CELL.x - unshifted[0],
    originY: size * LOT_CENTRE_IN_CELL.y - unshifted[1],
    scale,
  };
}

let cached: (MaquetteAtlas & { readonly signature: string }) | null = null;

/**
 * Renders — or returns the already-rendered — atlas for the current theme.
 *
 * Keyed on the resolved palette rather than on a theme name, so a palette change
 * of any kind produces a new sheet and an unchanged palette never re-renders.
 * Returns null only when a 2D context is unavailable, which the caller treats as
 * "fall back to the existing markers" rather than as an error.
 */
export async function getMaquetteAtlas(): Promise<MaquetteAtlas | null> {
  const palette = readMaquettePalette();
  const signature = JSON.stringify(palette);

  if (cached?.signature === signature) {
    return cached;
  }

  const columns = FRAME_COUNT;
  const rows = ARCHETYPE_ORDER.length;
  const cellPixels = CELL * PIXEL_RATIO;

  const canvas = document.createElement("canvas");
  canvas.width = columns * cellPixels;
  canvas.height = rows * cellPixels;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.lineCap = "round";
  context.lineJoin = "round";

  const view = projectionForCell(CELL, PIXEL_RATIO);
  const startedAt = performance.now();

  ARCHETYPE_ORDER.forEach((archetype, row) => {
    const spec = ARCHETYPES[archetype];

    FRAMES.forEach((frame, column) => {
      context.save();
      context.translate(column * cellPixels, row * cellPixels);
      // Every cell is clipped to itself, so an overhanging roof cannot bleed
      // into the neighbouring frame and appear as a ghost when it is shown.
      context.beginPath();
      context.rect(0, 0, cellPixels, cellPixels);
      context.clip();
      drawFrame(context, view, palette, spec, frame.phase);
      context.restore();
    });
  });

  const renderMs = performance.now() - startedAt;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/png");
  });

  if (!blob) {
    return null;
  }

  const url = URL.createObjectURL(blob);
  const rowForArchetype = Object.fromEntries(
    ARCHETYPE_ORDER.map((archetype, index) => [archetype, index]),
  ) as Record<ArchitecturalVariant, number>;

  cached?.dispose();

  const atlas: MaquetteAtlas & { signature: string } = {
    signature,
    url,
    cell: CELL,
    columns,
    rows,
    byteLength: blob.size,
    renderMs,
    rowForArchetype,
    dispose: () => {
      URL.revokeObjectURL(url);

      if (cached?.url === url) {
        cached = null;
      }
    },
  };

  cached = atlas;

  return atlas;
}

/** Exported for the prototype page, which renders single frames for review. */
export function renderMaquetteFrame(
  context: CanvasRenderingContext2D,
  archetype: ArchitecturalVariant,
  frameIndex: number,
  cell: number,
  pixelRatio: number,
): void {
  const frame = FRAMES[Math.min(Math.max(frameIndex, 0), FRAME_COUNT - 1)];
  context.lineCap = "round";
  context.lineJoin = "round";
  drawFrame(
    context,
    projectionForCell(cell, pixelRatio),
    readMaquettePalette(),
    ARCHETYPES[archetype],
    frame.phase,
  );
}

export const maquetteCellSize = CELL;
export const maquettePixelRatio = PIXEL_RATIO;
