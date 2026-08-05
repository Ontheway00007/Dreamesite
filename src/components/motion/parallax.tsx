"use client";

import type { ReactNode } from "react";

import { useGsap } from "@/hooks/use-gsap";
import { cn } from "@/lib/utils/cn";

export interface ParallaxProps {
  /**
   * Pixels the content travels across the scroll range. Positive values move it
   * down, creating a slower-than-scroll feel.
   */
  distance?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * Scroll-linked translation powered by GSAP ScrollTrigger. The nearest parent is
 * used as the trigger so the layer itself can move freely. Reverts on unmount
 * and is skipped for visitors who prefer reduced motion.
 */
export function Parallax({
  distance = 120,
  className,
  children,
}: ParallaxProps) {
  const ref = useGsap<HTMLDivElement>(
    ({ element, gsap }) => {
      gsap.to(element, {
        y: distance,
        ease: "none",
        scrollTrigger: {
          trigger: element.parentElement ?? element,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    },
    [distance],
  );

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}
