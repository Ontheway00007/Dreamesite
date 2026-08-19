"use client";

import { useCallback, useMemo, useState } from "react";

import { RotateCcw } from "lucide-react";

import { PropertyMapFallback } from "@/components/map/property-map-fallback";
import { PropertyMapLoader } from "@/components/map/property-map-loader";
import { MobilePropertySheet } from "@/components/property/mobile-property-sheet";
import { PropertyFilterSheet } from "@/components/property/property-filter-sheet";
import { PropertyFilters } from "@/components/property/property-filters";
import { PropertyList } from "@/components/property/property-list";
import { PropertyPreview } from "@/components/property/property-preview";
import { ViewModeToggle } from "@/components/property/view-mode-toggle";
import { usePropertyFilters } from "@/hooks/use-property-filters";
import { countMappable } from "@/lib/map/geojson";
import { getMapboxToken } from "@/lib/map/map-config";
import { filterProperties, suburbOptions } from "@/lib/properties/filters";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

export interface PropertyExplorerProps {
  properties: readonly Property[];
}

function resultLabel(count: number): string {
  return `${count} ${count === 1 ? "home" : "homes"}`;
}

/**
 * The interactive half of the properties page.
 *
 * State is deliberately small: filters and the view mode live in the URL, the
 * selected property is local, and everything else is derived. There is one
 * filtering pipeline, and its result feeds the list, the count and the map, so
 * the three can never disagree. Because the selection is derived from the
 * filtered list, a property that gets filtered out is deselected automatically.
 */
export function PropertyExplorer({ properties }: PropertyExplorerProps) {
  const suburbs = useMemo(() => suburbOptions(properties), [properties]);
  const { filters, view, initialPropertySlug, setFilter, setView, reset } =
    usePropertyFilters(suburbs);

  // A property page can link here with `?property=<slug>` to open that home.
  const [selectedId, setSelectedId] = useState<string | null>(
    () =>
      properties.find((property) => property.slug === initialPropertySlug)?.id ??
      null,
  );
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);

  const filtered = useMemo(
    () => filterProperties(properties, filters),
    [properties, filters],
  );

  const selected = useMemo(
    () => filtered.find((property) => property.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  const mappableCount = useMemo(() => countMappable(filtered), [filtered]);
  const token = getMapboxToken();

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const handleReset = useCallback(() => {
    reset();
    setSelectedId(null);
  }, [reset]);

  const label = resultLabel(filtered.length);
  const hiddenFromMap = filtered.length - mappableCount;

  return (
    <div className="pb-24">
      <div className="paper-glass border-border-strong sticky top-[calc(var(--header-height)+0.75rem)] z-30 rounded-[0.55rem_1.6rem_1.6rem_1.6rem] border p-4 shadow-raised lg:p-5">
        <PropertyFilters
          filters={filters}
          suburbs={suburbs}
          onChange={setFilter}
          onReset={handleReset}
          className="hidden lg:flex"
        />

        <div className="flex flex-wrap items-center justify-between gap-4 lg:hidden">
          <PropertyFilterSheet
            isOpen={isFilterSheetOpen}
            onOpenChange={setIsFilterSheetOpen}
            resultLabel={label}
            filters={filters}
            suburbs={suburbs}
            onChange={setFilter}
            onReset={handleReset}
          />
          <ViewModeToggle value={view} onChange={setView} />
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-4 py-7">
        {/* Announced politely: results and selection, never camera movement. */}
        <p aria-live="polite" className="text-foreground-muted text-sm">
          <span className="text-foreground font-medium">{label}</span>
          {hiddenFromMap > 0
            ? ` · ${hiddenFromMap} without a published location`
            : null}
          {selected ? ` · ${selected.name} selected` : null}
        </p>

        <button
          type="button"
          onClick={() => setResetToken((value) => value + 1)}
          className="text-foreground-subtle hover:text-foreground hidden items-center gap-2 text-xs font-medium tracking-[0.16em] uppercase transition-colors duration-(--duration-fast) lg:inline-flex"
        >
          <RotateCcw size={14} aria-hidden />
          Reset map view
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(22rem,28rem)_1fr] lg:items-start lg:gap-10">
        <div
          className={cn(
            "lg:max-h-[calc(100dvh-10.5rem)] lg:overflow-y-auto lg:pr-2 lg:[scrollbar-color:var(--border-strong)_transparent] lg:[scrollbar-width:thin]",
            view === "list" ? "block" : "hidden lg:block",
          )}
        >
          <PropertyList
            properties={filtered}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            onReset={handleReset}
          />
        </div>

        <div
          className={cn(
            "relative lg:sticky lg:top-[calc(var(--header-height)+1rem)]",
            view === "map" ? "block" : "hidden lg:block",
          )}
        >
          <p className="sr-only">
            The map shows the homes matching your filters across Melbourne&apos;s
            northern corridor. Every home is also listed as text, so the map is
            never the only way to read this page.
          </p>

          <div className="map-portal border-border-strong h-[65dvh] overflow-hidden border shadow-raised lg:h-[calc(100dvh-10.5rem)]">
            {token ? (
              <PropertyMapLoader
                properties={filtered}
                token={token}
                selectedId={selected?.id ?? null}
                onSelect={handleSelect}
                resetToken={resetToken}
              />
            ) : (
              <PropertyMapFallback reason="no-token" className="border-0" />
            )}
          </div>

          {selected ? (
            <PropertyPreview
              property={selected}
              onClose={() => handleSelect(null)}
              className="absolute right-4 bottom-4 left-4 z-10 hidden max-w-md lg:block"
            />
          ) : null}
        </div>
      </div>

      <MobilePropertySheet
        property={selected}
        onClose={() => handleSelect(null)}
      />
    </div>
  );
}
