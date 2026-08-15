import { AvailableNow } from "@/components/home/available-now";
import { ConstructionJourney } from "@/components/home/construction-journey";
import { DemonstrationNotice } from "@/components/home/demonstration-notice";
import { MapStage } from "@/components/home/map-stage";
import { SelectedProjects } from "@/components/home/selected-projects";
import { SectionTransition } from "@/components/motion/section-transition";
import { EnquirySection } from "@/components/sections/enquiry-section";
import { ServiceAreasSection } from "@/components/sections/service-areas-section";
import { summarisePortfolio } from "@/lib/properties/portfolio-summary";
import { getProperties } from "@/lib/properties/repository";
import { getPublicSettings } from "@/lib/settings/public-settings";

export const revalidate = 300;

/**
 * The public homepage.
 *
 * ## Phase 7A: Cinematic experience at intensity 9/10
 *
 * The map breathes. Markers pulse. Hover creates three-way reactions.
 * Construction story is scroll-linked transformation, not a timeline widget.
 * Photography dominates. Every section tells a story.
 *
 * Retired components and why:
 *
 * - `Hero` — replaced by breathing MapStage with three-way hover reactions
 * - `MapPreviewSection` — redundant once map opens the page
 * - `StatisticsSection` — counts now part of map interface
 * - `ProcessSection` — replaced by scroll-linked ConstructionJourney experience
 *
 * ## Rendering
 *
 * Still statically generated with `revalidate = 300`. Properties read on
 * server, handed to components as data. Only map and scroll effects are client JS.
 */
export default async function HomePage() {
  const properties = await getProperties();
  const summary = summarisePortfolio(properties);
  const settings = await getPublicSettings();

  return (
    <>
      {/* Opening: Map breathes, markers appear, three-way hover reactions */}
      <MapStage
        properties={properties}
        summary={summary}
        companyName={settings.companyName}
      />

      <DemonstrationNotice />

      {/* Section 1: Selected projects with edge-to-edge editorial layout */}
      <SectionTransition>
        <SelectedProjects />
      </SectionTransition>

      {/* Section 2: Available homes with purposeful micro-interactions */}
      <SectionTransition delay={0.1}>
        <AvailableNow />
      </SectionTransition>

      {/* Section 3: Construction journey - scroll-linked transformation */}
      <ConstructionJourney />

      {/* Section 4: Service areas */}
      <SectionTransition>
        <ServiceAreasSection />
      </SectionTransition>

      {/* Section 5: Enquiry with final call to action */}
      <SectionTransition delay={0.1}>
        <EnquirySection
          id="contact"
          title="Tell us the suburb. We will tell you what is available."
          body="Send through the area and timeframe you are considering and our team will reply with the homes that genuinely match."
          source="homepage"
        />
      </SectionTransition>
    </>
  );
}
