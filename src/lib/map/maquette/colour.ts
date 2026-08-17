/**
 * The small amount of colour arithmetic the canvas needs.
 *
 * Canvas has no `color-mix()`, so the shading of a miniature's faces has to be
 * computed in JavaScript. Only two input forms are handled — `#rrggbb` and
 * `rgb(r g b)` — because those are the only forms the tokens this reads are
 * written in, and `getComputedStyle` normalises between them. A token written as
 * `color-mix(...)` resolves to `oklab(...)` in current browsers, which is why the
 * maquette tokens in `globals.css` are deliberately literal values.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const FALLBACK: Rgb = { r: 128, g: 128, b: 128 };

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function parseColour(value: string): Rgb {
  const input = value.trim();

  if (input.startsWith("#")) {
    const hex = input.slice(1);

    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
      };
    }

    if (hex.length >= 6) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      };
    }

    return FALLBACK;
  }

  const numbers = input.match(/-?\d*\.?\d+/g);

  if (input.startsWith("rgb") && numbers && numbers.length >= 3) {
    return {
      r: clampChannel(Number(numbers[0])),
      g: clampChannel(Number(numbers[1])),
      b: clampChannel(Number(numbers[2])),
    };
  }

  return FALLBACK;
}

export function toCss(colour: Rgb, alpha = 1): string {
  const { r, g, b } = colour;

  return alpha >= 1
    ? `rgb(${clampChannel(r)} ${clampChannel(g)} ${clampChannel(b)})`
    : `rgb(${clampChannel(r)} ${clampChannel(g)} ${clampChannel(b)} / ${alpha})`;
}

/** Linear blend. `amount` 0 returns `from`, 1 returns `to`. */
export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = Math.min(1, Math.max(0, amount));

  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  };
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** Darkens toward black. Used for the shaded faces of a solid. */
export function shade(colour: Rgb, amount: number): Rgb {
  return mix(colour, BLACK, amount);
}

/** Lightens toward white. Used for lit edges and highlights. */
export function tint(colour: Rgb, amount: number): Rgb {
  return mix(colour, WHITE, amount);
}
