"use client";

import { Search, X } from "lucide-react";

import {
  propertyStatusOrder,
  propertyStatusTokens,
} from "@/lib/design/property-status";
import {
  bedroomOptionLabel,
  bedroomOptions,
  hasActiveFilters,
  type BedroomFilter,
  type PropertyFilters as Filters,
  type StatusFilter,
} from "@/lib/properties/filters";
import { cn } from "@/lib/utils/cn";

const selectClassName =
  "border-border bg-surface text-foreground focus-visible:border-accent h-11 w-full appearance-none rounded-lg border px-4 pr-9 text-sm transition-colors duration-(--duration-fast)";

const chevron =
  "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-foreground-subtle";

export interface PropertyFiltersProps {
  filters: Filters;
  suburbs: readonly string[];
  onChange: <Key extends keyof Filters>(key: Key, value: Filters[Key]) => void;
  onReset: () => void;
  /** Layout hint: stacked inside the mobile sheet, inline on desktop. */
  layout?: "inline" | "stacked";
  className?: string;
}

/**
 * Status, suburb, bedroom and text filters.
 *
 * Everything is a native control or a button with `aria-pressed`, so the whole
 * bar works from the keyboard and is announced correctly without any custom
 * widget behaviour. The suburb options come from the data, never a second list.
 */
export function PropertyFilters({
  filters,
  suburbs,
  onChange,
  onReset,
  layout = "inline",
  className,
}: PropertyFiltersProps) {
  const isStacked = layout === "stacked";

  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        !isStacked && "xl:flex-row xl:items-end xl:justify-between xl:gap-8",
        className,
      )}
    >
      <div
        role="group"
        aria-label="Filter by status"
        className="flex flex-wrap gap-2"
      >
        {(["all", ...propertyStatusOrder] as StatusFilter[]).map((status) => {
          const isActive = filters.status === status;
          const token = status === "all" ? null : propertyStatusTokens[status];

          return (
            <button
              key={status}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange("status", status)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium tracking-label uppercase transition-colors duration-(--duration-fast)",
                isActive
                  ? "border-accent bg-accent-soft text-foreground"
                  : "border-border text-foreground-subtle hover:text-foreground hover:border-border-strong",
              )}
            >
              {token ? (
                <span
                  className={cn("size-1.5 rounded-full", token.swatchClassName)}
                  aria-hidden
                />
              ) : null}
              {token ? token.label : "All"}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          isStacked
            ? "sm:grid-cols-2"
            : "xl:w-auto xl:grid-cols-[9.5rem_7.5rem_13rem_auto]",
        )}
      >
        <div className="relative">
          <label
            htmlFor="filter-suburb"
            className="text-foreground-subtle mb-2 block text-label font-medium tracking-label uppercase"
          >
            Suburb
          </label>
          <select
            id="filter-suburb"
            value={filters.suburb}
            onChange={(event) => onChange("suburb", event.target.value)}
            className={selectClassName}
          >
            <option value="all">All suburbs</option>
            {suburbs.map((suburb) => (
              <option key={suburb} value={suburb}>
                {suburb}
              </option>
            ))}
          </select>
          <span className={cn(chevron, "mt-3 text-xs")} aria-hidden>
            ▾
          </span>
        </div>

        <div className="relative">
          <label
            htmlFor="filter-beds"
            className="text-foreground-subtle mb-2 block text-label font-medium tracking-label uppercase"
          >
            Bedrooms
          </label>
          <select
            id="filter-beds"
            value={filters.beds}
            onChange={(event) =>
              onChange("beds", event.target.value as BedroomFilter)
            }
            className={selectClassName}
          >
            {bedroomOptions.map((option) => (
              <option key={option} value={option}>
                {bedroomOptionLabel(option)}
              </option>
            ))}
          </select>
          <span className={cn(chevron, "mt-3 text-xs")} aria-hidden>
            ▾
          </span>
        </div>

        <div className="relative sm:col-span-2 xl:col-span-1">
          <label
            htmlFor="filter-query"
            className="text-foreground-subtle mb-2 block text-label font-medium tracking-label uppercase"
          >
            Search
          </label>
          <Search
            size={15}
            className="text-foreground-subtle pointer-events-none absolute top-1/2 left-3.5 mt-3 -translate-y-1/2"
            aria-hidden
          />
          <input
            id="filter-query"
            type="search"
            value={filters.query}
            onChange={(event) => onChange("query", event.target.value)}
            placeholder="Name or suburb"
            className="border-border bg-surface text-foreground placeholder:text-foreground-subtle focus-visible:border-accent h-11 w-full rounded-lg border pr-4 pl-10 text-sm transition-colors duration-(--duration-fast)"
          />
        </div>

        {hasActiveFilters(filters) ? (
          <button
            type="button"
            onClick={onReset}
            className="text-foreground-subtle hover:text-foreground border-border hover:border-border-strong inline-flex h-11 items-center justify-center gap-2 self-end rounded-lg border px-4 text-xs font-medium tracking-label uppercase transition-colors duration-(--duration-fast) sm:col-span-2 xl:col-span-1"
          >
            <X size={14} aria-hidden />
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}
