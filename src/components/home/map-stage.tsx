"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrowRight, ArrowUpRight, List } from "lucide-react";

import { MapPropertyPanel } from "@/components/home/map-property-panel";
import { PropertyMapFallback } from "@/components/map/property-map-fallback";
import { PropertyMapLoader } from "@/components/map/property-map-loader";
import { StatusGlyph } from "@/components/map/status-glyph";
import { propertyStatusTokens } from "@/lib/design/property-status";
import type { PortfolioSummary } from "@/lib/properties/portfolio-summary";
import { PROPERTIES_ROUTE, propertyHref } from "@/lib/routes";
import { serviceAreas } from "@/lib/site-config";
import { cn } from "@/lib/utils/cn";
import type { Property, PropertyStatus } from "@/types";

export interface MapStageProps {
  properties: readonly Property[];
  summary: PortfolioSummary;
  token: string | null;
}

/**
 * A living build atlas rather than a conventional hero banner. Copy and map
 * share the first viewport, so place, portfolio and brand story arrive as one
 * composition. The property list remains available beside the visual map.
 */
export function MapStage({ properties, summary, token }: MapStageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [hoveredPropertyId, setHoveredPropertyId] = useState<string | null>(null);

  const visibleProperties = useMemo(
    () =>
      statusFilter === null
        ? properties
        : properties.filter((property) => property.status === statusFilter),
    [properties, statusFilter],
  );

  const selected = useMemo(
    () => visibleProperties.find((property) => property.id === selectedId) ?? null,
    [visibleProperties, selectedId],
  );

  const hoveredProperty = useMemo(
    () =>
      hoveredPropertyId
        ? properties.find((property) => property.id === hoveredPropertyId) ?? null
        : null,
    [hoveredPropertyId, properties],
  );

  const handleStatusToggle = useCallback((status: PropertyStatus) => {
    setStatusFilter((current) => (current === status ? null : status));
    setResetToken((value) => value + 1);
  }, []);

  const handleClose = useCallback(() => setSelectedId(null), []);

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
      className="bg-background relative isolate min-h-[52rem] w-full overflow-hidden pt-[calc(var(--header-height)+2.5rem)] lg:h-[100svh] lg:min-h-[49rem] lg:pt-[calc(var(--header-height)+1.5rem)]"
    >
      <div
        aria-hidden="true"
        className="outline-type pointer-events-none absolute -top-3 -left-5 font-display text-[clamp(9rem,23vw,26rem)] leading-none tracking-[-0.07em] opacity-45"
      >
        NORTH
      </div>
      <div
        aria-hidden="true"
        className="orbit-drift bg-accent absolute top-[16%] -right-24 size-72 rounded-full opacity-[0.12] blur-3xl lg:size-[30rem]"
      />
      <div
        aria-hidden="true"
        className="border-accent-secondary/35 absolute -bottom-48 -left-40 size-[34rem] rounded-full border"
      />

      <div className="relative mx-auto grid w-full max-w-[120rem] gap-12 px-5 pb-10 sm:px-8 lg:h-[calc(100%-1rem)] lg:grid-cols-12 lg:items-stretch lg:gap-8 lg:px-12">
        <div className="relative z-10 flex flex-col justify-between lg:col-span-5 lg:py-10">
          <div>
            <p className="editorial-kicker text-accent">
              Melbourne&apos;s northern corridor
            </p>
            <h1
              id="map-stage-heading"
              className={cn(
                "font-display text-foreground mt-8 max-w-3xl text-[clamp(4rem,8vw,8.2rem)] leading-[0.8] tracking-[-0.05em] transition-[opacity,transform] duration-700",
                hoveredProperty && "opacity-[0.72] lg:-translate-y-2",
              )}
            >
              Homes that
              <span className="block pl-[0.55em] italic">belong here.</span>
              <span className="text-accent mt-5 block font-sans text-[0.15em] leading-none font-semibold tracking-[0.14em] uppercase">
                {hoveredProperty ? hoveredProperty.name : "Land → line → life"}
              </span>
            </h1>

            <p className="text-foreground-muted mt-8 max-w-md text-base leading-relaxed lg:mt-10 lg:text-lg">
              {hasProperties
                ? "A living atlas of the homes we are building, finishing and handing over across Melbourne’s north."
                : "Our northern Melbourne portfolio will appear here as each home is approved for publication."}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={`${PROPERTIES_ROUTE}?status=move-in-ready`}
                className="focus-visible:ring-ring bg-accent text-accent-foreground hover:bg-accent-strong group inline-flex min-h-13 items-center gap-3 rounded-[0.45rem_1.5rem_1.5rem_1.5rem] px-6 text-xs font-semibold tracking-[0.11em] uppercase shadow-accent transition-[background-color,transform] focus-visible:ring-2 focus-visible:outline-none motion-safe:hover:-translate-y-1"
              >
                Available homes
                <ArrowUpRight
                  className="size-4 transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
              <a
                href={PROPERTIES_ROUTE}
                className="focus-visible:ring-ring border-border-strong text-foreground hover:border-accent group inline-flex min-h-13 items-center gap-3 rounded-[1.5rem_0.45rem_1.5rem_1.5rem] border px-6 text-xs font-semibold tracking-[0.11em] uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                Explore the atlas
                <ArrowRight
                  className="size-4 transition-transform motion-safe:group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </a>
            </div>
          </div>

          <div className="border-border mt-12 grid grid-cols-2 gap-6 border-t pt-5 lg:mt-8">
            <div>
              <p className="font-display text-3xl leading-none">{summary.total}</p>
              <p className="text-foreground-subtle mt-1 text-[0.58rem] font-semibold tracking-[0.16em] uppercase">
                Published homes
              </p>
            </div>
            <div>
              <p className="font-display text-3xl leading-none">
                {String(serviceAreas.length).padStart(2, "0")}
              </p>
              <p className="text-foreground-subtle mt-1 text-[0.58rem] font-semibold tracking-[0.16em] uppercase">
                Build areas
              </p>
            </div>
          </div>
        </div>

        <div className="relative min-h-[34rem] lg:col-span-7 lg:min-h-0">
          <div className="map-portal border-border-strong bg-surface relative h-full min-h-[34rem] overflow-hidden border shadow-raised">
            {token === null ? (
              <PropertyMapFallback reason="no-token" className="rounded-none" />
            ) : (
              <PropertyMapLoader
                properties={visibleProperties}
                token={token}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                onHover={setHoveredPropertyId}
                resetToken={resetToken}
                showLegend={false}
                controlPosition="top-right"
                className="h-full w-full"
              />
            )}

            <div
              aria-hidden="true"
              className="from-background/35 pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent"
            />

            <div className="paper-glass border-border absolute top-5 left-5 flex items-center gap-3 rounded-full border px-4 py-2 shadow-soft sm:top-7 sm:left-7">
              <span
                aria-hidden="true"
                className="atlas-pulse bg-status-move-in-ready block size-2 rounded-full"
              />
              <span className="text-[0.6rem] font-bold tracking-[0.18em] uppercase">
                Live build atlas
              </span>
            </div>

            <div className="absolute right-5 bottom-5 left-5 sm:right-7 sm:bottom-7 sm:left-7">
              <StatusRail
                summary={summary}
                active={statusFilter}
                onToggle={handleStatusToggle}
                disabled={!hasProperties}
              />
            </div>

            <div className="absolute top-5 right-16 sm:top-7 sm:right-20">
              <PropertyDisclosure properties={properties} />
            </div>

            {selected ? (
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden items-center pr-6 xl:flex">
                <MapPropertyPanel
                  key={selected.id}
                  property={selected}
                  onClose={handleClose}
                  variant="panel"
                  className="pointer-events-auto w-[23rem] motion-safe:animate-[map-panel-in_420ms_var(--ease-entrance)_both]"
                />
              </div>
            ) : null}

            {selected ? (
              <div className="absolute inset-x-0 bottom-0 xl:hidden">
                <MapPropertyPanel
                  key={selected.id}
                  property={selected}
                  onClose={handleClose}
                  variant="sheet"
                  className="motion-safe:animate-[map-sheet-in_360ms_var(--ease-entrance)_both]"
                />
              </div>
            ) : null}
          </div>

          <div
            aria-hidden="true"
            className="bg-accent absolute -right-3 -bottom-3 -z-10 h-[72%] w-[68%] opacity-70"
          />
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {selected
          ? `${selected.name} selected. ${propertyStatusTokens[selected.status].label} in ${selected.suburb}.`
          : "No property selected."}
      </p>
    </section>
  );
}

interface StatusRailProps {
  summary: PortfolioSummary;
  active: PropertyStatus | null;
  onToggle: (status: PropertyStatus) => void;
  disabled: boolean;
}

function StatusRail({ summary, active, onToggle, disabled }: StatusRailProps) {
  return (
    <div className="relative w-full">
      <div
        role="group"
        aria-label="Filter the map by build stage"
        className="paper-glass border-border shadow-raised flex w-full snap-x gap-1 overflow-x-auto rounded-[0.55rem_1.4rem_1.4rem_1.4rem] border p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                "focus-visible:ring-ring group flex min-w-[8.5rem] flex-1 shrink-0 snap-start items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-[background-color,transform] focus-visible:ring-2 focus-visible:outline-none",
                isActive ? "bg-accent-soft" : "hover:bg-foreground/5",
                !(disabled || isEmpty) && "motion-safe:hover:-translate-y-0.5",
                (disabled || isEmpty) && "cursor-not-allowed opacity-40",
              )}
            >
              <StatusGlyph status={status} className={token.textClassName} />
              <span className="flex flex-col leading-tight">
                <span className="text-foreground text-sm font-semibold tabular-nums">
                  {count}
                </span>
                <span className="text-foreground-subtle text-[0.64rem] whitespace-nowrap">
                  {token.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        aria-hidden="true"
        className="from-surface-raised pointer-events-none absolute inset-y-0 right-0 w-9 rounded-r-2xl bg-gradient-to-l to-transparent sm:hidden"
      />
    </div>
  );
}

function PropertyDisclosure({
  properties,
}: {
  properties: readonly Property[];
}) {
  if (properties.length === 0) {
    return null;
  }

  return (
    <details className="paper-glass border-border group max-w-full rounded-full border shadow-soft">
      <summary className="focus-visible:ring-ring text-foreground-muted hover:text-foreground flex cursor-pointer list-none items-center gap-2 rounded-full px-3.5 py-2.5 text-[0.6rem] font-bold tracking-[0.14em] uppercase transition-colors focus-visible:ring-2 focus-visible:outline-none">
        <List className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Browse</span>
      </summary>
      <ul className="paper-glass border-border absolute top-[calc(100%+0.5rem)] right-0 max-h-64 w-[min(22rem,80vw)] overflow-y-auto rounded-2xl border p-2 shadow-raised">
        {properties.map((property) => (
          <li key={property.id}>
            <a
              href={propertyHref(property.slug)}
              className="focus-visible:ring-ring hover:bg-foreground/5 flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="text-foreground text-sm">{property.name}</span>
              <span className="text-foreground-subtle shrink-0 text-[0.65rem]">
                {property.suburb} · {propertyStatusTokens[property.status].label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
