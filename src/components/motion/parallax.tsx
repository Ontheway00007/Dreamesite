"use client";

import type { ReactNode } from "react";

import { useGsap } from "@/hooks/use-gsap";
import { cn } from "@/lib/utils/cn";

export interface ParallaxProps {
  /**
   * Pixels the content travels across the scroll range. Positive values move
   * the content down, creating a slower-than-scroll feel.
   */
  distance?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * Scroll-linked translation powered by GSAP ScrollTrigger. Reverts itself on
 * unmount and is skipped for visitors who prefer reduced motion.
 */
export function Parallax({
  distance = 120,
  className,
  children,
}: ParallaxProps) {
  const ref = useGsap<HTMLDivElement>(
    ({ element, gsap }) => {
      gsap.to(element.firstElementChild, {
        y: distance,
        ease: "none",
        scrollTrigger: {
          trigger: element,
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
      <div>{children}</div>
    </div>
  );
}
