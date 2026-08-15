/**
 * Web Mercator projection into a unit square.
 *
 * ## Why this exists
 *
 * The corridor map draws real positions without a tile provider. To do that it
 * needs to turn longitude and latitude into fractions of a box, which is all a
 * projection is. Mapbox does this internally; here it is thirty lines of maths.
 *
 * ## Why Mercator and not a plain linear scale
 *
 * Latitude degrees and longitude degrees are not the same distance on the
 * ground, and the ratio changes with latitude. Scaling both linearly would
 * squash the corridor noticeably even across the ~20km this map covers. Web
 * Mercator is the same projection the tile providers use, so the shape of the
 * corridor matches what a visitor would see on any other map of the area, and
 * swapping the corridor map for Mapbox does not move the pins relative to each
 * other.
 *
 * ## Aspect ratio is the caller's problem, deliberately
 *
 * `projectGeoPoints` takes the aspect ratio of the box it is projecting into. It
 * has to: fitting geography into a box without distorting it depends on the
 * shape of the box, and the component only learns that at runtime from a
 * `ResizeObserver`. Passing it in keeps this module pure and testable, and keeps
 * the measurement in the one place that can measure.
 *
 * Everything here operates on already-published coordinates. It never sees a
 * private position, because `isMappable` has already filtered those out
 * upstream in `propertiesToGeoJson` and in the corridor map itself.
 */

/** Mercator is undefined at the poles; clamp to the standard web limit. */
const MAX_LATITUDE = 85.05112878;

export interface GeoPoint {
  readonly longitude: number;
  readonly latitude: number;
}

/** A position inside the render box, as a fraction from 0 to 1. */
export interface UnitPoint {
  /** 0 at the left edge, 1 at the right. */
  readonly x: number;
  /** 0 at the *top* edge, 1 at the bottom, because that is how screens work. */
  readonly y: number;
}

/** The same thing once multiplied out into the measured pixel box. */
export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface ProjectionOptions {
  /**
   * Fraction of the box to keep clear on every side. The default leaves room for
   * a marker at the extreme edge of the data to still draw its label and its
   * availability ring without clipping.
   */
  readonly padding?: number;
  /** Width divided by height of the box being projected into. */
  readonly aspect?: number;
}

const DEFAULT_PADDING = 0.12;
const DEFAULT_ASPECT = 1;

/**
 * Mercator northing. Unitless, and on the same scale as longitude in degrees,
 * which is what makes the two directly comparable when preserving aspect.
 */
export function mercatorNorthing(latitude: number): number {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const radians = (clamped * Math.PI) / 180;

  return Math.log(Math.tan(Math.PI / 4 + radians / 2)) * (180 / Math.PI);
}

/**
 * Projects points into the unit square, preserving their true relative shape.
 *
 * The geography is scaled to fit whichever axis is the tighter constraint and
 * centred on the other, so it is letterboxed rather than stretched. Returns
 * points in the same order as the input.
 *
 * Degenerate inputs are handled rather than guarded against, because both happen
 * in practice: filtering to a single home gives one point, and three homes in
 * the same suburb with `suburb` visibility give three *identical* points, since
 * a suburb-level marker is derived from the suburb and not the property. In both
 * cases everything collapses to the centre of the box, which is the honest
 * answer: there is no extent to show.
 */
export function projectGeoPoints(
  points: readonly GeoPoint[],
  options: ProjectionOptions = {},
): readonly UnitPoint[] {
  const padding = clampPadding(options.padding ?? DEFAULT_PADDING);
  const aspect = normaliseAspect(options.aspect ?? DEFAULT_ASPECT);

  if (points.length === 0) {
    return [];
  }

  const eastings = points.map((point) => point.longitude);
  const northings = points.map((point) => mercatorNorthing(point.latitude));

  const minEasting = Math.min(...eastings);
  const maxEasting = Math.max(...eastings);
  const minNorthing = Math.min(...northings);
  const maxNorthing = Math.max(...northings);

  const spanEasting = maxEasting - minEasting;
  const spanNorthing = maxNorthing - minNorthing;

  // No extent in either direction: one point, or several sharing a position.
  if (spanEasting === 0 && spanNorthing === 0) {
    return points.map(() => ({ x: 0.5, y: 0.5 }));
  }

  const usable = 1 - padding * 2;

  /*
    Both spans are in comparable units, so the scale that fits is whichever is
    tighter once the box's own aspect is accounted for. `spanEasting / aspect`
    converts the horizontal span into the vertical span it would occupy in a box
    of this shape, which makes the comparison a straight one.
  */
  const fitsByWidth = spanEasting / aspect >= spanNorthing;
  const scale = fitsByWidth
    ? usable / spanEasting
    : usable / (spanNorthing * aspect);

  // Whatever the fitted axis does not use is split evenly as letterboxing.
  const usedWidth = spanEasting * scale;
  const usedHeight = spanNorthing * scale * aspect;
  const offsetX = (1 - usedWidth) / 2;
  const offsetY = (1 - usedHeight) / 2;

  return points.map((point, index) => {
    const easting = eastings[index];
    const northing = northings[index];

    return {
      x: offsetX + (easting - minEasting) * scale,
      // Flipped: Mercator northing grows northward, screen y grows downward.
      y: offsetY + (maxNorthing - northing) * scale * aspect,
    };
  });
}

/**
 * Padding above 0.4 would leave no room to draw anything, and a negative value
 * would push markers outside the box. Clamped rather than thrown on, because a
 * map that is slightly wrongly padded is better than a page that crashes.
 */
function clampPadding(padding: number): number {
  if (!Number.isFinite(padding)) {
    return DEFAULT_PADDING;
  }

  return Math.max(0, Math.min(0.4, padding));
}

/** A zero, negative or non-finite aspect comes from a box that has not been laid out yet. */
function normaliseAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return DEFAULT_ASPECT;
  }

  return aspect;
}

/**
 * Fans out points that share a position, so each stays individually clickable.
 *
 * ## Why this is necessary rather than cosmetic
 *
 * A property whose location visibility is `suburb` publishes its *suburb's*
 * reference position instead of its own, because a suburb-derived marker reveals
 * nothing about where the home actually is. That is the privacy design working
 * correctly, and it means every such home in one suburb arrives here as the
 * identical coordinate.
 *
 * Drawn as-is they stack into a single marker, and the map then silently
 * under-reports the portfolio: three homes, one pin, and no indication that the
 * other two exist. Mapbox papers over this with clustering and a count bubble.
 * Fanning is the better answer at this scale, because the visitor can then click
 * each home directly rather than zooming in to break a cluster apart.
 *
 * ## Two distinct problems, two passes
 *
 * **Exactly coincident points** have no direction to be pushed apart in, so they
 * are seeded onto a small circle around their shared position first. Bucketing
 * on a grid of `minGap` finds them.
 *
 * **Near-overlapping points** are the commoner case and the one a grid misses: a
 * suburb of homes with `exact` visibility projects to positions 20-30px apart,
 * which is closer than a marker is wide but far enough to land in different grid
 * cells. Those are relaxed apart iteratively, each colliding pair pushed along
 * the line between them until it clears.
 *
 * Both passes conserve the centroid of every group they touch, so the cluster
 * stays where the geography put it and only spreads.
 *
 * ## Determinism
 *
 * The output depends only on the input and its order: the seeding angle comes
 * from the index, the relaxation runs a fixed number of iterations in index
 * order, and nothing is random. The same portfolio always draws the same map, so
 * a screenshot diff means something.
 *
 * The iteration cap is a real limit rather than a convergence guarantee. With
 * enough homes crushed into one spot the last pair may still overlap slightly,
 * which is a better failure than a hang.
 */
export function separateOverlapping(
  points: readonly PixelPoint[],
  minGap: number,
  iterations = 32,
): readonly PixelPoint[] {
  if (points.length < 2 || !Number.isFinite(minGap) || minGap <= 0) {
    return points;
  }

  const result: PixelPoint[] = seedCoincident([...points], minGap);
  const count = result.length;

  for (let pass = 0; pass < iterations; pass += 1) {
    let collided = false;

    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx = result[j].x - result[i].x;
        const dy = result[j].y - result[i].y;
        const gap = Math.hypot(dx, dy);

        if (gap >= minGap || gap === 0) {
          continue;
        }

        collided = true;

        // Half the shortfall each, so the pair's midpoint does not drift.
        const push = (minGap - gap) / 2;
        const unitX = dx / gap;
        const unitY = dy / gap;

        result[i] = {
          x: result[i].x - unitX * push,
          y: result[i].y - unitY * push,
        };
        result[j] = {
          x: result[j].x + unitX * push,
          y: result[j].y + unitY * push,
        };
      }
    }

    if (!collided) {
      break;
    }
  }

  return result;
}

/**
 * Places exactly-coincident points on a ring so the relaxation above has a
 * direction to work with. A pair at distance zero has no unit vector between
 * them, so without this they would stay stacked forever.
 */
function seedCoincident(
  points: PixelPoint[],
  minGap: number,
): PixelPoint[] {
  const buckets = new Map<string, number[]>();

  points.forEach((point, index) => {
    const key = `${point.x}|${point.y}`;
    const existing = buckets.get(key);

    if (existing) {
      existing.push(index);
    } else {
      buckets.set(key, [index]);
    }
  });

  for (const indices of buckets.values()) {
    if (indices.length < 2) {
      continue;
    }

    const centre = points[indices[0]];

    /*
      Radius that puts adjacent points on the ring exactly `minGap` apart. The
      chord between neighbours on a circle of radius r is 2r*sin(pi/n), so
      solving for a chord of minGap gives this. Two points is not a special case:
      sin(pi/2) is 1, so they land minGap apart on opposite sides.
    */
    const radius = minGap / (2 * Math.sin(Math.PI / indices.length));

    indices.forEach((index, position) => {
      const angle = -Math.PI / 2 + (position * 2 * Math.PI) / indices.length;

      points[index] = {
        x: centre.x + Math.cos(angle) * radius,
        y: centre.y + Math.sin(angle) * radius,
      };
    });
  }

  return points;
}

/**
 * A smooth path through the projected points, in the order given.
 *
 * Used for the corridor spine. This is a Catmull-Rom spline converted to cubic
 * béziers, which is the standard way to draw a curve that actually passes
 * through every point. A plain quadratic-through-midpoints curve was tried
 * first and missed the pins, which on a map that is claiming to show real
 * positions looks like a bug.
 *
 * `tension` at 0 gives straight lines and 1 gives a very loose curve; the
 * default is the usual Catmull-Rom value.
 */
export function smoothPathThrough(
  points: readonly PixelPoint[],
  scale = 1,
  tension = 0.5,
): string {
  if (points.length === 0) {
    return "";
  }

  const at = (index: number): UnitPoint =>
    points[Math.max(0, Math.min(points.length - 1, index))];

  const to = (point: UnitPoint) =>
    `${round(point.x * scale)} ${round(point.y * scale)}`;

  if (points.length === 1) {
    return `M${to(points[0])}`;
  }

  let path = `M${to(points[0])}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = at(index - 1);
    const start = at(index);
    const end = at(index + 1);
    const next = at(index + 2);

    const control1 = {
      x: start.x + ((end.x - previous.x) / 6) * tension * 2,
      y: start.y + ((end.y - previous.y) / 6) * tension * 2,
    };
    const control2 = {
      x: end.x - ((next.x - start.x) / 6) * tension * 2,
      y: end.y - ((next.y - start.y) / 6) * tension * 2,
    };

    path += ` C${to(control1)} ${to(control2)} ${to(end)}`;
  }

  return path;
}

/** Three decimals is well below a device pixel and keeps the markup small. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
