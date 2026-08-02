/**
 * Shared motion language. Framer Motion consumes cubic bezier tuples, GSAP
 * consumes named eases, and CSS reads the matching custom properties from
 * globals.css. Keeping all three here stops the timings from drifting apart.
 */

export type CubicBezier = [number, number, number, number];

export const easing = {
  luxe: [0.22, 1, 0.36, 1] as CubicBezier,
  entrance: [0.16, 1, 0.3, 1] as CubicBezier,
  exit: [0.7, 0, 0.84, 0] as CubicBezier,
} as const;

export const duration = {
  fast: 0.18,
  base: 0.32,
  slow: 0.64,
  cinematic: 1.1,
} as const;

export const gsapEase = {
  luxe: "power3.out",
  entrance: "expo.out",
  exit: "expo.in",
} as const;
