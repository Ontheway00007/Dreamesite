"use client";

import { ArrowRight, X } from "lucide-react";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { publicPriceLabel } from "@/lib/properties/display";
import { propertyHref } from "@/lib/routes";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

export interface MapPropertyPanelProps {
  property: Property;
  onClose: () => void;
  /**
   * `panel` is the desktop column beside the map; `sheet` is the mobile surface
   * that rises from the bottom edge.
   */
  variant: "panel" | "sheet";
  className?: string;
}

/**
 * The selected property, presented as an editorial feature rather than a map
 * popup.
 *
 * The distinction the brief draws is mostly about image treatment. A popup
 * puts a thumbnail beside some fields; a feature gives the photograph the top
 * of the composition, edge to edge, and lets the type sit under it. So the
 * image is the first thing in the panel at a real aspect ratio, with no inset
 * or rounded frame of its own — only the outer surface is rounded, and only on
 * the corners that meet the viewport.
 *
 * Both variants share this component because they show the same information in
 * the same order. Only the frame differs, which is a class change rather than a
 * second implementation.
 */
export function MapPropertyPanel({
  property,
  onClose,
  variant,
  className,
}: MapPropertyPanelProps) {
  const { address, label } = property.location;
  const priceLabel = publicPriceLabel(property.priceDisplay);

  /*
    Address and label are already privacy-projected: `address` is whatever the
    property's visibility permits, and `label` carries the generalised
    description when it permits nothing. Neither is re-derived here — this
    component never sees a private coordinate.
  */
  const locationLine = address ?? label ?? property.suburb;

  return (
    <article
      className={cn(
        "bg-surface/95 border-border shadow-raised overflow-hidden border backdrop-blur-xl",
        variant === "panel" && "rounded-2xl",
        variant === "sheet" && "rounded-t-2xl border-b-0",
        className,
      )}
      aria-labelledby={`map-panel-${property.id}`}
    >
      {/* The photograph leads, at the full width of the panel. */}
      <div
        className={cn(
          "bg-background-alt relative w-full overflow-hidden",
          variant === "panel" ? "aspect-16/10" : "aspect-16/9",
        )}
      >
        <PropertyMedia
          property={property}
          /* Panel is ~420px on desktop; the sheet spans the viewport. */
          sizes={
            variant === "panel"
              ? "(min-width: 1024px) 420px, 100vw"
              : "100vw"
          }
          showPreviewLabel
          className="p-6"
        />

        <div className="absolute top-3 left-3">
          <StatusBadge status={property.status} size="sm" />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="focus-visible:ring-ring bg-background/70 text-foreground hover:bg-background absolute top-3 right-3 grid size-9 place-items-center rounded-full backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Close {property.name} preview</span>
        </button>
      </div>

      <div className="space-y-4 p-5">
        <div className="space-y-1.5">
          <p className="text-foreground-subtle text-xs tracking-[0.18em] uppercase">
            {property.suburb}
            {property.state ? `, ${property.state}` : ""}
          </p>
          <h3
            id={`map-panel-${property.id}`}
            className="font-display text-foreground text-xl leading-tight"
          >
            {property.name}
          </h3>
          {locationLine !== property.suburb ? (
            <p className="text-foreground-subtle text-sm">{locationLine}</p>
          ) : null}
        </div>

        <PropertySpecs property={property} size="sm" includeHouseSize />

        {/*
          Commercial detail only when the record genuinely carries it. An
          absent price is left absent rather than filled with "Contact us",
          which reads as a price the way a blank does not.
        */}
        {priceLabel || property.completionLabel ? (
          <dl className="border-border grid gap-2 border-t pt-4 text-sm">
            {priceLabel ? (
              <div className="flex justify-between gap-4">
                <dt className="text-foreground-subtle">Price</dt>
                <dd className="text-foreground">{priceLabel}</dd>
              </div>
            ) : null}
            {property.completionLabel ? (
              <div className="flex justify-between gap-4">
                <dt className="text-foreground-subtle">Completion</dt>
                <dd className="text-foreground">{property.completionLabel}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <a
          href={propertyHref(property.slug)}
          className="focus-visible:ring-ring bg-foreground text-foreground-inverse hover:bg-accent-strong group flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none"
        >
          Explore this home
          <ArrowRight
            className="size-4 transition-transform motion-safe:group-hover:translate-x-1"
            aria-hidden="true"
          />
        </a>
      </div>
    </article>
  );
}
