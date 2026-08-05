"use client";

import { useEffect, useRef } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";

import {
  PropertyFilters,
  type PropertyFiltersProps,
} from "@/components/property/property-filters";
import { duration, easing } from "@/lib/animation/easing";

export interface PropertyFilterSheetProps
  extends Omit<PropertyFiltersProps, "layout"> {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Count shown on the trigger so the sheet is not needed to read results. */
  resultLabel: string;
}

/**
 * Filters in a sheet, for screens too narrow for the inline bar.
 *
 * The same `PropertyFilters` component is reused inside, so there is one set of
 * controls to maintain. Opening moves focus into the sheet, Escape closes it,
 * and closing returns focus to the trigger button.
 */
export function PropertyFilterSheet({
  isOpen,
  onOpenChange,
  resultLabel,
  ...filterProps
}: PropertyFilterSheetProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    panelRef.current
      ?.querySelector<HTMLElement>("button, select, input")
      ?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onOpenChange]);

  const close = () => {
    onOpenChange(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(true)}
        aria-expanded={isOpen}
        aria-controls="property-filter-sheet"
        className="border-border bg-surface text-foreground inline-flex min-h-11 items-center gap-2 rounded-full border px-5 text-xs font-medium tracking-[0.16em] uppercase lg:hidden"
      >
        <SlidersHorizontal size={15} aria-hidden />
        Filters
        <span className="text-foreground-subtle normal-case">
          ({resultLabel})
        </span>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <>
            <motion.div
              key="filter-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.fast }}
              onClick={close}
              className="bg-background/70 fixed inset-0 z-40 backdrop-blur-sm lg:hidden"
            />

            <motion.div
              key="filter-sheet"
              id="property-filter-sheet"
              ref={panelRef}
              role="dialog"
              aria-label="Property filters"
              aria-modal="true"
              data-lenis-prevent
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: duration.base, ease: easing.entrance }}
              className="border-border bg-background fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="font-display text-heading-3 font-normal">
                  Filters
                </p>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close filters"
                  className="text-foreground-subtle hover:text-foreground inline-flex size-10 items-center justify-center rounded-full"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>

              <PropertyFilters
                {...filterProps}
                layout="stacked"
                className="mt-6"
              />

              <button
                type="button"
                onClick={close}
                className="bg-foreground text-foreground-inverse mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-full text-xs font-medium tracking-[0.16em] uppercase"
              >
                Show {resultLabel}
              </button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
