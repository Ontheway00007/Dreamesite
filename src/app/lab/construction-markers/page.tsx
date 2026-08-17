import type { Metadata } from "next";

import { getMapboxToken } from "@/lib/map/map-config";

import { MarkerPrototype } from "@/app/lab/construction-markers/marker-prototype";
import { prototypeProperties } from "@/app/lab/construction-markers/prototype-properties";

/**
 * Prototype surface for the animated construction markers.
 *
 * The brief for this phase requires the marker system to be proved on three
 * properties, on the real dark basemap, before it replaces the marker system the
 * whole site uses. This is where that happens: `/lab/construction-markers` is the
 * only route that passes `markers="construction"`, so the homepage and the
 * properties page keep their existing markers until the prototype is signed off.
 *
 * It is excluded from indexing here and disallowed in `robots.txt`, and it is not
 * linked from anywhere in the site. It carries no real property data.
 */
export const metadata: Metadata = {
  title: "Construction marker prototype",
  robots: { index: false, follow: false },
};

export default function ConstructionMarkerLabPage() {
  return (
    <MarkerPrototype
      properties={prototypeProperties}
      token={getMapboxToken()}
    />
  );
}
