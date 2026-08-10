"use client";

import type { ReactNode } from "react";

import { useGsap } from "@/hooks/use-gsap";

/**
 * Section reveal — fades and lifts a section as it enters the viewport.
 *
 * ## Why the hidden state is not in CSS
 *
 * `useGsap` does nothing at all for a visitor who prefers reduced motion, so a
 * hard-coded `opacity-0` class here would never be animated away and the
 * section would simply never appear. The from-state therefore belongs to GSAP,
 * which only applies it when it is also going to remove it. Without motion the
 * markup renders in its natural, visible state — which is the contract
 * `useGsap` documents.
 *
 * There is no flash to guard against: everything this wraps sits below a
 * full-viewport map, so none of it is in the first paint.
 */
export function SectionTransition({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useGsap<HTMLDivElement>(
    /*
      `element` comes from the scope rather than `ref.current`: the ref is the
      return value of this very call, so reaching for it inside the callback
      reads a binding that is not initialised yet at the point it is written.
    */
    ({ element, gsap }) => {
      /*
        A plain duration-based tween, triggered once. Not scrubbed — scrubbing
        ties progress to scroll position, which contradicts a one-shot entrance
        and leaves the section half-revealed if the visitor stops mid-way.
      */
      gsap.from(element, {
        opacity: 0,
        y: 60,
        duration: 1.2,
        delay,
        ease: "power3.out",
        scrollTrigger: { trigger: element, start: "top 85%", once: true },
      });
    },
    [delay],
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
