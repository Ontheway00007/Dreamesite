import { AvailableNow } from "@/components/home/available-now";
import { DemonstrationNotice } from "@/components/home/demonstration-notice";
import { MapStage } from "@/components/home/map-stage";
import { SelectedProjects } from "@/components/home/selected-projects";
import { EnquirySection } from "@/components/sections/enquiry-section";
import { ProcessSection } from "@/components/sections/process-section";
import { ServiceAreasSection } from "@/components/sections/service-areas-section";
import { getMapboxToken } from "@/lib/map/map-config";
import { summarisePortfolio } from "@/lib/properties/portfolio-summary";
import { getProperties } from "@/lib/properties/repository";

export const revalidate = 300;

/**
 * The public homepage.
 *
 * ## Phase 7: the map is the opening, not a section
 *
 * The page previously opened with a text hero and put the map fourth, which
 * inverted the thing that makes this business legible: where it builds and what
 * stage each home is at are spatial facts. `MapStage` now owns the first
 * viewport and the sections below elaborate on it.
 *
 * Retired here, and why:
 *
 * - `Hero` — a headline over an abstract façade drawing. Replaced by the map,
 *   which says more about the portfolio in a glance than the copy did.
 * - `MapPreviewSection` — a small map teaser that only existed because the real
 *   map was buried. Redundant once the map opens the page.
 * - `StatisticsSection` — four dashboard-style counters. The same counts are now
 *   part of the map interface, where they are useful rather than decorative.
 *
 * ## Rendering
 *
 * Still statically generated with `revalidate = 300`. The properties are read on
 * the server and handed to the stage as data, so the only client JavaScript is
 * the map and its interaction — not the catalogue.
 */
export default async function HomePage() {
  const properties = await getProperties();
  const summary = summarisePortfolio(properties);
  const token = getMapboxToken();

  return (
    <>
      <MapStage properties={properties} summary={summary} token={token} />

      <DemonstrationNotice />

      <SelectedProjects />
      <AvailableNow />

      {/*
        Still the Phase 6 sections. `ProcessSection` becomes the scroll-linked
        construction story and `ServiceAreasSection` becomes the suburb-level
        portfolio; neither is rebuilt yet, so they stay rather than leaving the
        page with a gap where that content belongs.
      */}
      <ProcessSection />
      <ServiceAreasSection />

      <EnquirySection
        id="contact"
        title="Tell us the suburb. We will tell you what is available."
        body="Send through the area and timeframe you are considering and our team will reply with the homes that genuinely match."
        source="homepage"
      />
    </>
  );
}
