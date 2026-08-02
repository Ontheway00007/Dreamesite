import {
  propertyStatusOrder,
  propertyStatusTokens,
} from "@/lib/design/property-status";
import type { PropertyStatus } from "@/types";

/**
 * Marker artwork, drawn at runtime.
 *
 * Each status gets its own silhouette as well as its own colour, so the map
 * never relies on colour alone. Drawing them here rather than shipping image
 * files means the colours come from the same CSS variables as the rest of the
 * UI: there is no second copy of the palette to keep in sync.
 */

const MARKER_SIZE = 20;
const PIXEL_RATIO = 2;

export function markerImageId(status: PropertyStatus): string {
  return `dreame-marker-${status}`;
}

/** Expression-friendly mapping from a feature's status to its image id. */
export function markerImageExpression(): [string, string, ...string[]] {
  return ["concat", "dreame-marker-", ["get", "status"]] as unknown as [
    string,
    string,
    ...string[],
  ];
}

/** Reads a resolved colour from a CSS custom property on the document root. */
export function readCssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();

  return value.length > 0 ? value : fallback;
}

export interface MapPalette {
  readonly background: string;
  readonly surface: string;
  readonly foreground: string;
  readonly accent: string;
  readonly border: string;
}

/** The handful of interface colours the map layers need. */
export function readMapPalette(): MapPalette {
  return {
    background: readCssColor("--background", "#050506"),
    surface: readCssColor("--surface-raised", "#1c1c21"),
    foreground: readCssColor("--foreground", "#f6f3ee"),
    accent: readCssColor("--accent", "#c2935b"),
    border: readCssColor("--palette-taupe", "#978d7d"),
  };
}

function drawShape(
  context: CanvasRenderingContext2D,
  shape: "circle" | "triangle" | "diamond" | "ring",
  size: number,
): void {
  const center = size / 2;
  const radius = center - 3;

  context.beginPath();

  switch (shape) {
    case "circle":
      context.arc(center, center, radius, 0, Math.PI * 2);
      break;
    case "ring":
      context.arc(center, center, radius - 0.5, 0, Math.PI * 2);
      break;
    case "triangle": {
      const height = radius * 1.9;
      context.moveTo(center, center - height / 2);
      context.lineTo(center + radius, center + height / 2);
      context.lineTo(center - radius, center + height / 2);
      context.closePath();
      break;
    }
    case "diamond":
      context.moveTo(center, center - radius);
      context.lineTo(center + radius, center);
      context.lineTo(center, center + radius);
      context.lineTo(center - radius, center);
      context.closePath();
      break;
  }
}

export interface MarkerImage {
  readonly id: string;
  readonly image: ImageData;
}

/**
 * Renders one marker per status. Returns an empty list when a canvas context is
 * unavailable, which the caller treats as "skip the custom artwork" rather than
 * an error.
 */
export function createMarkerImages(palette: MapPalette): MarkerImage[] {
  const size = MARKER_SIZE * PIXEL_RATIO;
  const images: MarkerImage[] = [];

  for (const status of propertyStatusOrder) {
    const token = propertyStatusTokens[status];
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");

    if (!context) {
      return [];
    }

    const color = readCssColor(token.cssVariable, palette.accent);
    const hollow = token.markerShape === "ring";

    drawShape(context, token.markerShape, size);

    // A dark keyline keeps every marker legible against pale map features.
    context.lineWidth = 3 * PIXEL_RATIO;
    context.strokeStyle = palette.background;
    context.stroke();

    if (hollow) {
      context.lineWidth = 2.5 * PIXEL_RATIO;
      context.strokeStyle = color;
      context.stroke();
    } else {
      context.fillStyle = color;
      context.fill();
    }

    images.push({
      id: markerImageId(status),
      image: context.getImageData(0, 0, size, size),
    });
  }

  return images;
}

export const markerImagePixelRatio = PIXEL_RATIO;
