import { shade, tint, toCss, type Rgb } from "@/lib/map/maquette/colour";

/**
 * Axonometric drawing primitives for the miniature construction models.
 *
 * ## Why axonometric and not a 3D engine
 *
 * The models are read at 40–56 logical pixels. At that size a perspective camera
 * buys nothing a parallel projection does not, and a parallel projection can be
 * drawn with plain 2D canvas paths — no WebGL context, no scene graph, no
 * runtime dependency. The result is the flat-shaded look of a physical massing
 * model, which is exactly the reference, rather than the soft look of a small
 * render.
 *
 * ## The projection
 *
 * Plan coordinates are metres-ish: `x` runs to the right-and-down, `y` runs to
 * the left-and-down, `z` is up. So the viewer is above one corner of the lot and
 * sees three faces of any box: the top, the face at maximum `x`, and the face at
 * maximum `y`. Depth sorting is by `x + y`: the larger the sum, the nearer the
 * viewer, so volumes are painted in ascending order of it.
 */

const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Where the plan origin sits on the canvas, and how many pixels a unit is. */
export interface Projection {
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
}

export type Point2 = readonly [number, number];

export function project(point: Point3, view: Projection): Point2 {
  return [
    view.originX + (point.x - point.y) * ISO_COS * view.scale,
    view.originY + (point.x + point.y) * ISO_SIN * view.scale - point.z * view.scale,
  ];
}

/** A rectangular footprint in plan. */
export interface Footprint {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export function footprintDepth(footprint: Footprint): number {
  return (footprint.x0 + footprint.x1) / 2 + (footprint.y0 + footprint.y1) / 2;
}

export function inset(footprint: Footprint, by: number): Footprint {
  return {
    x0: footprint.x0 + by,
    x1: footprint.x1 - by,
    y0: footprint.y0 + by,
    y1: footprint.y1 - by,
  };
}

/* -------------------------------------------------------------------------- */
/* Path helpers                                                               */
/* -------------------------------------------------------------------------- */

export function polygon(
  context: CanvasRenderingContext2D,
  points: readonly Point2[],
): void {
  if (points.length === 0) {
    return;
  }

  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);

  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index][0], points[index][1]);
  }

  context.closePath();
}

export function fillPolygon(
  context: CanvasRenderingContext2D,
  points: readonly Point2[],
  colour: Rgb,
  alpha = 1,
): void {
  if (alpha <= 0) {
    return;
  }

  polygon(context, points);
  context.fillStyle = toCss(colour, alpha);
  context.fill();
}

export function strokeLine(
  context: CanvasRenderingContext2D,
  from: Point2,
  to: Point2,
  colour: Rgb,
  width: number,
  alpha = 1,
): void {
  if (alpha <= 0 || width <= 0) {
    return;
  }

  context.beginPath();
  context.moveTo(from[0], from[1]);
  context.lineTo(to[0], to[1]);
  context.strokeStyle = toCss(colour, alpha);
  context.lineWidth = width;
  context.stroke();
}

/* -------------------------------------------------------------------------- */
/* Solids                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Face brightness. One light source, high and to the viewer's left, so the top
 * is lit, the `x` face takes a little shade and the `y` face takes more. Fixed
 * values rather than a computed normal: three constants are easier to tune by
 * eye at this size, and there are only ever three visible faces.
 */
export const FACE_TOP = 0;
export const FACE_X = 0.16;
export const FACE_Y = 0.34;

export interface BoxOptions {
  /** Base and top height. */
  readonly z0: number;
  readonly z1: number;
  readonly colour: Rgb;
  readonly alpha?: number;
  /** Draws a hairline along the lit top edges. Adds crispness at small sizes. */
  readonly edge?: boolean;
}

/**
 * A box, as its three visible faces.
 *
 * Returns the projected top corners so a roof can be built on the same
 * footprint without recomputing them.
 */
export function drawBox(
  context: CanvasRenderingContext2D,
  footprint: Footprint,
  view: Projection,
  options: BoxOptions,
): void {
  const { x0, x1, y0, y1 } = footprint;
  const { z0, z1, colour, alpha = 1, edge = false } = options;

  if (z1 <= z0 || alpha <= 0) {
    return;
  }

  const top = {
    back: project({ x: x0, y: y0, z: z1 }, view),
    right: project({ x: x1, y: y0, z: z1 }, view),
    front: project({ x: x1, y: y1, z: z1 }, view),
    left: project({ x: x0, y: y1, z: z1 }, view),
  };
  const base = {
    right: project({ x: x1, y: y0, z: z0 }, view),
    front: project({ x: x1, y: y1, z: z0 }, view),
    left: project({ x: x0, y: y1, z: z0 }, view),
  };

  // The x face and the y face first, then the top, so the top edge stays crisp.
  fillPolygon(
    context,
    [top.right, top.front, base.front, base.right],
    shade(colour, FACE_X),
    alpha,
  );
  fillPolygon(
    context,
    [top.front, top.left, base.left, base.front],
    shade(colour, FACE_Y),
    alpha,
  );
  fillPolygon(
    context,
    [top.back, top.right, top.front, top.left],
    shade(colour, FACE_TOP),
    alpha,
  );

  if (edge) {
    const highlight = tint(colour, 0.4);
    strokeLine(context, top.back, top.right, highlight, view.scale * 0.09, alpha * 0.7);
    strokeLine(context, top.back, top.left, highlight, view.scale * 0.09, alpha * 0.5);
  }
}

export type RidgeAxis = "x" | "y";

export interface RoofOptions {
  readonly baseZ: number;
  readonly rise: number;
  readonly colour: Rgb;
  readonly alpha?: number;
  /** How far the roof oversails the walls. */
  readonly overhang?: number;
}

/**
 * A gable roof: two pitched planes meeting at a ridge, with a gable end at each
 * side. Drawn as flat-shaded quads so the pitch reads as a change of plane
 * rather than a gradient.
 */
export function drawGableRoof(
  context: CanvasRenderingContext2D,
  footprint: Footprint,
  view: Projection,
  ridge: RidgeAxis,
  options: RoofOptions,
): void {
  const { baseZ, rise, colour, alpha = 1, overhang = 0 } = options;

  if (rise <= 0 || alpha <= 0) {
    return;
  }

  const f = inset(footprint, -overhang);
  const top = baseZ + rise;

  if (ridge === "y") {
    // Ridge runs along y, so the two slopes face +x and -x.
    const midX = (f.x0 + f.x1) / 2;
    const ridgeBack = project({ x: midX, y: f.y0, z: top }, view);
    const ridgeFront = project({ x: midX, y: f.y1, z: top }, view);
    const eaveBackLow = project({ x: f.x0, y: f.y0, z: baseZ }, view);
    const eaveFrontLow = project({ x: f.x0, y: f.y1, z: baseZ }, view);
    const eaveBackHigh = project({ x: f.x1, y: f.y0, z: baseZ }, view);
    const eaveFrontHigh = project({ x: f.x1, y: f.y1, z: baseZ }, view);

    // Far slope, then the gable that faces the viewer, then the near slope.
    fillPolygon(
      context,
      [ridgeBack, ridgeFront, eaveFrontLow, eaveBackLow],
      shade(colour, FACE_Y + 0.06),
      alpha,
    );
    fillPolygon(
      context,
      [ridgeFront, eaveFrontHigh, eaveFrontLow],
      shade(colour, FACE_Y),
      alpha,
    );
    fillPolygon(
      context,
      [ridgeBack, ridgeFront, eaveFrontHigh, eaveBackHigh],
      shade(colour, FACE_X - 0.1),
      alpha,
    );
    strokeLine(context, ridgeBack, ridgeFront, tint(colour, 0.5), view.scale * 0.1, alpha * 0.8);
    return;
  }

  const midY = (f.y0 + f.y1) / 2;
  const ridgeLeft = project({ x: f.x0, y: midY, z: top }, view);
  const ridgeRight = project({ x: f.x1, y: midY, z: top }, view);
  const eaveLeftLow = project({ x: f.x0, y: f.y0, z: baseZ }, view);
  const eaveRightLow = project({ x: f.x1, y: f.y0, z: baseZ }, view);
  const eaveLeftHigh = project({ x: f.x0, y: f.y1, z: baseZ }, view);
  const eaveRightHigh = project({ x: f.x1, y: f.y1, z: baseZ }, view);

  fillPolygon(
    context,
    [ridgeLeft, ridgeRight, eaveRightLow, eaveLeftLow],
    shade(colour, FACE_X - 0.1),
    alpha,
  );
  fillPolygon(
    context,
    [ridgeRight, eaveRightHigh, eaveRightLow],
    shade(colour, FACE_X + 0.06),
    alpha,
  );
  fillPolygon(
    context,
    [ridgeLeft, ridgeRight, eaveRightHigh, eaveLeftHigh],
    shade(colour, FACE_Y),
    alpha,
  );
  strokeLine(context, ridgeLeft, ridgeRight, tint(colour, 0.5), view.scale * 0.1, alpha * 0.8);
}

/** A hip roof: four planes to a short ridge. The calmer of the two forms. */
export function drawHipRoof(
  context: CanvasRenderingContext2D,
  footprint: Footprint,
  view: Projection,
  options: RoofOptions,
): void {
  const { baseZ, rise, colour, alpha = 1, overhang = 0 } = options;

  if (rise <= 0 || alpha <= 0) {
    return;
  }

  const f = inset(footprint, -overhang);
  const top = baseZ + rise;
  const hip = Math.min((f.x1 - f.x0) / 4, (f.y1 - f.y0) / 4);
  const ridgeBack = project(
    { x: (f.x0 + f.x1) / 2, y: f.y0 + hip, z: top },
    view,
  );
  const ridgeFront = project(
    { x: (f.x0 + f.x1) / 2, y: f.y1 - hip, z: top },
    view,
  );

  const cornerBack = project({ x: f.x0, y: f.y0, z: baseZ }, view);
  const cornerRight = project({ x: f.x1, y: f.y0, z: baseZ }, view);
  const cornerFront = project({ x: f.x1, y: f.y1, z: baseZ }, view);
  const cornerLeft = project({ x: f.x0, y: f.y1, z: baseZ }, view);

  // Back plane is mostly hidden; drawing it first keeps the silhouette solid.
  fillPolygon(
    context,
    [ridgeBack, ridgeFront, cornerLeft, cornerBack],
    shade(colour, FACE_Y + 0.06),
    alpha,
  );
  fillPolygon(context, [ridgeBack, cornerBack, cornerRight], shade(colour, FACE_X - 0.12), alpha);
  fillPolygon(
    context,
    [ridgeBack, ridgeFront, cornerFront, cornerRight],
    shade(colour, FACE_X),
    alpha,
  );
  fillPolygon(context, [ridgeFront, cornerFront, cornerLeft], shade(colour, FACE_Y), alpha);
  strokeLine(context, ridgeBack, ridgeFront, tint(colour, 0.5), view.scale * 0.1, alpha * 0.85);
}

/**
 * Exposed stud framing on the two walls the viewer can see, with bottom and top
 * plates. This is the frame stage's whole job: the silhouette has to read as
 * open structure, not as a translucent building.
 */
export function drawStudFrame(
  context: CanvasRenderingContext2D,
  footprint: Footprint,
  view: Projection,
  options: {
    readonly baseZ: number;
    readonly height: number;
    readonly colour: Rgb;
    readonly spacing: number;
    readonly plate: boolean;
    readonly alpha?: number;
  },
): void {
  const { baseZ, height, colour, spacing, plate, alpha = 1 } = options;

  if (height <= 0 || alpha <= 0) {
    return;
  }

  const topZ = baseZ + height;
  const studWidth = view.scale * 0.15;
  const plateWidth = view.scale * 0.2;
  const { x0, x1, y0, y1 } = footprint;

  // Bottom plates, on all four walls, so the footprint stays legible.
  const corners = {
    back: project({ x: x0, y: y0, z: baseZ }, view),
    right: project({ x: x1, y: y0, z: baseZ }, view),
    front: project({ x: x1, y: y1, z: baseZ }, view),
    left: project({ x: x0, y: y1, z: baseZ }, view),
  };
  polygon(context, [corners.back, corners.right, corners.front, corners.left]);
  context.strokeStyle = toCss(shade(colour, 0.25), alpha);
  context.lineWidth = plateWidth;
  context.stroke();

  // Studs on the x wall (at y1) and the y wall (at x1) — the two visible walls.
  for (let x = x0; x <= x1 + 0.001; x += spacing) {
    const at = Math.min(x, x1);
    strokeLine(
      context,
      project({ x: at, y: y1, z: baseZ }, view),
      project({ x: at, y: y1, z: topZ }, view),
      colour,
      studWidth,
      alpha,
    );
  }

  for (let y = y0; y <= y1 + 0.001; y += spacing) {
    const at = Math.min(y, y1);
    strokeLine(
      context,
      project({ x: x1, y: at, z: baseZ }, view),
      project({ x: x1, y: at, z: topZ }, view),
      shade(colour, 0.12),
      studWidth,
      alpha,
    );
  }

  if (!plate) {
    return;
  }

  const topCorners = {
    back: project({ x: x0, y: y0, z: topZ }, view),
    right: project({ x: x1, y: y0, z: topZ }, view),
    front: project({ x: x1, y: y1, z: topZ }, view),
    left: project({ x: x0, y: y1, z: topZ }, view),
  };
  polygon(context, [
    topCorners.back,
    topCorners.right,
    topCorners.front,
    topCorners.left,
  ]);
  context.strokeStyle = toCss(tint(colour, 0.18), alpha);
  context.lineWidth = plateWidth;
  context.stroke();
}

/** Open roof trusses: the pitch, before it is sheeted. */
export function drawTrusses(
  context: CanvasRenderingContext2D,
  footprint: Footprint,
  view: Projection,
  ridge: RidgeAxis,
  options: {
    readonly baseZ: number;
    readonly rise: number;
    readonly colour: Rgb;
    readonly count: number;
    readonly alpha?: number;
  },
): void {
  const { baseZ, rise, colour, count, alpha = 1 } = options;

  if (rise <= 0 || alpha <= 0 || count < 2) {
    return;
  }

  const width = view.scale * 0.13;
  const topZ = baseZ + rise;
  const { x0, x1, y0, y1 } = footprint;

  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);

    if (ridge === "y") {
      const y = y0 + (y1 - y0) * t;
      const apex = project({ x: (x0 + x1) / 2, y, z: topZ }, view);
      strokeLine(context, project({ x: x0, y, z: baseZ }, view), apex, colour, width, alpha);
      strokeLine(context, apex, project({ x: x1, y, z: baseZ }, view), colour, width, alpha);
      continue;
    }

    const x = x0 + (x1 - x0) * t;
    const apex = project({ x, y: (y0 + y1) / 2, z: topZ }, view);
    strokeLine(context, project({ x, y: y0, z: baseZ }, view), apex, colour, width, alpha);
    strokeLine(context, apex, project({ x, y: y1, z: baseZ }, view), colour, width, alpha);
  }

  // The ridge line, tying the trusses together.
  if (ridge === "y") {
    strokeLine(
      context,
      project({ x: (x0 + x1) / 2, y: y0, z: topZ }, view),
      project({ x: (x0 + x1) / 2, y: y1, z: topZ }, view),
      colour,
      width,
      alpha,
    );
    return;
  }

  strokeLine(
    context,
    project({ x: x0, y: (y0 + y1) / 2, z: topZ }, view),
    project({ x: x1, y: (y0 + y1) / 2, z: topZ }, view),
    colour,
    width,
    alpha,
  );
}

/**
 * Window and door openings on the two visible walls.
 *
 * Drawn as voids first and glazed later, which is what actually happens on site
 * and is also the only way the lock-up and complete states differ enough to read
 * at this size.
 */
export function drawOpenings(
  context: CanvasRenderingContext2D,
  footprint: Footprint,
  view: Projection,
  options: {
    readonly baseZ: number;
    readonly wallHeight: number;
    /** Floor-to-floor height. Openings are sized from this, never from the
     * wall, so a two-storey volume gets two bands of ordinary windows rather
     * than one enormous one. */
    readonly storeyHeight: number;
    readonly voidColour: Rgb;
    readonly glassColour: Rgb;
    /** 0 cuts nothing, 1 cuts every opening. */
    readonly cut: number;
    /** 0 leaves voids, 1 fully glazes them. */
    readonly glazed: number;
    readonly accentColour: Rgb;
    /** Draws the front door, at ground level and at a door's height. */
    readonly door: boolean;
  },
): void {
  const {
    baseZ,
    wallHeight,
    storeyHeight,
    voidColour,
    glassColour,
    cut,
    glazed,
    accentColour,
    door,
  } = options;

  if (cut <= 0 || wallHeight <= 0) {
    return;
  }

  const { x0, x1, y0, y1 } = footprint;
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const colour = glazed > 0 ? glassColour : voidColour;
  const alpha = Math.min(1, cut);
  const storeys = Math.max(1, Math.round(wallHeight / storeyHeight));
  const storey = wallHeight / storeys;

  for (let level = 0; level < storeys; level += 1) {
    const floorZ = baseZ + level * storey;
    const sillZ = floorZ + storey * 0.32;
    const headZ = floorZ + storey * 0.8;

    // Two openings on the wall facing the viewer's left (at y1).
    const windowsX: readonly (readonly [number, number])[] = [
      [x0 + spanX * 0.14, x0 + spanX * 0.38],
      [x0 + spanX * 0.52, x0 + spanX * 0.86],
    ];

    for (const [from, to] of windowsX) {
      fillPolygon(
        context,
        [
          project({ x: from, y: y1, z: sillZ }, view),
          project({ x: to, y: y1, z: sillZ }, view),
          project({ x: to, y: y1, z: headZ }, view),
          project({ x: from, y: y1, z: headZ }, view),
        ],
        colour,
        alpha,
      );
    }

    // One opening on the wall at x1. The ground floor of that wall belongs to
    // the entry, so its window sits toward the back.
    fillPolygon(
      context,
      [
        project({ x: x1, y: y0 + spanY * 0.16, z: sillZ }, view),
        project({ x: x1, y: y0 + spanY * 0.46, z: sillZ }, view),
        project({ x: x1, y: y0 + spanY * 0.46, z: headZ }, view),
        project({ x: x1, y: y0 + spanY * 0.16, z: headZ }, view),
      ],
      colour,
      alpha,
    );
  }

  if (!door) {
    return;
  }

  // A door is a door: about two units, at ground level, whatever is above it.
  const doorHead = baseZ + Math.min(storey * 0.78, 2.1);

  fillPolygon(
    context,
    [
      project({ x: x1, y: y0 + spanY * 0.6, z: baseZ }, view),
      project({ x: x1, y: y0 + spanY * 0.78, z: baseZ }, view),
      project({ x: x1, y: y0 + spanY * 0.78, z: doorHead }, view),
      project({ x: x1, y: y0 + spanY * 0.6, z: doorHead }, view),
    ],
    glazed > 0.5 ? accentColour : voidColour,
    alpha,
  );
}

/**
 * The soft contact shadow under a volume.
 *
 * An ellipse rather than a projected silhouette: at this size the shape of the
 * shadow is invisible and the only thing it contributes is the sense that the
 * model is sitting on something. A gradient keeps it from reading as a smudge.
 */
export function drawContactShadow(
  context: CanvasRenderingContext2D,
  footprint: Footprint,
  view: Projection,
  options: { readonly strength: number; readonly spread?: number },
): void {
  const { strength, spread = 1 } = options;

  if (strength <= 0) {
    return;
  }

  const centre = project(
    {
      x: (footprint.x0 + footprint.x1) / 2,
      y: (footprint.y0 + footprint.y1) / 2,
      z: 0,
    },
    view,
  );
  const radiusX =
    ((footprint.x1 - footprint.x0 + (footprint.y1 - footprint.y0)) / 2) *
    ISO_COS *
    view.scale *
    0.72 *
    spread;
  const radiusY = radiusX * 0.5;

  const gradient = context.createRadialGradient(
    centre[0],
    centre[1],
    0,
    centre[0],
    centre[1],
    Math.max(radiusX, 1),
  );
  gradient.addColorStop(0, `rgb(0 0 0 / ${0.5 * strength})`);
  gradient.addColorStop(0.6, `rgb(0 0 0 / ${0.22 * strength})`);
  gradient.addColorStop(1, "rgb(0 0 0 / 0)");

  context.save();
  context.translate(centre[0], centre[1] + view.scale * 0.2);
  context.scale(1, radiusY / Math.max(radiusX, 1));
  context.translate(-centre[0], -centre[1]);
  context.beginPath();
  context.arc(centre[0], centre[1], Math.max(radiusX, 1), 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.fill();
  context.restore();
}
