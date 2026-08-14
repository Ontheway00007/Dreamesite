"use client";

import { useEffect, useRef } from "react";

import { animate, useInView, useReducedMotion } from "framer-motion";

import { easing } from "@/lib/animation/easing";
import { cn } from "@/lib/utils/cn";

const numberFormat = new Intl.NumberFormat("en-AU");

export interface StatisticProps {
  value: number;
  label: string;
  suffix?: string;
  className?: string;
}

/**
 * Counts up to `value` the first time it scrolls into view.
 *
 * The final value is what renders on the server, so the figure is correct
 * without JavaScript and the layout never shifts. The count writes directly to
 * the DOM node rather than through state, which keeps it at zero React renders.
 */
export function Statistic({ value, label, suffix, className }: StatisticProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.5 });
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const node = valueRef.current;

    if (!isInView || shouldReduceMotion || !node) {
      return;
    }

    const controls = animate(0, value, {
      duration: 1.6,
      ease: easing.entrance,
      onUpdate: (latest) => {
        node.textContent = numberFormat.format(Math.round(latest));
      },
    });

    return () => controls.stop();
  }, [isInView, shouldReduceMotion, value]);

  return (
    <div ref={containerRef} className={cn("flex flex-col gap-3", className)}>
      {/* Sans numerals: the display serif uses old-style figures, which make
          statistics ambiguous at a glance. */}
      <p className="text-heading-1 text-foreground font-light tracking-tight tabular-nums">
        <span ref={valueRef}>{numberFormat.format(value)}</span>
        {suffix ? <span className="text-accent">{suffix}</span> : null}
      </p>
      <p className="text-foreground-subtle text-xs font-medium tracking-label uppercase">
        {label}
      </p>
    </div>
  );
}
