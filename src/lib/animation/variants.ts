import type { Transition, Variants } from "framer-motion";

import { duration, easing } from "@/lib/animation/easing";

export const baseTransition: Transition = {
  duration: duration.slow,
  ease: easing.entrance,
};

/** Fade and rise. The default entrance for text and cards. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: baseTransition },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: baseTransition },
};

/**
 * Parent wrapper that releases its children in sequence.
 * Children should use one of the variants above.
 */
export function staggerContainer(
  stagger = 0.08,
  delayChildren = 0,
): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger, delayChildren },
    },
  };
}

/** Shared `whileInView` configuration so reveals trigger consistently. */
export const inViewOptions = {
  once: true,
  amount: 0.25,
} as const;
