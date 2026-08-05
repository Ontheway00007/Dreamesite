"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { StatusBadge } from "@/components/property/status-badge";
import { duration, easing } from "@/lib/animation/easing";
import {
  propertyStatusOrder,
  propertyStatusTokens,
} from "@/lib/design/property-status";
import { statusGuide } from "@/content/status-guide";
import { cn } from "@/lib/utils/cn";
import type { PropertyStatus } from "@/types";

const panelTransition = { duration: duration.base, ease: easing.entrance };

/**
 * Interactive explanation of the four property states.
 *
 * Implemented as a real tab set: arrow keys move between statuses, the selected
 * tab owns the panel, and the active marker slides between tabs with a shared
 * layout animation rather than a re-render of the list.
 */
export function StatusShowcase() {
  const [active, setActive] = useState<PropertyStatus>(propertyStatusOrder[0]);
  const tabsRef = useRef<HTMLDivElement>(null);

  const select = (status: PropertyStatus, moveFocus: boolean) => {
    setActive(status);

    if (moveFocus) {
      tabsRef.current
        ?.querySelector<HTMLButtonElement>(`[data-status="${status}"]`)
        ?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const offset =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;

    if (offset === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = propertyStatusOrder.indexOf(active);
    const nextIndex =
      (currentIndex + offset + propertyStatusOrder.length) %
      propertyStatusOrder.length;

    select(propertyStatusOrder[nextIndex], true);
  };

  const entry = statusGuide[active];
  const token = propertyStatusTokens[active];

  return (
    <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-20">
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Property statuses"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        className="border-border flex flex-col border-t"
      >
        {propertyStatusOrder.map((status) => {
          const isActive = status === active;
          const statusToken = propertyStatusTokens[status];

          return (
            <button
              key={status}
              type="button"
              role="tab"
              id={`status-tab-${status}`}
              data-status={status}
              aria-selected={isActive}
              aria-controls="status-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => select(status, false)}
              className={cn(
                "border-border relative flex items-center gap-4 border-b py-5 text-left transition-colors duration-(--duration-fast)",
                isActive
                  ? "text-foreground"
                  : "text-foreground-subtle hover:text-foreground-muted",
              )}
            >
              {isActive ? (
                <motion.span
                  layoutId="status-marker"
                  transition={panelTransition}
                  className="bg-accent absolute inset-y-0 left-0 w-px"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "ml-4 size-2 shrink-0 rounded-full transition-opacity duration-(--duration-fast)",
                  statusToken.swatchClassName,
                  isActive ? "opacity-100" : "opacity-40",
                )}
                aria-hidden
              />
              <span className="font-display text-heading-3 font-light">
                {statusToken.label}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="status-panel"
        aria-labelledby={`status-tab-${active}`}
        className="relative min-h-[22rem]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={panelTransition}
            className="flex flex-col gap-8"
          >
            <StatusBadge status={active} className="self-start" />
            <p className="font-display text-heading-2 text-foreground max-w-xl font-light">
              {entry.headline}
            </p>
            <p className="text-foreground-muted max-w-xl leading-relaxed">
              {entry.detail}
            </p>
            <p className="text-foreground-subtle border-border max-w-xl border-t pt-8 text-sm">
              <span className={cn("font-medium", token.textClassName)}>
                Next step —{" "}
              </span>
              {entry.nextStep}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
