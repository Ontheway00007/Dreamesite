"use client";

import { useEffect, useRef } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { PropertyPreview } from "@/components/property/property-preview";
import { duration, easing } from "@/lib/animation/easing";
import type { Property } from "@/types";

export interface MobilePropertySheetProps {
  property: Property | null;
  onClose: () => void;
}

/**
 * Bottom sheet preview for the selected property on small screens.
 *
 * Focus moves to the sheet when it opens so a keyboard or screen-reader user
 * lands on the new content, Escape dismisses it, and the safe-area inset keeps
 * the actions clear of the home indicator.
 */
export function MobilePropertySheet({
  property,
  onClose,
}: MobilePropertySheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!property) {
      return;
    }

    sheetRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [property, onClose]);

  return (
    <AnimatePresence>
      {property ? (
        <motion.div
          key="property-sheet"
          ref={sheetRef}
          role="dialog"
          aria-label={`${property.name} preview`}
          tabIndex={-1}
          data-lenis-prevent
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: duration.base, ease: easing.entrance }}
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
        >
          <PropertyPreview property={property} onClose={onClose} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
