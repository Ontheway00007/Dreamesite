"use client";

import { useRef } from "react";
import { useGsap } from "@/hooks/use-gsap";
import { cn } from "@/lib/utils/cn";

/**
 * Section transition wrapper with cinematic reveal.
 * 
 * ## Purpose
 * 
 * Creates rhythm between homepage sections. Each section fades in and slides
 * up as it enters the viewport. The animation is purposeful: it guides the
 * eye down the page and creates anticipation for each new section.
 * 
 * ## Intensity: 9/10
 * 
 * Subtle enough not to distract, bold enough to feel intentional.
 */
export function SectionTransition({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useGsap<HTMLDivElement>(
    ({ gsap }) => {
      gsap.fromTo(
        ref.current,
        {
          opacity: 0,
          y: 60,
        },
        {
          opacity: 1,
          y: 0,
          duration: 1.2,
          delay,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ref.current,
            start: "top 85%",
            end: "top 60%",
            scrub: 0.5,
            once: true,
          },
        }
      );
    },
    [delay]
  );

  return (
    <div ref={ref} className={cn("opacity-0", className)}>
      {children}
    </div>
  );
}
