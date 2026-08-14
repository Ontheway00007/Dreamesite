"use client";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

export interface PropertyListItemProps {
  property: Property;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

/**
 * One row of the property list.
 *
 * The row is a single button: selecting it focuses the matching marker, and the
 * "View property" link lives in the preview so a row never nests one
 * interactive control inside another. `aria-current` tells assistive technology
 * which property is selected.
 */
export function PropertyListItem({
  property,
  isSelected,
  onSelect,
}: PropertyListItemProps) {
  const { address, label } = property.location;

  return (
    <li data-property-id={property.id}>
      <button
        type="button"
        onClick={() => onSelect(property.id)}
        aria-current={isSelected ? "true" : undefined}
        className={cn(
          "group border-border flex w-full gap-4 border-b p-4 text-left transition-colors duration-(--duration-fast)",
          isSelected ? "bg-surface" : "hover:bg-surface/60",
        )}
      >
        <div
          className={cn(
            "bg-background-alt relative aspect-4/3 w-28 shrink-0 overflow-hidden rounded-lg border transition-colors duration-(--duration-fast)",
            isSelected ? "border-accent" : "border-transparent",
          )}
        >
          <PropertyMedia
            property={property}
            sizes="112px"
            showPreviewLabel={false}
            className="p-2.5"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg leading-snug font-normal">
              {property.name}
            </h3>
            <span
              className={cn(
                "bg-accent mt-2 size-1.5 shrink-0 rounded-full transition-opacity duration-(--duration-fast)",
                isSelected ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
          </div>

          <p className="text-foreground-subtle mt-1 text-xs tracking-label uppercase">
            {address ?? `${property.suburb} ${property.state}`}
          </p>

          <div className="mt-3">
            <StatusBadge status={property.status} size="sm" />
          </div>

          <PropertySpecs property={property} size="sm" className="mt-3" />

          {label ? (
            <p className="text-foreground-subtle mt-2 text-label">
              {label}
            </p>
          ) : null}
        </div>
      </button>
    </li>
  );
}
