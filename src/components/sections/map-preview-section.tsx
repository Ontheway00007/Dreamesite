import { ArrowRight, MapPin } from "lucide-react";

import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { PROPERTIES_ROUTE } from "@/lib/routes";
import { serviceAreas } from "@/lib/site-config";

/**
 * Homepage entry point to the map.
 *
 * Deliberately not a live Mapbox instance: the homepage should not pay for the
 * map library before a visitor has asked to see the map. This is a schematic of
 * the corridor — clearly a diagram, not a claim about geography — with a direct
 * route into the real thing.
 */
export function MapPreviewSection() {
  return (
    <Section id="map" spacing="lg" divided>
      <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-20">
        <SectionHeading
          eyebrow="The map"
          title="Find a home by where it sits."
          description="Every home we build appears on one map of the northern corridor, with its current status attached. Filter by status, suburb or bedrooms and select a marker to see the detail."
          action={
            <Button
              href={PROPERTIES_ROUTE}
              variant="accent"
              size="lg"
              iconRight={<ArrowRight size={16} aria-hidden />}
            >
              Explore all properties
            </Button>
          }
          className="lg:flex-col lg:items-start"
        />

        <Reveal variant="in">
          <div
            className="blueprint-grid border-border bg-background-alt relative overflow-hidden rounded-xl border p-8 md:p-12"
            aria-hidden
          >
            {/* Schematic of the corridor, ordered north to south. */}
            <ol className="relative space-y-10">
              <span className="bg-border absolute top-2 bottom-2 left-[0.4375rem] w-px" />
              {serviceAreas.map((area) => (
                <li key={area} className="relative flex items-center gap-5">
                  <span className="border-accent bg-background text-accent relative z-10 flex size-4 items-center justify-center rounded-full border">
                    <MapPin size={9} />
                  </span>
                  <span className="font-display text-heading-3 font-light">
                    {area}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-foreground-subtle mt-10 text-label font-medium tracking-label uppercase">
              Northern growth corridor
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
