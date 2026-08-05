import { propertyStatusOrder } from "@/lib/design/property-status";
import type { Property, PropertyStatus } from "@/types";

/** Minimum-bedroom options offered in the filter bar. */
export const bedroomOptions = ["any", "3", "4", "5"] as const;
export type BedroomFilter = (typeof bedroomOptions)[number];

export type StatusFilter = PropertyStatus | "all";

export interface PropertyFilters {
  readonly status: StatusFilter;
  readonly suburb: string;
  readonly beds: BedroomFilter;
  /** Free-text match against the property name and suburb. */
  readonly query: string;
}

export type ViewMode = "map" | "list";

export const defaultFilters: PropertyFilters = {
  status: "all",
  suburb: "all",
  beds: "any",
  query: "",
};

/** Query string keys, kept here so the page and the hook cannot disagree. */
export const filterParamKeys = {
  status: "status",
  suburb: "suburb",
  beds: "beds",
  view: "view",
} as const;

function isStatus(value: string): value is PropertyStatus {
  return (propertyStatusOrder as readonly string[]).includes(value);
}

function isBedroomFilter(value: string): value is BedroomFilter {
  return (bedroomOptions as readonly string[]).includes(value);
}

/** Suburbs present in the data, sorted. Never a hard-coded list. */
export function suburbOptions(properties: readonly Property[]): string[] {
  return Array.from(new Set(properties.map((property) => property.suburb))).sort(
    (a, b) => a.localeCompare(b),
  );
}

/** The single filtering pipeline used by both the list and the map. */
export function filterProperties(
  properties: readonly Property[],
  filters: PropertyFilters,
): Property[] {
  const minimumBedrooms = filters.beds === "any" ? 0 : Number(filters.beds);
  const query = filters.query.trim().toLowerCase();

  return properties.filter((property) => {
    if (filters.status !== "all" && property.status !== filters.status) {
      return false;
    }

    if (filters.suburb !== "all" && property.suburb !== filters.suburb) {
      return false;
    }

    if (property.bedrooms < minimumBedrooms) {
      return false;
    }

    if (query.length > 0) {
      const haystack = `${property.name} ${property.suburb}`.toLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

/** True when anything differs from the default view. */
export function hasActiveFilters(filters: PropertyFilters): boolean {
  return (
    filters.status !== defaultFilters.status ||
    filters.suburb !== defaultFilters.suburb ||
    filters.beds !== defaultFilters.beds ||
    filters.query.trim() !== ""
  );
}

/** Minimal reader interface, satisfied by both URLSearchParams and Next's. */
export interface ReadableParams {
  get(key: string): string | null;
}

/**
 * Reads filters from a query string. Unknown or malformed values fall back to
 * the default rather than throwing, so a hand-edited URL cannot break the page.
 * `query` is intentionally not stored in the URL — it stays local to the input.
 */
export function parsePropertyFilters(
  params: ReadableParams,
  availableSuburbs: readonly string[] = [],
): PropertyFilters {
  const status = params.get(filterParamKeys.status) ?? "";
  const suburb = params.get(filterParamKeys.suburb) ?? "";
  const beds = params.get(filterParamKeys.beds) ?? "";

  return {
    status: isStatus(status) ? status : defaultFilters.status,
    suburb: availableSuburbs.includes(suburb) ? suburb : defaultFilters.suburb,
    beds: isBedroomFilter(beds) ? beds : defaultFilters.beds,
    query: defaultFilters.query,
  };
}

export function parseViewMode(params: ReadableParams): ViewMode {
  return params.get(filterParamKeys.view) === "list" ? "list" : "map";
}

/**
 * Serialises the shareable part of the state. Defaults are omitted so a clean
 * view has a clean URL.
 */
export function propertyFiltersToQuery(
  filters: PropertyFilters,
  view: ViewMode,
): string {
  const params = new URLSearchParams();

  if (filters.status !== defaultFilters.status) {
    params.set(filterParamKeys.status, filters.status);
  }

  if (filters.suburb !== defaultFilters.suburb) {
    params.set(filterParamKeys.suburb, filters.suburb);
  }

  if (filters.beds !== defaultFilters.beds) {
    params.set(filterParamKeys.beds, filters.beds);
  }

  if (view === "list") {
    params.set(filterParamKeys.view, view);
  }

  return params.toString();
}

/** Label for a bedroom option, e.g. "3+". */
export function bedroomOptionLabel(option: BedroomFilter): string {
  return option === "any" ? "Any" : `${option}+`;
}
