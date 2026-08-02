import { Section } from "@/components/layout/section";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { serviceAreas } from "@/lib/site-config";

export function ServiceAreasSection() {
  return (
    <Section id="locations" spacing="lg" divided>
      <SectionHeading
        eyebrow="Where we build"
        title="Three suburbs, one corridor."
        description="We build in Mickleham, Craigieburn and Donnybrook, in Melbourne's northern growth corridor."
      />

      <RevealGroup
        className="border-border mt-16 grid border-t sm:grid-cols-3"
        stagger={0.06}
      >
        {serviceAreas.map((area, index) => (
          <RevealItem key={area}>
            <div className="border-border flex items-baseline gap-5 border-b py-8">
              <span className="text-foreground-subtle text-xs font-medium tracking-[0.2em] tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-display text-heading-2 text-foreground font-light">
                {area}
              </span>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
