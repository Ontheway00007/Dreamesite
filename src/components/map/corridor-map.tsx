"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HouseTypeGlyph } from "@/components/property/house-type-glyph";
import { houseTypeTokens } from "@/lib/design/house-type";
import { propertyStatusTokens } from "@/lib/design/property-status";
import {
  projectGeoPoints,
  separateOverlapping,
  smoothPathThrough,
  type PixelPoint,
} from "@/lib/map/projection";
import { isMappable } from "@/lib/properties/privacy";
import { cn } from "@/lib/utils/cn";
import type { MappableProperty, Property } from "@/types";

/**
 * The corridor map: a real map of the corridor, drawn without a tile provider.
 *
 * ## Why this exists
 *
 * `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is optional, and without it the map slot
 * rendered `PropertyMapFallback`: a grey card with a crossed-out pin and the
 * sentence "Map unavailable". On the homepage that card *is* the first viewport,
 * sitting directly under an `h1` that reads "Every home. Every stage. One map."
 * So the page opened by promising a map and then apologising for not having one,
 * on every deployment where the variable is unset, which includes every preview.
 *
 * This draws the map instead. It is not a placeholder or a decorative diagram:
 * it projects the same published coordinates through the same Web Mercator
 * projection the tile providers use, so the homes sit in their true positions
 * relative to each other. What it lacks is a basemap, which across three
 * suburbs of greenfield development is mostly empty paddock anyway.
 *
 * ## What it buys beyond working without a token
 *
 * - **Nothing to load.** No `mapbox-gl` bundle, no tiles, no web worker, no
 *   third-party origin. The first viewport paints from markup already in the
 *   HTML rather than after a script fetches a script.
 * - **Animatable.** Tile maps fight you: markers are canvas sprites, so a
 *   staggered entrance means a `requestAnimationFrame` loop mutating paint
 *   properties, which is what `property-map.tsx` spends 40 lines doing. Here the
 *   markers are DOM, so the entrance is one keyframe and a delay variable.
 * - **Reviewable.** Screenshots of this are screenshots of the real thing.
 *
 * It deliberately does **not** replace Mapbox. Street context genuinely matters
 * once a visitor is comparing two specific homes, so when a token is configured
 * the real map still renders. This is what happens when it is not.
 *
 * ## Why the SVG works in pixels rather than in a normalised viewBox
 *
 * The first version used `viewBox="0 0 100 100"` with
 * `preserveAspectRatio="none"` so that SVG coordinates and the markers'
 * percentage positions shared one space. That works for positioning and fails
 * for everything else: a 1440x810 box scales x by 14.4 and y by 8.1, so circles
 * render as ellipses, stroke widths come out half as thick vertically as
 * horizontally, and `stroke-dasharray` lengths stop being predictable, which
 * broke the spine's draw-on into disconnected fragments.
 *
 * Opting out per-element with `vector-effect="non-scaling-stroke"` fixes the
 * width and makes the dashes worse, because dash lengths then resolve in screen
 * units the component cannot know in advance.
 *
 * So the measured pixel size is the coordinate space. Circles are round, strokes
 * are even, `pathLength="1"` behaves, and the markers are positioned in pixels
 * from the same numbers rather than in percentages that have to agree with them.
 */
export interface CorridorMapProps {
  /** Already filtered by the caller. This never filters again, apart from privacy. */
  properties: readonly Property[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Drives the homepage `h1`, which swaps its third line to the hovered home. */
  onHover?: (id: string | null) => void;
  /** Bumping this replays the entrance, which is this map's "reset view". */
  resetToken?: number;
  showLegend?: boolean;
  /**
   * Fraction of the box kept clear of markers. The homepage needs more than the
   * properties page because its chrome (the `h1`, the status rail) is overlaid on
   * the map rather than sitting beside it.
   */
  padding?: number;
  /** Rendered as a discreet note. `error` means Mapbox was configured but failed. */
  reason?: "no-token" | "error";
  className?: string;
}

/** Stagger between marker entrances, inside the 30-80ms band that reads as one gesture. */
const MARKER_STAGGER_SECONDS = 0.055;
/** The spine draws first; markers follow as it reaches them. */
const MARKER_BASE_DELAY_SECONDS = 0.45;
/**
 * Minimum distance between two marker centres.
 *
 * Set to the width of the *hit area* (44px) rather than of the visible disc
 * (32px). Separating by the disc leaves the discs technically not overlapping and
 * their tap targets fully overlapping, which on a touchscreen means the top
 * marker swallows the taps meant for its neighbour.
 */
const MARKER_SEPARATION = 44;

interface Size {
  readonly width: number;
  readonly height: number;
}

interface PlacedProperty {
  readonly property: MappableProperty;
  readonly point: PixelPoint;
}

interface SuburbZone {
  readonly name: string;
  readonly count: number;
  readonly point: PixelPoint;
  readonly radius: number;
}

export function CorridorMap({
  properties,
  selectedId,
  onSelect,
  onHover,
  resetToken = 0,
  showLegend = true,
  padding = 0.12,
  reason = "no-token",
  className,
}: CorridorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /*
    The projection needs the shape of the box to avoid distorting the geography,
    and the box is only measurable in the browser. Until it is measured, markers
    are not rendered: painting them against a guessed square and then moving them
    would be a visible jump on first paint. The backdrop renders immediately, so
    there is no flash of empty space.
  */
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const measure = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setSize((current) =>
          current && current.width === width && current.height === height
            ? current
            : { width, height },
        );
      }
    };

    const rect = container.getBoundingClientRect();
    measure(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry) {
        measure(entry.contentRect.width, entry.contentRect.height);
      }
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  /* Privacy gate. The same one the Mapbox source uses. */
  const mappable = useMemo(() => properties.filter(isMappable), [properties]);

  const placed = useMemo<readonly PlacedProperty[]>(() => {
    if (size === null || mappable.length === 0) {
      return [];
    }

    const projected = projectGeoPoints(
      mappable.map((property) => ({
        longitude: property.location.publicLongitude,
        latitude: property.location.publicLatitude,
      })),
      { padding, aspect: size.width / size.height },
    );

    /*
      Into pixels, then fan out anything co-located.

      The fan is not a nicety. A property whose location visibility is `suburb`
      publishes its suburb's reference position rather than its own, so every
      such home in Craigieburn resolves to one identical coordinate. Without this
      they stack into a single marker and the map silently under-reports the
      portfolio: three homes, one pin, no indication the other two exist.

      Mapbox solves this with clustering and a count bubble. Fanning is the better
      answer here because the numbers are small and a visitor can then click each
      home directly instead of zooming to break a cluster apart.
    */
    const pixels = projected.map((point) => ({
      x: point.x * size.width,
      y: point.y * size.height,
    }));

    /* Computed once for the whole set, not per marker. */
    const separated = separateOverlapping(pixels, MARKER_SEPARATION);

    return mappable.map((property, index) => ({
      property,
      point: separated[index],
    }));
  }, [mappable, size, padding]);

  /*
    Zones are drawn around the suburb centroids rather than around every home,
    and the radius grows with the number of homes so a suburb with more activity
    reads as a larger presence on the corridor.
  */
  const zones = useMemo<readonly SuburbZone[]>(() => {
    const groups = new Map<string, PlacedProperty[]>();

    for (const entry of placed) {
      const existing = groups.get(entry.property.suburb);

      if (existing) {
        existing.push(entry);
      } else {
        groups.set(entry.property.suburb, [entry]);
      }
    }

    return [...groups.entries()]
      .map(([name, entries]) => {
        const centre = {
          x: average(entries.map((entry) => entry.point.x)),
          y: average(entries.map((entry) => entry.point.y)),
        };

        /*
          Big enough to contain every home in the suburb plus a marker's radius,
          with a floor so a single-home suburb still reads as a place.
        */
        const reach = Math.max(
          ...entries.map((entry) => distance(entry.point, centre)),
        );

        return {
          name,
          count: entries.length,
          point: centre,
          radius: Math.max(46, reach + MARKER_SEPARATION * 0.8),
        };
      })
      /* North to south, which is how the corridor reads on any other map. */
      .sort((a, b) => a.point.y - b.point.y);
  }, [placed]);

  /*
    The spine threads the suburb centroids, not every home. Threading every pin
    produces a scribble; the suburbs are what the corridor actually is.
  */
  const spinePath = useMemo(
    () => smoothPathThrough(zones.map((zone) => zone.point)),
    [zones],
  );

  const selected = useMemo(
    () => placed.find((entry) => entry.property.id === selectedId) ?? null,
    [placed, selectedId],
  );

  const changeHover = useCallback(
    (id: string | null) => {
      setHoveredId(id);
      onHover?.(id);
    },
    [onHover],
  );

  const handleBackgroundClick = useCallback(() => {
    onSelect(null);
  }, [onSelect]);

  const hasResults = placed.length > 0;
  const isReady = size !== null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "bg-background-alt relative isolate h-full w-full overflow-hidden",
        className,
      )}
    >
      {/*
        Backdrop. The blueprint grid is an existing utility and is the right
        reference: this is a survey drawing of the corridor, so it should look
        like one rather than imitate a satellite photograph it does not have.
      */}
      <div aria-hidden="true" className="absolute inset-0">
        <div className="blueprint-grid absolute inset-0 opacity-60" />
        <div className="bg-accent/10 absolute top-[-30%] left-1/2 size-[130%] -translate-x-1/2 rounded-full blur-[130px]" />
        <div className="to-background/80 absolute inset-0 bg-gradient-to-b from-transparent" />
      </div>

      {/*
        A background click clears the selection, matching the Mapbox map. A plain
        div rather than a button: it is a target of last resort, the same action
        is reachable by Escape and by the panel's close control, and announcing
        "clear selection, button" over the entire map would be worse than silence.
      */}
      <div
        aria-hidden="true"
        onClick={handleBackgroundClick}
        className="absolute inset-0"
      />

      {isReady ? (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
        >
          {zones.map((zone, index) => (
            <g
              key={zone.name}
              className="corridor-zone"
              style={
                { "--enter-delay": `${index * 0.12}s` } as React.CSSProperties
              }
            >
              <circle
                cx={zone.point.x}
                cy={zone.point.y}
                r={zone.radius}
                className="fill-accent/6 stroke-accent/25"
                strokeWidth="1"
              />
              {/* An inner ring, so a zone reads as a surveyed area rather than a blob. */}
              <circle
                cx={zone.point.x}
                cy={zone.point.y}
                r={zone.radius * 0.62}
                className="stroke-accent/12"
                strokeWidth="1"
                strokeDasharray="3 5"
              />
            </g>
          ))}

          {spinePath && zones.length > 1 ? (
            <>
              {/* A soft underlay, so the spine reads as lit rather than drawn on. */}
              <path
                d={spinePath}
                pathLength="1"
                className="corridor-spine stroke-accent/25"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="1"
              />
              <path
                d={spinePath}
                pathLength="1"
                className="corridor-spine stroke-accent/70"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeDasharray="1"
              />
            </>
          ) : null}

          {/*
            Dimension lines to the selected home. This is the signature moment: an
            architect ruling guides out to the edges of a sheet to fix a position.
            It reads as measurement rather than decoration, which is the right
            register for a builder, and it is something no tile map gives for free.
          */}
          {selected ? (
            <g className="corridor-guides stroke-accent/45" strokeWidth="1">
              <path
                d={`M0 ${selected.point.y}H${size.width}`}
                strokeDasharray="2 4"
              />
              <path
                d={`M${selected.point.x} 0V${size.height}`}
                strokeDasharray="2 4"
              />
            </g>
          ) : null}
        </svg>
      ) : null}

      {/*
        Suburb names, as HTML so they inherit the type scale rather than SVG text
        defaults. Positioned below the zone's real radius, which is why the radius
        is computed rather than assumed: with a fixed offset the label landed
        inside the zone and printed over the markers.
      */}
      {zones.map((zone, index) => (
        <p
          key={zone.name}
          aria-hidden="true"
          className="corridor-zone-label text-foreground-subtle text-label tracking-label pointer-events-none absolute -translate-x-1/2 uppercase"
          style={
            {
              left: zone.point.x,
              top: zone.point.y + zone.radius + 10,
              "--enter-delay": `${0.2 + index * 0.12}s`,
            } as React.CSSProperties
          }
        >
          {zone.name}
        </p>
      ))}

      {/*
        Markers. A list, because that is what this is: every home, in one place.
        Screen readers get "list, N items" and can walk it, which the canvas
        sprites of a tile map cannot offer at all.

        Keyed on `resetToken` so bumping it remounts the layer and replays the
        entrance. That is what "reset map view" means when there is no camera.
      */}
      {hasResults ? (
        <ul
          key={resetToken}
          className="absolute inset-0 list-none"
          aria-label="Homes across the corridor"
        >
          {placed.map((entry, index) => (
            <CorridorMarker
              key={entry.property.id}
              entry={entry}
              index={index}
              isSelected={entry.property.id === selectedId}
              isHovered={entry.property.id === hoveredId}
              isDimmed={
                (selectedId !== null || hoveredId !== null) &&
                entry.property.id !== selectedId &&
                entry.property.id !== hoveredId
              }
              onSelect={onSelect}
              onHoverChange={changeHover}
            />
          ))}
        </ul>
      ) : null}

      {isReady && !hasResults ? (
        <p className="text-foreground-muted absolute inset-0 grid place-items-center px-8 text-center text-sm">
          No home in this filter has a published position. Every one of them is
          still listed as text.
        </p>
      ) : null}

      {showLegend ? <CorridorLegend /> : null}

      <p className="text-foreground-subtle text-label tracking-label pointer-events-none absolute right-4 bottom-3 uppercase opacity-70">
        {reason === "error"
          ? "Schematic view"
          : "Relative positions, not a street map"}
      </p>
    </div>
  );
}

/**
 * One home.
 *
 * Two nested elements on purpose. The outer `li` owns the position and the
 * entrance animation; the inner button owns the hover and press scaling. Both
 * write `transform`, so on one element the entrance and the hover overwrite each
 * other and the marker either jumps to full size mid-entrance or never centres.
 *
 * The marker carries two independent signals, which is why it is a ring around a
 * glyph rather than a single symbol: the house silhouette says what kind of home
 * it is, the ring colour says what stage it is at. Collapsing them would mean
 * twelve icons instead of seven, and colour alone would carry the status, which
 * `property-status.ts` deliberately avoids.
 */
function CorridorMarker({
  entry,
  index,
  isSelected,
  isHovered,
  isDimmed,
  onSelect,
  onHoverChange,
}: {
  entry: PlacedProperty;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  isDimmed: boolean;
  onSelect: (id: string | null) => void;
  onHoverChange: (id: string | null) => void;
}) {
  const { property, point } = entry;
  const status = propertyStatusTokens[property.status];
  const houseType = houseTypeTokens[property.placeholderVariant];
  const isAvailable = property.status === "move-in-ready";
  const showLabel = isSelected || isHovered;

  return (
    <li
      className="corridor-marker absolute"
      style={
        {
          left: point.x,
          top: point.y,
          "--enter-delay": `${MARKER_BASE_DELAY_SECONDS + index * MARKER_STAGGER_SECONDS}s`,
          /* Selected and hovered markers rise so their label is never printed under a neighbour. */
          zIndex: isSelected ? 30 : isHovered ? 20 : 10,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={(event) => {
          /* The backdrop clears the selection; without this a marker click would select then deselect. */
          event.stopPropagation();
          onSelect(property.id);
        }}
        onPointerEnter={() => onHoverChange(property.id)}
        onPointerLeave={() => onHoverChange(null)}
        /*
          Focus reports hover too, so tabbing through the homes drives the
          homepage heading exactly the way pointing at them does. A keyboard
          visitor gets the same feedback loop rather than a lesser one.
        */
        onFocus={() => onHoverChange(property.id)}
        onBlur={() => onHoverChange(null)}
        className={cn(
          "focus-visible:ring-ring group relative grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full transition-[transform,opacity] duration-(--duration-hover) ease-luxe focus-visible:ring-2 focus-visible:outline-none",
          /*
            The entrance above is cinematic because it happens once. This is a
            hover, triggered dozens of times while scanning, so it stays inside
            200ms and moves a long way less.
          */
          "motion-safe:hover:scale-110 motion-safe:focus-visible:scale-110",
          isSelected && "motion-safe:scale-110",
          /* Dimming the rest is what makes one marker readable on a dense map. */
          isDimmed && "opacity-40",
        )}
      >
        <span className="sr-only">
          {property.name}, {houseType.label}, {status.label} in{" "}
          {property.suburb}
        </span>

        {/* Availability pulse. Infinite, but it reports a real state: this home can be walked through today. */}
        {isAvailable ? (
          <span
            aria-hidden="true"
            className={cn(
              "corridor-pulse absolute size-8 rounded-full",
              status.swatchClassName,
            )}
          />
        ) : null}

        {/* The status ring, and the disc that keeps the glyph legible over the grid. */}
        <span
          aria-hidden="true"
          className={cn(
            "bg-background/85 absolute size-8 rounded-full border-2 border-current backdrop-blur-sm transition-[box-shadow,color] duration-(--duration-hover)",
            isSelected ? "text-accent shadow-accent" : status.textClassName,
          )}
        />

        <HouseTypeGlyph
          variant={property.placeholderVariant}
          className={cn(
            "text-foreground relative size-[1.05rem] transition-colors duration-(--duration-hover)",
            isSelected && "text-accent",
          )}
        />
      </button>

      {/*
        The label. Present only while the marker is hovered, focused or selected,
        because ten permanent labels on a map this size overlap into noise. It is
        `aria-hidden` and the button already carries the same text in an `sr-only`
        span, so nothing is lost when it is absent.
      */}
      <span
        aria-hidden="true"
        className={cn(
          "border-border bg-surface-overlay text-foreground text-label tracking-label pointer-events-none absolute top-1/2 left-1/2 mt-6 -translate-x-1/2 rounded-full border px-2.5 py-1 whitespace-nowrap uppercase backdrop-blur-md transition-opacity duration-(--duration-hover)",
          showLabel ? "opacity-100" : "opacity-0",
        )}
      >
        {property.name}
      </span>
    </li>
  );
}

/**
 * The key.
 *
 * It explains the house shapes rather than the status colours, which is the
 * opposite of what `MapLegend` does for the Mapbox map. Deliberate: the status
 * colours are already spelled out by the status rail on the homepage and by the
 * filter pills on the properties page, whereas the house silhouettes are new and
 * are the thing a visitor has to be taught once.
 */
function CorridorLegend() {
  return (
    <div className="border-border bg-surface-overlay pointer-events-none absolute top-4 left-4 hidden rounded-lg border p-3 backdrop-blur-md sm:block">
      <p className="text-foreground-subtle text-label tracking-label uppercase">
        Home types
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {Object.values(houseTypeTokens).map((token) => (
          <li
            key={token.variant}
            className="text-foreground-muted flex items-center gap-2 text-xs"
          >
            <HouseTypeGlyph
              variant={token.variant}
              className="text-foreground size-4"
            />
            {token.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
