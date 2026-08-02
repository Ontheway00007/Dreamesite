"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import Lenis from "lenis";
import "lenis/dist/lenis.css";

import {
  gsap,
  prefersReducedMotion,
  ScrollTrigger,
} from "@/lib/animation/gsap";

export type ScrollTarget = string | number | HTMLElement;

export interface SmoothScrollApi {
  /** The live Lenis instance, or null under reduced motion or before mount. */
  getLenis: () => Lenis | null;
  /** Scrolls to an element, selector or offset, falling back to native scroll. */
  scrollTo: (target: ScrollTarget, offset?: number) => void;
}

/** Native scrolling, used when Lenis is unavailable. */
function nativeScrollTo(target: ScrollTarget, offset = 0): void {
  if (typeof target === "number") {
    window.scrollTo({ top: target + offset });
    return;
  }

  const element =
    typeof target === "string"
      ? document.querySelector<HTMLElement>(target)
      : target;

  if (!element) {
    return;
  }

  window.scrollTo({
    top: element.getBoundingClientRect().top + window.scrollY + offset,
  });
}

const nativeScrollApi: SmoothScrollApi = {
  getLenis: () => null,
  scrollTo: nativeScrollTo,
};

const SmoothScrollContext = createContext<SmoothScrollApi | null>(null);

export interface SmoothScrollProviderProps {
  children: ReactNode;
}

/**
 * Drives page scrolling with Lenis and keeps ScrollTrigger in sync by running
 * both from the single GSAP ticker. Visitors who prefer reduced motion keep
 * native scrolling.
 */
export function SmoothScrollProvider({ children }: SmoothScrollProviderProps) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const instance = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });

    const update = (time: number) => {
      instance.raf(time * 1000);
    };

    instance.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    lenisRef.current = instance;

    return () => {
      lenisRef.current = null;
      gsap.ticker.remove(update);
      gsap.ticker.lagSmoothing(500, 33);
      instance.destroy();
    };
  }, []);

  const api = useMemo<SmoothScrollApi>(
    () => ({
      getLenis: () => lenisRef.current,
      scrollTo: (target, offset = 0) => {
        const lenis = lenisRef.current;

        if (lenis) {
          lenis.scrollTo(target, { offset });
          return;
        }

        nativeScrollTo(target, offset);
      },
    }),
    [],
  );

  return (
    <SmoothScrollContext.Provider value={api}>
      {children}
    </SmoothScrollContext.Provider>
  );
}

/** Access to the smooth scroll controls. Safe to call outside the provider. */
export function useSmoothScroll(): SmoothScrollApi {
  return useContext(SmoothScrollContext) ?? nativeScrollApi;
}
