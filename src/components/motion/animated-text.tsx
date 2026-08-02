"use client";

import type { ElementType } from "react";

import { useGsap } from "@/hooks/use-gsap";
import { gsapEase } from "@/lib/animation/easing";
import { cn } from "@/lib/utils/cn";

export interface AnimatedTextProps {
  text: string;
  /** Semantic tag. Defaults to a paragraph. */
  as?: "h1" | "h2" | "h3" | "p" | "span";
  /** Seconds before the first word moves. */
  delay?: number;
  /** Seconds between words. */
  stagger?: number;
  className?: string;
}

/**
 * Rises each word of a headline out of its own mask.
 *
 * The text is server-rendered as normal words, so it is always readable, always
 * selectable and always available to search engines. GSAP only takes over the
 * transform, and does nothing at all under reduced motion.
 */
export function AnimatedText({
  text,
  as = "p",
  delay = 0,
  stagger = 0.045,
  className,
}: AnimatedTextProps) {
  const Component = as as ElementType;
  const ref = useGsap<HTMLElement>(
    ({ gsap }) => {
      gsap.from("[data-word]", {
        yPercent: 115,
        duration: 0.95,
        ease: gsapEase.entrance,
        stagger,
        delay,
      });
    },
    [delay, stagger, text],
  );

  return (
    <Component ref={ref} className={cn("text-balance", className)}>
      {text.split(" ").map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="mr-[0.22em] -mb-[0.18em] inline-flex overflow-hidden pb-[0.18em]"
        >
          <span data-word className="inline-block will-change-transform">
            {word}
          </span>
        </span>
      ))}
    </Component>
  );
}
