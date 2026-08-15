import { describe, expect, it } from "vitest";

import {
  mercatorNorthing,
  projectGeoPoints,
  separateOverlapping,
  smoothPathThrough,
} from "@/lib/map/projection";
import { suburbReferences } from "@/content/suburb-references";

/**
 * The projection is the one piece of the corridor map that can be wrong without
 * looking wrong. A marker three percent off is invisible to review but means the
 * map is lying about where a home is, so the maths is tested directly rather
 * than through the component.
 */

describe("mercatorNorthing", () => {
  it("is zero at the equator", () => {
    // `Math.tan(Math.PI / 4)` is not exactly 1, so this lands a few
    // floating-point ulps off rather than on a clean zero.
    expect(mercatorNorthing(0)).toBeCloseTo(0, 12);
  });

  it("is antisymmetric about the equator", () => {
    expect(mercatorNorthing(-37.5)).toBeCloseTo(-mercatorNorthing(37.5), 10);
  });

  it("grows northward", () => {
    expect(mercatorNorthing(-37.4)).toBeGreaterThan(mercatorNorthing(-37.6));
  });

  it("stays finite at the poles rather than returning infinity", () => {
    expect(Number.isFinite(mercatorNorthing(90))).toBe(true);
    expect(Number.isFinite(mercatorNorthing(-90))).toBe(true);
  });

  it("barely diverges from latitude across the corridor", () => {
    /*
      Melbourne's northern corridor spans about 0.18 degrees of latitude. Over
      that distance Mercator and a linear scale differ by well under a percent,
      which is the reason a linear scale looks almost right and is still worth
      not using: the error is systematic, always stretching the same direction.
    */
    const spanLinear = 37.64 - 37.465;
    const spanMercator =
      mercatorNorthing(-37.465) - mercatorNorthing(-37.64);

    expect(spanMercator / spanLinear).toBeGreaterThan(1.2);
    expect(spanMercator / spanLinear).toBeLessThan(1.3);
  });
});

describe("projectGeoPoints", () => {
  const padding = 0.1;

  it("returns nothing for no points", () => {
    expect(projectGeoPoints([])).toEqual([]);
  });

  it("centres a single point, because one point has no extent", () => {
    expect(
      projectGeoPoints([{ longitude: 144.9, latitude: -37.5 }]),
    ).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it("centres several points that share one position", () => {
    /*
      This is not hypothetical. Three homes in the same suburb with `suburb`
      visibility all resolve to the suburb reference position, so they arrive
      here as identical coordinates.
    */
    const shared = { longitude: 144.94, latitude: -37.6 };

    expect(projectGeoPoints([shared, shared, shared])).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it("preserves input order", () => {
    const projected = projectGeoPoints(
      [
        { longitude: 145, latitude: -37.5 },
        { longitude: 144.85, latitude: -37.5 },
      ],
      { padding, aspect: 1 },
    );

    expect(projected[0].x).toBeGreaterThan(projected[1].x);
  });

  it("puts east to the right and north to the top", () => {
    const [west, east, north, south] = projectGeoPoints(
      [
        { longitude: 144.85, latitude: -37.55 },
        { longitude: 145.0, latitude: -37.55 },
        { longitude: 144.925, latitude: -37.465 },
        { longitude: 144.925, latitude: -37.64 },
      ],
      { padding, aspect: 1 },
    );

    expect(east.x).toBeGreaterThan(west.x);
    // Screen y grows downward, so the northern point has the smaller y.
    expect(north.y).toBeLessThan(south.y);
  });

  it("keeps every point inside the padded box", () => {
    const projected = projectGeoPoints(
      suburbReferences.map((reference) => ({
        longitude: reference.longitude,
        latitude: reference.latitude,
      })),
      { padding, aspect: 1.6 },
    );

    for (const point of projected) {
      expect(point.x).toBeGreaterThanOrEqual(padding - 1e-9);
      expect(point.x).toBeLessThanOrEqual(1 - padding + 1e-9);
      expect(point.y).toBeGreaterThanOrEqual(padding - 1e-9);
      expect(point.y).toBeLessThanOrEqual(1 - padding + 1e-9);
    }
  });

  it("does not distort: equal ground distances stay equal on screen", () => {
    /*
      Three points on one line of latitude, evenly spaced in longitude. Whatever
      the box shape, the two gaps must come out the same width, or the map is
      stretching one part of the corridor more than another.
    */
    const [a, b, c] = projectGeoPoints(
      [
        { longitude: 144.85, latitude: -37.55 },
        { longitude: 144.9, latitude: -37.55 },
        { longitude: 144.95, latitude: -37.55 },
      ],
      { padding, aspect: 2.4 },
    );

    expect(b.x - a.x).toBeCloseTo(c.x - b.x, 10);
  });

  it("letterboxes rather than stretching when the box is wider than the data", () => {
    /*
      A tall, narrow set of points in a wide box should sit in a narrow column in
      the middle, not be smeared across the full width.
    */
    const projected = projectGeoPoints(
      [
        { longitude: 144.9, latitude: -37.47 },
        { longitude: 144.91, latitude: -37.63 },
      ],
      { padding: 0, aspect: 3 },
    );

    const width = Math.abs(projected[1].x - projected[0].x);
    const height = Math.abs(projected[1].y - projected[0].y);

    expect(height).toBeCloseTo(1, 6);
    expect(width).toBeLessThan(0.1);
    // Centred: the two x values straddle the middle of the box.
    expect((projected[0].x + projected[1].x) / 2).toBeCloseTo(0.5, 6);
  });

  it("falls back to a square box for an aspect that has not been measured yet", () => {
    const points = [
      { longitude: 144.85, latitude: -37.5 },
      { longitude: 144.95, latitude: -37.6 },
    ];

    for (const aspect of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(projectGeoPoints(points, { aspect })).toEqual(
        projectGeoPoints(points, { aspect: 1 }),
      );
    }
  });

  it("clamps padding instead of pushing points out of the box", () => {
    const points = [
      { longitude: 144.85, latitude: -37.5 },
      { longitude: 144.95, latitude: -37.6 },
    ];

    for (const point of projectGeoPoints(points, { padding: -1 })) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
    }

    // Absurd padding collapses toward the centre rather than inverting.
    for (const point of projectGeoPoints(points, { padding: 5 })) {
      expect(point.x).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(point.x).toBeLessThanOrEqual(0.8 + 1e-9);
    }
  });
});

describe("smoothPathThrough", () => {
  it("returns an empty string for no points", () => {
    expect(smoothPathThrough([])).toBe("");
  });

  it("returns a bare move for one point", () => {
    expect(smoothPathThrough([{ x: 0.5, y: 0.25 }], 100)).toBe("M50 25");
  });

  it("starts at the first point and ends at the last", () => {
    const path = smoothPathThrough(
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 0.25 },
      ],
      100,
    );

    expect(path.startsWith("M0 0")).toBe(true);
    expect(path.endsWith("100 25")).toBe(true);
  });

  it("emits one cubic segment per gap, so the curve passes through every point", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.4 },
      { x: 0.6, y: 0.2 },
      { x: 1, y: 0.7 },
    ];

    const segments = smoothPathThrough(points, 100).match(/C/g) ?? [];

    expect(segments).toHaveLength(points.length - 1);
  });

  it("produces straight lines at zero tension", () => {
    const path = smoothPathThrough(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      100,
      0,
    );

    // Both control points collapse onto the endpoints.
    expect(path).toBe("M0 0 C0 0 100 100 100 100");
  });
});


describe("separateOverlapping", () => {
  const minGap = 34;

  it("leaves a single point alone", () => {
    const points = [{ x: 10, y: 20 }];

    expect(separateOverlapping(points, minGap)).toEqual(points);
  });

  it("leaves points that are already far apart alone", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 400, y: 300 },
    ];

    expect(separateOverlapping(points, minGap)).toEqual(points);
  });

  it("separates two points sharing a position by at least the gap", () => {
    /*
      The case this exists for: two homes with `suburb` location visibility in
      the same suburb resolve to one identical coordinate.
    */
    const shared = { x: 200, y: 150 };
    const [a, b] = separateOverlapping([shared, shared], minGap);

    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
      minGap - 1e-9,
    );
  });

  it("separates every pair in a larger stack", () => {
    const shared = { x: 200, y: 150 };
    const result = separateOverlapping(
      [shared, shared, shared, shared, shared],
      minGap,
    );

    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        expect(
          Math.hypot(result[i].x - result[j].x, result[i].y - result[j].y),
        ).toBeGreaterThan(minGap * 0.9);
      }
    }
  });

  it("keeps the fan centred on where the points actually were", () => {
    const shared = { x: 200, y: 150 };
    const result = separateOverlapping([shared, shared, shared], minGap);

    const centreX =
      result.reduce((total, point) => total + point.x, 0) / result.length;
    const centreY =
      result.reduce((total, point) => total + point.y, 0) / result.length;

    expect(centreX).toBeCloseTo(shared.x, 6);
    expect(centreY).toBeCloseTo(shared.y, 6);
  });

  it("is deterministic, so the same portfolio always draws the same map", () => {
    const shared = { x: 120, y: 90 };
    const input = [shared, shared, shared, { x: 500, y: 400 }];

    expect(separateOverlapping(input, minGap)).toEqual(
      separateOverlapping(input, minGap),
    );
  });

  it("preserves length and order", () => {
    const shared = { x: 60, y: 60 };
    const input = [shared, { x: 500, y: 400 }, shared];
    const result = separateOverlapping(input, minGap);

    expect(result).toHaveLength(3);
    // The lone point in the middle is untouched.
    expect(result[1]).toEqual({ x: 500, y: 400 });
  });

  it("returns the input unchanged for a nonsense gap", () => {
    const shared = { x: 10, y: 10 };
    const input = [shared, shared];

    for (const gap of [0, -5, Number.NaN]) {
      expect(separateOverlapping(input, gap)).toEqual(input);
    }
  });
});


describe("separateOverlapping, near-overlaps", () => {
  const minGap = 34;

  it("separates points that are close but not coincident", () => {
    /*
      The commoner and harder case. Homes with `exact` location visibility in one
      suburb project to positions tens of pixels apart: closer than a marker is
      wide, but far enough to land in different grid cells, so a purely
      grid-based fan misses them entirely. This is what the relaxation pass is
      for.
    */
    const result = separateOverlapping(
      [
        { x: 200, y: 150 },
        { x: 205, y: 172 },
        { x: 198, y: 196 },
      ],
      minGap,
    );

    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        expect(
          Math.hypot(result[i].x - result[j].x, result[i].y - result[j].y),
        ).toBeGreaterThan(minGap * 0.98);
      }
    }
  });

  it("keeps a relaxed cluster centred where the geography put it", () => {
    const input = [
      { x: 200, y: 150 },
      { x: 205, y: 172 },
      { x: 198, y: 196 },
    ];
    const before = centroid(input);
    const after = centroid(separateOverlapping(input, minGap));

    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it("does not disturb a distant point while relaxing a cluster", () => {
    const far = { x: 900, y: 700 };
    const result = separateOverlapping(
      [{ x: 100, y: 100 }, { x: 108, y: 112 }, far],
      minGap,
    );

    expect(result[2]).toEqual(far);
  });

  it("terminates on a pathological pile-up rather than hanging", () => {
    const pile = Array.from({ length: 40 }, () => ({ x: 300, y: 300 }));
    const result = separateOverlapping(pile, minGap);

    expect(result).toHaveLength(40);
    for (const point of result) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it("is still deterministic once relaxation is involved", () => {
    const input = [
      { x: 200, y: 150 },
      { x: 205, y: 172 },
      { x: 198, y: 196 },
      { x: 214, y: 160 },
    ];

    expect(separateOverlapping(input, minGap)).toEqual(
      separateOverlapping(input, minGap),
    );
  });
});

function centroid(points: readonly { x: number; y: number }[]) {
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}


describe("projectGeoPoints, fixed bounds", () => {
  const corridor = [
    [144.845, -37.64],
    [145.005, -37.465],
  ] as const;

  it("keeps two nearby homes near each other instead of filling the frame", () => {
    /*
      The failure this option exists for. Fitting to the data alone scales
      whatever it is given to fill the box, so two homes a kilometre apart get
      pushed to opposite corners and the map claims they are at opposite ends of
      the corridor.
    */
    const nearby = [
      { longitude: 144.94, latitude: -37.6 },
      { longitude: 144.948, latitude: -37.606 },
    ];

    const fitted = projectGeoPoints(nearby, { aspect: 1.6, padding: 0.12 });
    const anchored = projectGeoPoints(nearby, {
      aspect: 1.6,
      padding: 0.12,
      bounds: corridor,
    });

    const spread = (points: readonly { x: number; y: number }[]) =>
      Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);

    // Fitting blows them apart across the whole frame.
    expect(spread(fitted)).toBeGreaterThan(0.6);
    // Anchoring keeps them where they belong, close together.
    expect(spread(anchored)).toBeLessThan(0.1);
  });

  it("does not move a home when the filter changes", () => {
    /*
      Stability. A home's position must not depend on what else happens to be
      selected, or ticking a filter teleports every remaining marker.
    */
    const donnybrook = { longitude: 144.95, latitude: -37.5 };
    const options = { aspect: 1.6, padding: 0.12, bounds: corridor } as const;

    const alone = projectGeoPoints([donnybrook], options);
    const withOthers = projectGeoPoints(
      [
        donnybrook,
        { longitude: 144.8833, latitude: -37.5167 },
        { longitude: 144.94, latitude: -37.6 },
      ],
      options,
    );

    expect(withOthers[0].x).toBeCloseTo(alone[0].x, 10);
    expect(withOthers[0].y).toBeCloseTo(alone[0].y, 10);
  });

  it("still places a home that falls outside the bounds, by widening the frame", () => {
    /*
      Unioning rather than clamping. A home in a suburb nobody has added to the
      corridor bounds yet should land somewhere sensible, not be pinned to an edge
      or dropped.
    */
    const outside = { longitude: 145.4, latitude: -37.2 };
    const projected = projectGeoPoints(
      [{ longitude: 144.94, latitude: -37.6 }, outside],
      { aspect: 1.6, padding: 0.1, bounds: corridor },
    );

    for (const point of projected) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }

    // The far point is north and east of the other, and reads that way.
    expect(projected[1].x).toBeGreaterThan(projected[0].x);
    expect(projected[1].y).toBeLessThan(projected[0].y);
  });

  it("orders the three corridor suburbs north to south", () => {
    const projected = projectGeoPoints(
      suburbReferences.map((reference) => ({
        longitude: reference.longitude,
        latitude: reference.latitude,
      })),
      { aspect: 1.6, padding: 0.12, bounds: corridor },
    );

    const byName = new Map(
      suburbReferences.map((reference, index) => [
        reference.name,
        projected[index],
      ]),
    );

    const donnybrook = byName.get("Donnybrook");
    const mickleham = byName.get("Mickleham");
    const craigieburn = byName.get("Craigieburn");

    expect(donnybrook && mickleham && craigieburn).toBeTruthy();
    // Donnybrook -37.50 is north of Mickleham -37.5167, which is north of
    // Craigieburn -37.60. Screen y grows downward.
    expect(donnybrook!.y).toBeLessThan(mickleham!.y);
    expect(mickleham!.y).toBeLessThan(craigieburn!.y);
  });
});
