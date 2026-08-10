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

const MARKER_SIZE = 28;
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

function drawPolygon(
  context: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
): void {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);

  for (const [x, y] of points.slice(1)) {
    context.lineTo(x, y);
  }

  context.closePath();
}

/**
 * Four architectural symbols that still communicate their status without
 * colour: a lit roundel, a segmented frame, a solid plan diamond and a closed
 * double ring.
 */
function drawMarker(
  context: CanvasRenderingContext2D,
  status: PropertyStatus,
  color: string,
  palette: MapPalette,
  size: number,
): void {
  const unit = PIXEL_RATIO;
  const center = size / 2;

  context.lineCap = "round";
  context.lineJoin = "round";

  if (status === "move-in-ready") {
    context.beginPath();
    context.arc(center, center, 11 * unit, 0, Math.PI * 2);
    context.fillStyle = palette.background;
    context.fill();
    context.lineWidth = 2 * unit;
    context.strokeStyle = color;
    context.stroke();

    context.beginPath();
    context.arc(center, center, 5 * unit, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.beginPath();
    context.arc(
      center - 1.5 * unit,
      center - 1.5 * unit,
      1.25 * unit,
      0,
      Math.PI * 2,
    );
    context.fillStyle = palette.foreground;
    context.fill();
    return;
  }

  if (status === "under-construction") {
    drawPolygon(context, [
      [center, 3 * unit],
      [25 * unit, 24 * unit],
      [3 * unit, 24 * unit],
    ]);
    context.fillStyle = palette.background;
    context.fill();
    context.lineWidth = 2 * unit;
    context.strokeStyle = color;
    context.stroke();

    context.beginPath();
    context.moveTo(center, 8 * unit);
    context.lineTo(center, 20 * unit);
    context.moveTo(8 * unit, 21 * unit);
    context.lineTo(20 * unit, 21 * unit);
    context.moveTo(10 * unit, 17 * unit);
    context.lineTo(18 * unit, 17 * unit);
    context.strokeStyle = color;
    context.lineWidth = 1.5 * unit;
    context.stroke();
    return;
  }

  if (status === "completed") {
    drawPolygon(context, [
      [center, 2 * unit],
      [26 * unit, center],
      [center, 26 * unit],
      [2 * unit, center],
    ]);
    context.fillStyle = palette.background;
    context.fill();

    drawPolygon(context, [
      [center, 6 * unit],
      [22 * unit, center],
      [center, 22 * unit],
      [6 * unit, center],
    ]);
    context.fillStyle = color;
    context.fill();
    context.fillStyle = palette.background;
    context.fillRect(
      center - 2 * unit,
      center - 2 * unit,
      4 * unit,
      4 * unit,
    );
    return;
  }

  context.beginPath();
  context.arc(center, center, 11 * unit, 0, Math.PI * 2);
  context.fillStyle = palette.background;
  context.fill();
  context.lineWidth = 2 * unit;
  context.strokeStyle = color;
  context.stroke();
  context.beginPath();
  context.arc(center, center, 6 * unit, 0, Math.PI * 2);
  context.lineWidth = 1.5 * unit;
  context.stroke();
  context.beginPath();
  context.moveTo(9 * unit, center);
  context.lineTo(19 * unit, center);
  context.stroke();
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
    drawMarker(context, status, color, palette, size);

    images.push({
      id: markerImageId(status),
      image: context.getImageData(0, 0, size, size),
    });
  }

  return images;
}

export const markerImagePixelRatio = PIXEL_RATIO;
