"use client";

import { useCallback, useMemo, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  defaultFilters,
  parsePropertyFilters,
  parseViewMode,
  propertyFiltersToQuery,
  type PropertyFilters,
  type ViewMode,
} from "@/lib/properties/filters";

export interface UsePropertyFiltersResult {
  filters: PropertyFilters;
  view: ViewMode;
  setFilter: <Key extends keyof PropertyFilters>(
    key: Key,
    value: PropertyFilters[Key],
  ) => void;
  setView: (view: ViewMode) => void;
  reset: () => void;
}

/**
 * Filter state, shareable through the URL.
 *
 * Status, suburb, bedrooms and the view mode live in the query string so a
 * filtered view can be linked to, and they are read back with validation so a
 * hand-edited URL cannot break the page. Updates use `router.replace` with
 * `scroll: false`, which keeps navigation soft — no reload, no jump.
 *
 * The free-text query stays in component state: it changes on every keystroke,
 * and putting that in the URL would add history noise for no benefit.
 */
export function usePropertyFilters(
  availableSuburbs: readonly string[],
): UsePropertyFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");

  const urlFilters = useMemo(
    () => parsePropertyFilters(searchParams, availableSuburbs),
    [searchParams, availableSuburbs],
  );
  const view = useMemo(() => parseViewMode(searchParams), [searchParams]);

  const filters = useMemo<PropertyFilters>(
    () => ({ ...urlFilters, query }),
    [urlFilters, query],
  );

  const commit = useCallback(
    (next: PropertyFilters, nextView: ViewMode) => {
      const queryString = propertyFiltersToQuery(next, nextView);

      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  const setFilter = useCallback<UsePropertyFiltersResult["setFilter"]>(
    (key, value) => {
      if (key === "query") {
        setQuery(value as string);
        return;
      }

      commit({ ...filters, [key]: value }, view);
    },
    [commit, filters, view],
  );

  const setView = useCallback(
    (nextView: ViewMode) => commit(filters, nextView),
    [commit, filters],
  );

  const reset = useCallback(() => {
    setQuery("");
    commit(defaultFilters, view);
  }, [commit, view]);

  return { filters, view, setFilter, setView, reset };
}
