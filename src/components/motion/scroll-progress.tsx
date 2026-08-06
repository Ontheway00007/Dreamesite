"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/animation/gsap";
import { cn } from "@/lib/utils/cn";

/**
 * Scroll progress indicator — a subtle vertical line that fills as you scroll.
 * 
 * ## Purpose
 * 
 * Provides visual feedback about journey through the page. Fills from top to
 * bottom as the user scrolls. Positioned on the left edge, thin enough not to
 * distract but visible enough to orient.
 * 
 * ## When it appears
 * 
 * Only shows after scrolling past the first viewport (after MapStage), so it
 * doesn't compete with the opening experience.
 * 
 * ## Intensity: 9/10
 * 
 * Subtle accent color, smooth animation, purposeful feedback.
 */
export function ScrollProgress() {
  const [isVisible, setIsVisible] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    // Show progress indicator after scrolling past first viewport
    const handleScroll = () => {
      const scrolled = window.scrollY;
      const shouldShow = scrolled > window.innerHeight * 0.5;
      
      if (shouldShow !== isVisible) {
        setIsVisible(shouldShow);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => window.removeEventListener("scroll", handleScroll);
  }, [isVisible]);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || !progressRef.current) return;

    const progress = progressRef.current;

    const updateProgress = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = window.scrollY;
      const percent = Math.min((scrolled / scrollHeight) * 100, 100);

      // Use transform instead of scaleY for better TypeScript compatibility
      gsap.to(progress, {
        transform: `scaleY(${percent / 100})`,
        duration: 0.3,
        ease: "power2.out",
      });
    };

    window.addEventListener("scroll", updateProgress, { passive: true });
    updateProgress(); // Set initial state

    return () => window.removeEventListener("scroll", updateProgress);
  }, []);

  return (
    <div
      className={cn(
        "fixed top-0 left-0 z-50 h-full w-1 transition-opacity duration-500",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      aria-hidden="true"
    >
      {/* Background track */}
      <div className="absolute inset-0 bg-border/30" />
      
      {/* Progress fill */}
      <div
        ref={progressRef}
        className="bg-accent absolute inset-x-0 top-0 h-full origin-top shadow-accent/50 shadow-[0_0_12px]"
        style={{ transform: 'scaleY(0)' }}
      />
    </div>
  );
}
