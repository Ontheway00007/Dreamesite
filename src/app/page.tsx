import { EnquirySection } from "@/components/sections/enquiry-section";
import { FeaturedProperties } from "@/components/sections/featured-properties";
import { Hero } from "@/components/sections/hero";
import { MapPreviewSection } from "@/components/sections/map-preview-section";
import { ProcessSection } from "@/components/sections/process-section";
import { ServiceAreasSection } from "@/components/sections/service-areas-section";
import { StatisticsSection } from "@/components/sections/statistics-section";
import { StatusSection } from "@/components/sections/status-section";

export const revalidate = 300;

export default function HomePage() {
  return (
    <>
      <Hero
        eyebrow="Residential builder · Northern Melbourne"
        headline="Homes built with intent, north of Melbourne."
        body="We design and build in Mickleham, Craigieburn and Donnybrook, in Melbourne's northern growth corridor. Every home we show carries its current status, so you always know what is ready now and what is still on site."
        scrollTarget="#homes"
        scrollDestination="our façades"
      />

      <FeaturedProperties />
      <MapPreviewSection />
      <StatusSection />
      <ProcessSection />
      <StatisticsSection />
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
