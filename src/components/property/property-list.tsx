"use client";

import { useEffect, useRef } from "react";

import { EmptyPropertyResults } from "@/components/property/empty-property-results";
import { PropertyListItem } from "@/components/property/property-list-item";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

export interface PropertyListProps {
  properties: readonly Property[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReset: () => void;
  className?: string;
}

/**
 * The scrollable list of results.
 *
 * When a marker is chosen on the map, the matching row is brought into view with
 * `block: "nearest"`, which nudges the panel only if the row is off-screen
 * rather than yanking the list on every selection.
 *
 * `data-lenis-prevent` lets this panel scroll on its own instead of the page
 * scrolling underneath it.
 */
export function PropertyList({
  properties,
  selectedId,
  onSelect,
  onReset,
  className,
}: PropertyListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-property-id="${selectedId}"]`,
    );

    row?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (properties.length === 0) {
    return <EmptyPropertyResults onReset={onReset} className={className} />;
  }

  return (
    <div ref={listRef} data-lenis-prevent className={cn("min-h-0", className)}>
      <ul className="space-y-3">
        {properties.map((property) => (
          <PropertyListItem
            key={property.id}
            property={property}
            isSelected={property.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  );
}
