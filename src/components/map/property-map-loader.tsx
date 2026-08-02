"use client";

import dynamic from "next/dynamic";

import type { PropertyMapProps } from "@/components/map/property-map";

/**
 * Dynamic boundary for the map.
 *
 * Mapbox GL and its stylesheet are pulled in only when this component renders,
 * and never on the server. Any route without a map — the homepage included —
 * ships none of it.
 */
const PropertyMap = dynamic(() => import("@/components/map/property-map"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="bg-background-alt grid h-full w-full place-items-center rounded-xl"
    >
      <p className="text-foreground-subtle text-xs font-medium tracking-[0.2em] uppercase">
        Loading map
      </p>
    </div>
  ),
});

export function PropertyMapLoader(props: PropertyMapProps) {
  return <PropertyMap {...props} />;
}
