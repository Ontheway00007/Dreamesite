"use client";

import { ArrowRight, X } from "lucide-react";

import { ConstructionStageRail } from "@/components/map/construction-stage-rail";
import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { resolveBuildStage } from "@/lib/properties/build-stage";
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
 * ## Why this is warm and the map is dark
 *
 * The map is the cinematic opening: dark, geographic, one thing at a time. Every
 * surface after it is warm ivory paper with espresso type — the architectural
 * monograph register. This panel is where the two meet, so it is drawn in the
 * warm register while sitting on the dark map. That contrast is doing real work:
 * it reads as a page lifted out of the site rather than as another dark overlay
 * competing with the basemap, and it is the visitor's first sight of the
 * language the rest of the site is written in.
 *
 * It is implemented as `.editorial-surface`, which locally overrides the semantic
 * colour tokens. `StatusBadge`, `PropertySpecs` and `ConstructionStageRail` are
 * unmodified and unaware; they read `--foreground` and `--accent` as always and
 * pick up ivory and clay because of where they are. No second implementation, and
 * no props threaded through three components to describe a colour.
 *
 * ## What it deliberately does not show
 *
 * Price, completion timing, internal floor area and the description are all on
 * the property page. A preview that reproduces the property page is not a
 * preview. What is here is what somebody scanning a map needs in order to decide
 * whether to open it: what state the home is in, how far it has been built, where
 * it is, and how big it is.
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

  /*
    Address and label are already privacy-projected: `address` is whatever the
    property's visibility permits, and `label` carries the generalised
    description when it permits nothing. Neither is re-derived here — this
    component never sees a private coordinate.
  */
  const locationLine = address ?? label ?? property.suburb;

  /*
    The same resolver the animated marker reads, so the miniature outside the
    panel and the rail inside it are describing one fact.
  */
  const buildState = resolveBuildStage(property);

  return (
    <article
      className={cn(
        "editorial-surface shadow-raised border-border overflow-hidden border",
        variant === "panel" && "rounded-[1.25rem]",
        variant === "sheet" && "rounded-t-[1.25rem] border-b-0",
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
            variant === "panel" ? "(min-width: 1024px) 420px, 100vw" : "100vw"
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
          className="focus-visible:ring-ring bg-background/80 text-foreground hover:bg-background absolute top-3 right-3 grid size-9 place-items-center rounded-full backdrop-blur-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Close {property.name} preview</span>
        </button>
      </div>

      <div className="space-y-5 px-6 pt-5 pb-6">
        <div className="space-y-2">
          <p className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.22em] uppercase">
            {property.suburb}
            {property.state ? ` · ${property.state}` : ""}
          </p>
          <h3
            id={`map-panel-${property.id}`}
            className="font-display text-foreground text-2xl leading-[1.05] font-light tracking-[-0.01em]"
          >
            {property.name}
          </h3>
          {locationLine !== property.suburb ? (
            <p className="text-foreground-muted text-sm">{locationLine}</p>
          ) : null}
        </div>

        {/* A single clay hairline, which is the whole of the accent's job here. */}
        <span
          aria-hidden="true"
          className="bg-accent/70 block h-px w-10 origin-left"
        />

        <ConstructionStageRail state={buildState} />

        <PropertySpecs property={property} size="sm" />

        <a
          href={propertyHref(property.slug)}
          className="focus-visible:ring-ring border-foreground/25 text-foreground hover:border-foreground hover:bg-foreground/[0.04] group flex items-center justify-between gap-3 border-t pt-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          Explore this home
          <ArrowRight
            className="text-accent size-4 transition-transform motion-safe:group-hover:translate-x-1"
            aria-hidden="true"
          />
        </a>
      </div>
    </article>
  );
}
