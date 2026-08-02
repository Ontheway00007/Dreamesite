import {
  propertyStatusOrder,
  propertyStatusTokens,
} from "@/lib/design/property-status";
import { cn } from "@/lib/utils/cn";
import type { PropertyStatusToken } from "@/lib/design/property-status";

const TRIANGLE_CLIP = "polygon(50% 0%, 100% 100%, 0% 100%)";

/** Mirrors the canvas-drawn map markers so the silhouettes can be decoded. */
function LegendSwatch({ token }: { token: PropertyStatusToken }) {
  if (token.markerShape === "ring") {
    return (
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full border-2 border-current",
          token.textClassName,
        )}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={cn(
        "size-2.5 shrink-0",
        token.swatchClassName,
        token.markerShape === "circle" && "rounded-full",
        token.markerShape === "diamond" && "rotate-45",
      )}
      style={
        token.markerShape === "triangle" ? { clipPath: TRIANGLE_CLIP } : undefined
      }
      aria-hidden
    />
  );
}

export interface MapLegendProps {
  className?: string;
}

/**
 * Key for the marker shapes. Status is carried by silhouette as well as colour,
 * so this is what makes the map readable without relying on colour vision.
 */
export function MapLegend({ className }: MapLegendProps) {
  return (
    <div
      className={cn(
        "border-border bg-surface-overlay pointer-events-none hidden rounded-lg border p-3 backdrop-blur-md sm:block",
        className,
      )}
    >
      <p className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
        Marker key
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {propertyStatusOrder.map((status) => {
          const token = propertyStatusTokens[status];

          return (
            <li
              key={status}
              className="text-foreground-muted flex items-center gap-2.5 text-xs"
            >
              <LegendSwatch token={token} />
              {token.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
