import Link from "next/link";

import { MapPin, Navigation, ShieldCheck } from "lucide-react";

import { Text } from "@/components/ui/typography";
import { isValidCoordinate } from "@/lib/properties/privacy";
import { PROPERTIES_ROUTE } from "@/lib/routes";
import type { Property } from "@/types";

export interface PropertyLocationSectionProps {
  property: Property;
}

/**
 * What can be said about where this home is.
 *
 * Everything here comes from the published location: the address line, the
 * caveat and whether directions may be offered are all resolved by the privacy
 * pipeline, so this component makes no decision about what may be revealed.
 */
export function PropertyLocationSection({
  property,
}: PropertyLocationSectionProps) {
  const { address, label, accuracyNote, allowDirections, visibility } =
    property.location;

  // Directions are only built from a validated public coordinate — never from
  // a stored private one — and only when the property's settings allow them.
  const directionsHref =
    allowDirections &&
    isValidCoordinate(
      property.location.publicLatitude,
      property.location.publicLongitude,
    )
      ? `https://www.google.com/maps/search/?api=1&query=${property.location.publicLatitude},${property.location.publicLongitude}`
      : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <div>
        <p className="text-foreground flex items-center gap-3 text-lg">
          <MapPin size={17} className="text-accent shrink-0" aria-hidden />
          {address ?? `${property.suburb} ${property.state}`}
        </p>

        {label ? (
          <p className="text-foreground-subtle mt-4 text-xs font-medium tracking-label uppercase">
            {label}
          </p>
        ) : null}

        {accuracyNote ? (
          <Text size="small" className="mt-3 max-w-md">
            {accuracyNote}
          </Text>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-6">
          {visibility === "hidden" ? null : (
            <Link
              href={`${PROPERTIES_ROUTE}?property=${property.slug}`}
              className="text-accent hover:text-accent-strong inline-flex items-center gap-2 text-xs font-medium tracking-label uppercase transition-colors duration-(--duration-fast)"
            >
              <MapPin size={14} aria-hidden />
              Show on the map
            </Link>
          )}

          {/* Offered only when this property's settings allow it. */}
          {directionsHref ? (
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-strong inline-flex items-center gap-2 text-xs font-medium tracking-label uppercase transition-colors duration-(--duration-fast)"
            >
              <Navigation size={14} aria-hidden />
              Open in Maps
            </a>
          ) : null}
        </div>
      </div>

      <div className="border-border bg-surface/60 rounded-xl border p-6">
        <p className="text-foreground flex items-center gap-3 text-sm font-medium">
          <ShieldCheck size={16} className="text-accent shrink-0" aria-hidden />
          How we handle addresses
        </p>
        <Text size="small" className="mt-4">
          Each home is published according to its selected privacy settings.
          Where a home is occupied or a family has asked for discretion, the map
          shows a generalised location and the address is withheld. Buyers who
          enquire get the detail they need directly from us.
        </Text>
      </div>
    </div>
  );
}
