"use client";

import { useEffect, useRef } from "react";

import { gsap, prefersReducedMotion } from "@/lib/animation/gsap";

/**
 * Scroll progress indicator — a thin vertical rule that fills as you scroll.
 *
 * ## What it is for
 *
 * Orientation. A long page with a pinned section makes it hard to judge how
 * much is left, and this answers that without occupying layout. It is
 * `aria-hidden` because it duplicates what the scrollbar already reports to
 * assistive technology.
 *
 * ## Why there is no React state here
 *
 * Both the fill and the show/hide run off the scroll position, which fires many
 * times a second. Routing either through `useState` would re-render this
 * component — and therefore reconcile it — on every frame of every scroll, to
 * change two style values. So the effect owns both writes and talks to the DOM
 * directly. React renders this markup once and never again.
 *
 * ## Reduced motion
 *
 * The effect returns before attaching anything, which leaves the element at its
 * initial `opacity-0`. Nothing is visible and nothing is listening.
 */
export function ScrollProgress() {
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const root = rootRef.current;
    const fill = fillRef.current;

    if (!root || !fill) {
      return;
    }

    /*
      One tween, reused. Calling `gsap.to` inside the handler instead would
      allocate a tween per scroll event and leave them overlapping each other.
    */
    const setProgress = gsap.quickTo(fill, "scaleY", {
      duration: 0.3,
      ease: "power2.out",
    });

    let frame = 0;

    const read = () => {
      frame = 0;

      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;

      /*
        A page no taller than the viewport has nothing to report. Without this
        guard the division yields NaN or Infinity, which reaches the transform
        as `scaleY(NaN)` and voids the whole declaration.
      */
      const ratio =
        scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0;

      setProgress(ratio);
      root.style.opacity =
        window.scrollY > window.innerHeight * 0.5 ? "1" : "0";
    };

    /* Coalesced to one read per frame; scroll fires far more often than that. */
    const onScroll = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(read);
      }
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      gsap.killTweensOf(fill);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-50 h-full w-1 opacity-0 transition-opacity duration-500"
    >
      <div className="bg-border/30 absolute inset-0" />
      <div
        ref={fillRef}
        className="bg-accent absolute inset-x-0 top-0 h-full origin-top shadow-[0_0_12px_var(--accent)] will-change-transform"
        style={{ transform: "scaleY(0)" }}
      />
    </div>
  );
}
