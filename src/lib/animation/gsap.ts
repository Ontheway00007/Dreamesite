"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Central GSAP setup. Import `gsap` and `ScrollTrigger` from here rather than
 * from the package, so a component can never use ScrollTrigger before it has
 * been registered.
 *
 * This module is the only place allowed to touch GSAP's global configuration,
 * and it runs once per client bundle. Today nothing global needs changing:
 * Lenis runs its own requestAnimationFrame loop, so GSAP's ticker and its lag
 * smoothing defaults are left exactly as GSAP ships them. Anything global added
 * later belongs here, not inside a mounted component.
 */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger };

/** True when the visitor has asked the operating system to reduce motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
