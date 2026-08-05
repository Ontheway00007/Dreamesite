import type { PropertyStatus } from "@/types";

/**
 * Presentation tokens for each property status. The colour values live in
 * globals.css as CSS variables, so the map, badges and filters that arrive in
 * later phases all read from one source of truth.
 */
export interface PropertyStatusToken {
  readonly status: PropertyStatus;
  readonly label: string;
  readonly description: string;
  /** Tailwind class that paints the status colour as a background. */
  readonly swatchClassName: string;
  /** Tailwind class that paints the status colour as text. */
  readonly textClassName: string;
  /**
   * CSS custom property holding the colour. The map reads the resolved value
   * from this variable at runtime so canvas-drawn markers use the same colour
   * as the rest of the UI without redeclaring it.
   */
  readonly cssVariable: `--status-${string}`;
  /**
   * Marker outline used on the map. Status is never signalled by colour alone,
   * so each one also has its own silhouette.
   */
  readonly markerShape: "circle" | "triangle" | "diamond" | "ring";
}

export const propertyStatusTokens: Readonly<
  Record<PropertyStatus, PropertyStatusToken>
> = {
  "move-in-ready": {
    status: "move-in-ready",
    label: "Move-in ready",
    description: "Finished, titled and available to occupy now.",
    swatchClassName: "bg-status-move-in-ready",
    textClassName: "text-status-move-in-ready",
    cssVariable: "--status-move-in-ready",
    markerShape: "circle",
  },
  "under-construction": {
    status: "under-construction",
    label: "Under construction",
    description: "On site and progressing toward practical completion.",
    swatchClassName: "bg-status-under-construction",
    textClassName: "text-status-under-construction",
    cssVariable: "--status-under-construction",
    markerShape: "triangle",
  },
  completed: {
    status: "completed",
    label: "Completed",
    description: "Built and handed over, kept on record as a reference home.",
    swatchClassName: "bg-status-completed",
    textClassName: "text-status-completed",
    cssVariable: "--status-completed",
    markerShape: "diamond",
  },
  sold: {
    status: "sold",
    label: "Sold",
    description: "No longer available, retained to show what we deliver.",
    swatchClassName: "bg-status-sold",
    textClassName: "text-status-sold",
    cssVariable: "--status-sold",
    markerShape: "ring",
  },
};

/** Display order used everywhere statuses are listed. */
export const propertyStatusOrder: readonly PropertyStatus[] = [
  "move-in-ready",
  "under-construction",
  "completed",
  "sold",
] as const;
