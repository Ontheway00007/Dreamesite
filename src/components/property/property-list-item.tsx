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
          "group border-border flex w-full gap-4 rounded-[0.5rem_1.5rem_1.5rem_1.5rem] border p-3 text-left transition-[background-color,border-color,transform] duration-(--duration-base) ease-luxe",
          isSelected
            ? "border-accent bg-accent-soft"
            : "bg-surface/45 hover:border-border-strong hover:bg-surface motion-safe:hover:-translate-y-0.5",
        )}
      >
        <div
          className={cn(
            "bg-background-alt relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-[0.4rem_1.25rem_1.25rem_1.25rem] border transition-colors duration-(--duration-fast) sm:w-28",
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
            <h3 className="font-display text-xl leading-[0.95]">
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

          <p className="text-foreground-subtle mt-1 text-xs tracking-[0.12em] uppercase">
            {address ?? `${property.suburb} ${property.state}`}
          </p>

          <div className="mt-3">
            <StatusBadge status={property.status} size="sm" />
          </div>

          <PropertySpecs property={property} size="sm" className="mt-3" />

          {label ? (
            <p className="text-foreground-subtle mt-2 text-[0.6875rem]">
              {label}
            </p>
          ) : null}
        </div>
      </button>
    </li>
  );
}
