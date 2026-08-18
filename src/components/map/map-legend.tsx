import {
  propertyStatusOrder,
  propertyStatusTokens,
} from "@/lib/design/property-status";
import { StatusGlyph } from "@/components/map/status-glyph";
import { cn } from "@/lib/utils/cn";

import "@/components/map/construction-markers.css";

export interface MapLegendProps {
  /**
   * Which marker system is on the map. The key has to describe what is actually
   * drawn: a legend showing four flat silhouettes beside a map of miniature
   * buildings is worse than no legend, because it is confidently wrong.
   */
  variant?: "status" | "construction";
  className?: string;
}

const frame = "border-border bg-surface-overlay pointer-events-none hidden rounded-lg border p-3 backdrop-blur-md sm:block";
const heading = "text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase";
const row = "text-foreground-muted flex items-center gap-2.5 text-xs";

/**
 * Key for the markers.
 *
 * Status is never carried by colour alone — under the status markers it is
 * carried by silhouette, and under the construction markers by the cue drawn
 * around the building, whose shape differs per status as well as its hue. Both
 * remain readable without colour vision.
 */
export function MapLegend({ variant = "construction", className }: MapLegendProps) {
  if (variant === "status") {
    return (
      <div className={cn(frame, className)}>
        <p className={heading}>Marker key</p>
        <ul className="mt-2.5 space-y-1.5">
          {propertyStatusOrder.map((status) => {
            const token = propertyStatusTokens[status];

            return (
              <li key={status} className={row}>
                <StatusGlyph status={status} className={token.textClassName} />
                {token.label}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className={cn(frame, className)}>
      <p className={heading}>Marker key</p>
      <ul className="mt-2.5 space-y-1.5">
        {propertyStatusOrder.map((status) => (
          <li key={status} className={row}>
            {/*
              The swatch is drawn from the same CSS custom properties as the cue
              on the marker itself, so the two cannot drift apart.
            */}
            <span
              className="dreame-legend-cue"
              data-status={status}
              aria-hidden="true"
            />
            {propertyStatusTokens[status].label}
          </li>
        ))}
      </ul>
      <p className="text-foreground-subtle border-border mt-2.5 max-w-[13rem] border-t pt-2 text-[0.6875rem] leading-snug">
        Each home builds itself to the stage it has actually reached, then holds.
      </p>
    </div>
  );
}
