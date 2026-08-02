import { Section } from "@/components/layout/section";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { serviceAreas } from "@/lib/site-config";

export function ServiceAreasSection() {
  return (
    <Section id="locations" spacing="lg" divided>
      <SectionHeading
        eyebrow="Where we build"
        title="A tight radius through the northern corridor."
        description="Staying inside one corridor keeps our site teams, trades and suppliers close to every build."
      />

      <RevealGroup
        className="border-border mt-16 grid border-t sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.04}
      >
        {serviceAreas.map((area, index) => (
          <RevealItem key={area}>
            <div className="border-border group flex items-baseline gap-5 border-b py-6">
              <span className="text-foreground-subtle text-xs font-medium tracking-[0.2em] tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-display text-heading-3 text-foreground font-light">
                {area}
              </span>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
