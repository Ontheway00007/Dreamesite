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

const MARKER_SIZE = 36;
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

function fillWithAlpha(
  context: CanvasRenderingContext2D,
  color: string,
  alpha: number,
): void {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fill();
  context.restore();
}

function strokeWithAlpha(
  context: CanvasRenderingContext2D,
  color: string,
  alpha: number,
): void {
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.stroke();
  context.restore();
}

/**
 * Four small dimensional objects. Their silhouettes remain different without
 * colour, while shadows, lit faces and highlights stop the map feeling like a
 * set of generic flat pins.
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
  const logicalCenter = 18 * unit;

  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(0, 0, 0, .42)";
  context.shadowBlur = 4 * unit;
  context.shadowOffsetY = 2 * unit;

  if (status === "move-in-ready") {
    const shell = context.createLinearGradient(
      6 * unit,
      5 * unit,
      30 * unit,
      31 * unit,
    );
    shell.addColorStop(0, palette.surface);
    shell.addColorStop(1, palette.background);

    context.beginPath();
    context.arc(logicalCenter, logicalCenter, 14 * unit, 0, Math.PI * 2);
    context.fillStyle = shell;
    context.fill();
    context.shadowColor = "transparent";
    context.lineWidth = 2 * unit;
    context.strokeStyle = color;
    context.stroke();

    const orb = context.createRadialGradient(
      14 * unit,
      13 * unit,
      0,
      logicalCenter,
      logicalCenter,
      8 * unit,
    );
    orb.addColorStop(0, palette.foreground);
    orb.addColorStop(0.22, color);
    orb.addColorStop(1, palette.surface);
    context.beginPath();
    context.arc(logicalCenter, logicalCenter, 7 * unit, 0, Math.PI * 2);
    context.fillStyle = orb;
    context.fill();
    context.beginPath();
    context.arc(15 * unit, 14.5 * unit, 1.5 * unit, 0, Math.PI * 2);
    context.fillStyle = palette.foreground;
    context.fill();
    return;
  }

  if (status === "under-construction") {
    context.save();
    context.translate(1.8 * unit, 2.5 * unit);
    drawPolygon(context, [
      [logicalCenter, 3 * unit],
      [33 * unit, 31 * unit],
      [3 * unit, 31 * unit],
    ]);
    fillWithAlpha(context, palette.surface, 0.8);
    context.restore();

    context.shadowColor = "rgba(0, 0, 0, .38)";
    drawPolygon(context, [
      [logicalCenter, 2 * unit],
      [33 * unit, 30 * unit],
      [3 * unit, 30 * unit],
    ]);
    context.fillStyle = palette.background;
    context.fill();
    context.shadowColor = "transparent";
    context.lineWidth = 2 * unit;
    context.strokeStyle = color;
    context.stroke();

    drawPolygon(context, [
      [logicalCenter, 2 * unit],
      [33 * unit, 30 * unit],
      [27 * unit, 27 * unit],
    ]);
    fillWithAlpha(context, color, 0.2);

    context.beginPath();
    context.moveTo(logicalCenter, 7 * unit);
    context.lineTo(logicalCenter, 25 * unit);
    context.moveTo(8 * unit, 26 * unit);
    context.lineTo(28 * unit, 26 * unit);
    context.moveTo(10 * unit, 21 * unit);
    context.lineTo(26 * unit, 21 * unit);
    context.moveTo(12 * unit, 16 * unit);
    context.lineTo(24 * unit, 16 * unit);
    context.strokeStyle = color;
    context.lineWidth = 1.35 * unit;
    context.stroke();
    return;
  }

  if (status === "completed") {
    context.save();
    context.translate(1.7 * unit, 2.2 * unit);
    drawPolygon(context, [
      [logicalCenter, 2 * unit],
      [34 * unit, 16 * unit],
      [logicalCenter, 34 * unit],
      [2 * unit, 16 * unit],
    ]);
    fillWithAlpha(context, palette.surface, 0.78);
    context.restore();

    context.shadowColor = "rgba(0, 0, 0, .38)";
    drawPolygon(context, [
      [logicalCenter, 1.5 * unit],
      [34 * unit, 15.5 * unit],
      [logicalCenter, 34 * unit],
      [2 * unit, 15.5 * unit],
    ]);
    context.fillStyle = color;
    context.fill();
    context.shadowColor = "transparent";

    drawPolygon(context, [
      [logicalCenter, 1.5 * unit],
      [34 * unit, 15.5 * unit],
      [logicalCenter, 18.5 * unit],
      [2 * unit, 15.5 * unit],
    ]);
    fillWithAlpha(context, palette.foreground, 0.38);

    drawPolygon(context, [
      [2 * unit, 15.5 * unit],
      [logicalCenter, 18.5 * unit],
      [logicalCenter, 34 * unit],
    ]);
    fillWithAlpha(context, palette.background, 0.42);

    context.fillStyle = palette.background;
    context.fillRect(
      center - 2.2 * unit,
      center - 1.2 * unit,
      4.4 * unit,
      5 * unit,
    );
    return;
  }

  const coin = context.createLinearGradient(
    6 * unit,
    5 * unit,
    29 * unit,
    31 * unit,
  );
  coin.addColorStop(0, palette.surface);
  coin.addColorStop(1, palette.background);

  context.beginPath();
  context.arc(logicalCenter, logicalCenter, 14 * unit, 0, Math.PI * 2);
  context.fillStyle = coin;
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 2 * unit;
  context.strokeStyle = color;
  context.stroke();
  context.beginPath();
  context.arc(logicalCenter, logicalCenter, 9 * unit, 0, Math.PI * 2);
  context.lineWidth = 1.5 * unit;
  strokeWithAlpha(context, color, 0.82);
  context.beginPath();
  context.moveTo(10 * unit, logicalCenter);
  context.lineTo(26 * unit, logicalCenter);
  context.moveTo(12 * unit, 12 * unit);
  context.lineTo(24 * unit, 24 * unit);
  context.lineWidth = 1.7 * unit;
  context.strokeStyle = color;
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
