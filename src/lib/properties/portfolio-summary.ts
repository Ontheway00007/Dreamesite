import { propertyStatusOrder } from "@/lib/design/property-status";
import { isMappable } from "@/lib/properties/privacy";
import type { Property, PropertyStatus } from "@/types";

/**
 * The counts the opening map presents, derived from published properties.
 *
 * Every number here is computed from real records. Nothing is written down, so
 * the summary cannot drift from the catalogue and cannot advertise a home that
 * does not exist. A status with no properties reports zero rather than being
 * omitted, because "none available right now" is honest information a visitor
 * benefits from — but the interface decides how to present that, not this
 * module.
 */
export interface PortfolioStatusCount {
  readonly status: PropertyStatus;
  readonly count: number;
}

export interface PortfolioSuburb {
  readonly suburb: string;
  readonly count: number;
}

export interface PortfolioSummary {
  /** Every status, in the project's canonical order, including empty ones. */
  readonly statuses: readonly PortfolioStatusCount[];
  /** Suburbs that actually have published properties, busiest first. */
  readonly suburbs: readonly PortfolioSuburb[];
  readonly total: number;
  /** How many carry a public coordinate, so the map's own claim is accurate. */
  readonly mappable: number;
}

export function summarisePortfolio(
  properties: readonly Property[],
): PortfolioSummary {
  const byStatus = new Map<PropertyStatus, number>();
  const bySuburb = new Map<string, number>();

  for (const property of properties) {
    byStatus.set(property.status, (byStatus.get(property.status) ?? 0) + 1);

    const suburb = property.suburb.trim();
    if (suburb) {
      bySuburb.set(suburb, (bySuburb.get(suburb) ?? 0) + 1);
    }
  }

  return {
    statuses: propertyStatusOrder.map((status) => ({
      status,
      count: byStatus.get(status) ?? 0,
    })),
    suburbs: [...bySuburb.entries()]
      .map(([suburb, count]) => ({ suburb, count }))
      .sort((a, b) =>
        b.count === a.count ? a.suburb.localeCompare(b.suburb) : b.count - a.count,
      ),
    total: properties.length,
    mappable: properties.filter(isMappable).length,
  };
}

/**
 * Properties a visitor can act on commercially, in the order the site should
 * present them: available now first, then work in progress.
 *
 * Kept separate from the summary so a section can ask "is there anything to
 * show?" without recounting.
 */
export function propertiesByStatus(
  properties: readonly Property[],
  status: PropertyStatus,
): readonly Property[] {
  return properties.filter((property) => property.status === status);
}
