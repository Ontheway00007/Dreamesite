"use client";

import type { CSSProperties } from "react";

import { ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { useSmoothScroll } from "@/providers/smooth-scroll-provider";

export interface ScrollCueProps {
  /** Anchor to scroll to, e.g. "#homes". */
  target: string;
  /** Name of the destination, used in the accessible label. */
  destination: string;
  /** Seconds to hold before the cue fades in, matching the hero sequence. */
  enterDelay?: number;
  className?: string;
}

/**
 * Scroll affordance at the base of the hero. The only client-side part of the
 * hero: it needs a click handler to hand the jump to Lenis. Its travelling line
 * is the shared `cue-travel` CSS animation, which stops under reduced motion.
 */
export function ScrollCue({
  target,
  destination,
  enterDelay = 0,
  className,
}: ScrollCueProps) {
  const { scrollTo } = useSmoothScroll();

  return (
    <button
      type="button"
      onClick={() => scrollTo(target, -80)}
      aria-label={`Scroll to ${destination}`}
      data-enter
      style={{ "--enter-delay": `${enterDelay}s` } as CSSProperties}
      className={cn(
        "text-foreground-subtle hover:text-foreground flex flex-col items-center gap-3 transition-colors duration-(--duration-base)",
        className,
      )}
    >
      <span className="text-[0.625rem] font-medium tracking-[0.28em] uppercase">
        Scroll
      </span>
      <span className="bg-border relative h-14 w-px overflow-hidden">
        <span
          data-enter-loop="cue"
          className="bg-accent absolute inset-x-0 top-0 block h-full"
        />
      </span>
      <ArrowDown size={14} aria-hidden />
    </button>
  );
}
