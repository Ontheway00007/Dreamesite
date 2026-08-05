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

import { prefersReducedMotion, ScrollTrigger } from "@/lib/animation/gsap";

export type ScrollTarget = string | number | HTMLElement;

export interface SmoothScrollApi {
  /** Scrolls to an element, selector or offset, falling back to native scroll. */
  scrollTo: (target: ScrollTarget, offset?: number) => void;
  /** Freezes the page, used by overlays such as the mobile menu. */
  setPaused: (paused: boolean) => void;
}

/** Native scrolling, used when Lenis is not running. */
function nativeScrollTo(target: ScrollTarget, offset = 0): void {
  if (typeof target === "number") {
    window.scrollTo({ top: target + offset, behavior: "auto" });
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
    behavior: "auto",
  });
}

/** Lenis locks scrolling itself via `.lenis-stopped`; this covers the rest. */
function setNativeScrollLock(paused: boolean): void {
  document.documentElement.toggleAttribute("data-scroll-locked", paused);
}

const nativeScrollApi: SmoothScrollApi = {
  scrollTo: nativeScrollTo,
  setPaused: setNativeScrollLock,
};

const SmoothScrollContext = createContext<SmoothScrollApi | null>(null);

export interface SmoothScrollProviderProps {
  children: ReactNode;
}

/**
 * Owns the single Lenis instance and keeps ScrollTrigger reading the same
 * scroll position.
 *
 * Lenis drives its own requestAnimationFrame loop and reports every scroll to
 * ScrollTrigger. Nothing about GSAP's global configuration is changed here: the
 * provider only creates, wires and destroys its own instance.
 *
 * Visitors who prefer reduced motion keep native scrolling.
 */
export function SmoothScrollProvider({ children }: SmoothScrollProviderProps) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const lenis = new Lenis();

    lenis.on("scroll", ScrollTrigger.update);
    lenisRef.current = lenis;

    return () => {
      lenisRef.current = null;
      lenis.destroy();
    };
  }, []);

  const api = useMemo<SmoothScrollApi>(
    () => ({
      scrollTo: (target, offset = 0) => {
        const lenis = lenisRef.current;

        if (lenis) {
          lenis.scrollTo(target, { offset });
          return;
        }

        nativeScrollTo(target, offset);
      },
      setPaused: (paused) => {
        const lenis = lenisRef.current;

        if (lenis) {
          if (paused) {
            lenis.stop();
          } else {
            lenis.start();
          }

          return;
        }

        setNativeScrollLock(paused);
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
