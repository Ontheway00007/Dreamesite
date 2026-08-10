import {
  propertyStatusOrder,
  propertyStatusTokens,
} from "@/lib/design/property-status";
import { StatusGlyph } from "@/components/map/status-glyph";
import { cn } from "@/lib/utils/cn";

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
              <StatusGlyph status={status} className={token.textClassName} />
              {token.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
