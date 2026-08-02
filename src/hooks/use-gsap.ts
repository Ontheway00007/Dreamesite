"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type DependencyList,
  type RefObject,
} from "react";

import { gsap, prefersReducedMotion } from "@/lib/animation/gsap";

/**
 * Layout effects do not run on the server. Selecting the hook this way keeps
 * animations flicker-free in the browser without logging an SSR warning.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface GsapScope<T extends HTMLElement> {
  /** The element the returned ref is attached to. */
  element: T;
  /** GSAP instance, already scoped so selector strings match inside `element`. */
  gsap: typeof gsap;
}

/**
 * Runs a GSAP setup function inside a scoped `gsap.context`, so every tween and
 * ScrollTrigger it creates is reverted automatically on unmount or when
 * `dependencies` change.
 *
 * It runs before paint, which lets `from()` tweens hide their targets without a
 * flash of unstyled content. Animations are skipped entirely when the visitor
 * prefers reduced motion, leaving the markup in its natural, fully visible
 * state.
 */
export function useGsap<T extends HTMLElement = HTMLDivElement>(
  setup: (scope: GsapScope<T>) => void,
  dependencies: DependencyList = [],
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;

    if (!element || prefersReducedMotion()) {
      return;
    }

    const context = gsap.context(() => {
      setup({ element, gsap });
    }, element);

    return () => {
      context.revert();
    };
    // `setup` is intentionally excluded: callers pass an inline closure and the
    // animation is re-created from `dependencies` only.
  }, dependencies);

  return ref;
}
