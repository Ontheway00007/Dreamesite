"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrowDown, ArrowRight, List } from "lucide-react";

import { PropertyMapFallback } from "@/components/map/property-map-fallback";
import { PropertyMapLoader } from "@/components/map/property-map-loader";
import { propertyStatusTokens } from "@/lib/design/property-status";
import type { PortfolioSummary } from "@/lib/properties/portfolio-summary";
import { PROPERTIES_ROUTE, propertyHref } from "@/lib/routes";
import { cn } from "@/lib/utils/cn";
import type { Property, PropertyStatus } from "@/types";

import { MapPropertyPanel } from "@/components/home/map-property-panel";

export interface MapStageProps {
  properties: readonly Property[];
  summary: PortfolioSummary;
  /** Null when Mapbox is not configured; the stage then shows the fallback. */
  token: string | null;
}

/**
 * The opening experience: the map is the first viewport, and the navigation.
 *
 * ## Why the map is the page rather than a section in it
 *
 * A builder's portfolio is a geographic fact before it is a list. Where they
 * build, how much of it there is, and what stage each home is at are all
 * spatial questions, and a map answers them in one glance where a card grid
 * needs a paragraph of explanation. So this occupies the first screen and the
 * supporting sections below it elaborate rather than introduce.
 *
 * ## What is deliberately restrained
 *
 * The overlay covers as little of the map as it can. Brand block top-left,
 * status rail bottom-left, selected property to the right on desktop and from
 * the bottom edge on mobile. Nothing is centred over the middle of the map,
 * because the middle is where the properties are.
 *
 * ## Accessibility
 *
 * The map is not the only way through. Every published property is present as
 * a real link in the "Browse as a list" disclosure, which is a visible control
 * rather than a screen-reader-only one — a hidden focusable list moves focus
 * somewhere a sighted keyboard user cannot see. Selection changes are announced
 * politely, and the status rail is a group of real buttons with pressed state.
 */
export function MapStage({ properties, summary, token }: MapStageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | null>(null);
  const [resetToken, setResetToken] = useState(0);

  const visibleProperties = useMemo(
    () =>
      statusFilter === null
        ? properties
        : properties.filter((property) => property.status === statusFilter),
    [properties, statusFilter],
  );

  /*
    Resolved against the *visible* set, not the whole catalogue.

    A status filter that hides the selected property therefore hides its panel
    as a consequence of the same derivation, rather than through an effect that
    notices afterwards and clears the id. The id itself is left alone, so
    clearing the filter brings the selection back — which is what someone who
    filtered to look around and then filtered back would expect.
  */
  const selected = useMemo(
    () => visibleProperties.find((property) => property.id === selectedId) ?? null,
    [visibleProperties, selectedId],
  );

  const handleStatusToggle = useCallback((status: PropertyStatus) => {
    setStatusFilter((current) => (current === status ? null : status));
    // Re-fit the camera to whatever is now showing.
    setResetToken((value) => value + 1);
  }, []);

  const handleClose = useCallback(() => setSelectedId(null), []);

  /*
    Escape closes the preview, which is the expectation for any overlay.

    `setSelectedId` is a stable setter, so the listener needs no dependencies and
    no ref: binding once for the lifetime of the stage is correct.
  */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const hasProperties = properties.length > 0;

  return (
    <section
      aria-labelledby="map-stage-heading"
      className="relative isolate h-[100svh] min-h-[36rem] w-full overflow-hidden"
    >
      {/* ---------------------------------------------------------------- */}
      {/* The map itself, filling the stage.                               */}
      {/* ---------------------------------------------------------------- */}
      <div className="absolute inset-0">
        {token === null ? (
          <PropertyMapFallback reason="no-token" className="rounded-none" />
        ) : (
          <PropertyMapLoader
            properties={visibleProperties}
            token={token}
            /* The resolved selection, so the map never holds a filtered-out id. */
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            resetToken={resetToken}
            className="h-full w-full"
          />
        )}
      </div>

      {/*
        A vignette so overlaid type stays readable over bright satellite or
        label-dense areas, without dimming the map as a whole. Pointer events
        off so it never intercepts a drag.
      */}
      <div
        aria-hidden="true"
        className="from-background/85 via-background/20 to-background/70 pointer-events-none absolute inset-0 bg-gradient-to-b"
      />
      <div
        aria-hidden="true"
        className="from-background/80 pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r to-transparent lg:w-2/3"
      />

      {/* ---------------------------------------------------------------- */}
      {/* Brand block — compact, top-left, never centred over the map.     */}
      {/* ---------------------------------------------------------------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 px-5 pt-[calc(var(--header-height)+1.5rem)] sm:px-8 lg:px-12">
        <div className="pointer-events-auto max-w-md">
          <h1
            id="map-stage-heading"
            className="font-display text-foreground text-[clamp(2.1rem,5vw,3.4rem)] leading-[0.98] tracking-[-0.02em]"
          >
            Every home.
            <br />
            Every stage.
            <br />
            <span className="text-foreground-muted">One map.</span>
          </h1>

          {/*
            Shorter on small screens. The brief is explicit that text must not
            cover most of the map, and the longer sentence costs three lines at
            390px where it costs one at desktop width.
          */}
          <p className="text-foreground-muted mt-4 max-w-sm text-sm leading-relaxed sm:mt-5 sm:text-base">
            <span className="sm:hidden">
              {hasProperties
                ? "Every home we have on the ground, marked with the stage it is at."
                : "Homes appear here as each one is published."}
            </span>
            <span className="hidden sm:inline">
              {hasProperties
                ? "Dreame builds in Melbourne’s northern growth corridor. Every home we have on the ground is on this map, marked with the stage it is actually at."
                : "Dreame builds in Melbourne’s northern growth corridor. Homes appear on this map as each one is published."}
            </span>
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 sm:mt-6">
            <a
              href={`${PROPERTIES_ROUTE}?status=move-in-ready`}
              className="focus-visible:ring-ring bg-foreground text-foreground-inverse hover:bg-accent-strong group inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              See what is available
              <ArrowRight
                className="size-4 transition-transform motion-safe:group-hover:translate-x-1"
                aria-hidden="true"
              />
            </a>
            <a
              href={PROPERTIES_ROUTE}
              className="focus-visible:ring-ring border-border-strong text-foreground hover:border-foreground hover:bg-surface/60 inline-flex items-center gap-2 rounded-lg border px-5 py-3 text-sm font-medium backdrop-blur-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              All projects
            </a>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Status rail — part of the map interface, not four cards.         */}
      {/* ---------------------------------------------------------------- */}
      <div className="absolute inset-x-0 bottom-0 px-5 pb-6 sm:px-8 lg:px-12 lg:pb-8">
        <div className="flex flex-col gap-4">
          <StatusRail
            summary={summary}
            active={statusFilter}
            onToggle={handleStatusToggle}
            disabled={!hasProperties}
          />

          <div className="flex items-center justify-between gap-4">
            <PropertyDisclosure properties={properties} />

            {hasProperties ? (
              <p
                aria-hidden="true"
                className="text-foreground-subtle hidden items-center gap-2 text-xs tracking-[0.18em] uppercase sm:flex"
              >
                Scroll
                <ArrowDown className="size-3.5 motion-safe:animate-bounce" />
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Selected property.                                               */}
      {/* ---------------------------------------------------------------- */}

      {/* Desktop: a column against the right edge. */}
      {selected ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden items-center px-8 lg:flex lg:px-12">
          <MapPropertyPanel
            key={selected.id}
            property={selected}
            onClose={handleClose}
            variant="panel"
            className="pointer-events-auto w-[26rem] motion-safe:animate-[map-panel-in_420ms_var(--ease-entrance)_both]"
          />
        </div>
      ) : null}

      {/* Mobile and tablet: rises from the bottom edge. */}
      {selected ? (
        <div className="absolute inset-x-0 bottom-0 lg:hidden">
          <MapPropertyPanel
            key={selected.id}
            property={selected}
            onClose={handleClose}
            variant="sheet"
            className="motion-safe:animate-[map-sheet-in_360ms_var(--ease-entrance)_both]"
          />
        </div>
      ) : null}

      {/* Selection is announced rather than left to visual change alone. */}
      <p aria-live="polite" className="sr-only">
        {selected
          ? `${selected.name} selected. ${propertyStatusTokens[selected.status].label} in ${selected.suburb}.`
          : "No property selected."}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

interface StatusRailProps {
  summary: PortfolioSummary;
  active: PropertyStatus | null;
  onToggle: (status: PropertyStatus) => void;
  disabled: boolean;
}

/**
 * The live portfolio summary, as a filter control.
 *
 * Presented as one continuous rail rather than four separate cards, so it reads
 * as part of the map's interface. Counts come from published records; a status
 * with none is shown at zero and disabled, because "nothing under construction
 * right now" is worth knowing and quietly hiding it would overstate the
 * portfolio.
 */
function StatusRail({ summary, active, onToggle, disabled }: StatusRailProps) {
  return (
    /*
      The rail scrolls horizontally when four statuses will not fit — a 390px
      viewport cannot show them all. The scrollbar is hidden and a fade is drawn
      over the trailing edge instead, so a clipped item reads as "there is more
      this way" rather than as a broken layout. `snap-x` makes the scroll land on
      whole items.
    */
    <div className="relative w-full sm:w-auto sm:self-start">
      <div
        role="group"
        aria-label="Filter the map by build stage"
        className="border-border bg-surface/80 shadow-raised flex w-full snap-x gap-1 overflow-x-auto rounded-xl border p-1 backdrop-blur-xl [-ms-overflow-style:none] [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden"
      >
        {summary.statuses.map(({ status, count }) => {
        const token = propertyStatusTokens[status];
        const isActive = active === status;
        const isEmpty = count === 0;

          return (
            <button
              key={status}
              type="button"
              onClick={() => onToggle(status)}
              disabled={disabled || isEmpty}
              aria-pressed={isActive}
              title={token.description}
              className={cn(
                "focus-visible:ring-ring group flex shrink-0 snap-start items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none sm:gap-2.5 sm:px-3.5 sm:py-2.5",
                isActive ? "bg-foreground/10" : "hover:bg-foreground/5",
                (disabled || isEmpty) && "cursor-not-allowed opacity-45",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  token.swatchClassName,
                )}
              />
              <span className="flex flex-col leading-tight">
                <span className="text-foreground text-sm font-medium tabular-nums">
                  {count}
                </span>
                <span className="text-foreground-subtle text-[0.68rem] whitespace-nowrap sm:text-[0.7rem]">
                  {token.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Trailing fade, mobile only — the rail fits from `sm` up. */}
      <div
        aria-hidden="true"
        className="from-surface pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-xl bg-gradient-to-l to-transparent sm:hidden"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Non-map access to every published property, on this page.
 *
 * A visible disclosure rather than a screen-reader-only list: keyboard users
 * who can see the screen need to know where focus has gone, and `sr-only`
 * links move it somewhere invisible. Closed by default so it does not compete
 * with the map.
 */
function PropertyDisclosure({
  properties,
}: {
  properties: readonly Property[];
}) {
  if (properties.length === 0) {
    return null;
  }

  return (
    <details className="border-border bg-surface/80 group max-w-full rounded-xl border backdrop-blur-xl">
      <summary className="focus-visible:ring-ring text-foreground-muted hover:text-foreground flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-xs tracking-[0.14em] uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none">
        <List className="size-3.5" aria-hidden="true" />
        Browse as a list
      </summary>
      <ul className="border-border max-h-56 overflow-y-auto border-t p-2">
        {properties.map((property) => (
          <li key={property.id}>
            <a
              href={propertyHref(property.slug)}
              className="focus-visible:ring-ring hover:bg-foreground/5 flex items-center justify-between gap-4 rounded-lg px-2.5 py-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="text-foreground text-sm">{property.name}</span>
              <span className="text-foreground-subtle shrink-0 text-xs">
                {property.suburb} ·{" "}
                {propertyStatusTokens[property.status].label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
