"use client";

import type { ReactNode } from "react";

import { useGsap } from "@/hooks/use-gsap";
import { gsapEase } from "@/lib/animation/easing";
import { cn } from "@/lib/utils/cn";

export interface TimelineItem {
  readonly id: string;
  /** Short ordinal, e.g. "01". */
  readonly step: string;
  readonly title: string;
  readonly body: string;
  /** Rendered icon or illustration, supplied by the caller. */
  readonly icon: ReactNode;
}

export interface TimelineProps {
  items: readonly TimelineItem[];
  className?: string;
}

/**
 * Vertical process timeline.
 *
 * Two ScrollTriggers drive the whole section: one scrubs the connecting line as
 * the visitor moves through it, one releases the stages in sequence. Adding
 * stages does not add triggers.
 */
export function Timeline({ items, className }: TimelineProps) {
  const ref = useGsap<HTMLDivElement>(
    ({ element, gsap }) => {
      gsap.fromTo(
        "[data-timeline-progress]",
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: {
            trigger: element,
            start: "top 65%",
            end: "bottom 75%",
            scrub: true,
          },
        },
      );

      gsap.from("[data-timeline-item]", {
        opacity: 0,
        y: 36,
        duration: 0.8,
        ease: gsapEase.luxe,
        stagger: 0.14,
        scrollTrigger: { trigger: element, start: "top 75%" },
      });
    },
    [items.length],
  );

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div
        className="bg-border absolute top-2 bottom-2 left-[1.4375rem] w-px md:left-[2.4375rem]"
        aria-hidden
      >
        <div
          data-timeline-progress
          className="bg-accent h-full w-px origin-top"
        />
      </div>

      <ol>
        {items.map(({ id, step, title, body, icon }) => (
          <li
            key={id}
            data-timeline-item
            className="relative flex gap-6 pb-14 last:pb-0 md:gap-10"
          >
            <div className="border-border bg-background text-accent relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border md:size-20">
              {icon}
            </div>
            <div className="pt-1 md:pt-4">
              <p className="text-foreground-subtle text-xs font-medium tracking-eyebrow uppercase">
                {step}
              </p>
              <h3 className="font-display text-heading-3 mt-3 font-normal">
                {title}
              </h3>
              <p className="text-foreground-muted mt-3 max-w-xl text-sm leading-relaxed">
                {body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
