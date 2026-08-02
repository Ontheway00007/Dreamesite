import { Section } from "@/components/layout/section";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { PropertyCard } from "@/components/property/property-card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { featuredProperties } from "@/content/featured-properties";

export function FeaturedProperties() {
  return (
    <Section id="homes" tone="alt" spacing="lg" divided>
      <SectionHeading
        eyebrow="Featured homes"
        title="Three facades, three ways to live on a northern block."
        description="A first look at how our floor plans meet the street. Each home carries its current status, updated the day it changes."
        action={
          <Button href="/#contact" variant="outline" size="sm">
            Enquire about availability
          </Button>
        }
      />

      <RevealGroup
        className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        stagger={0.1}
      >
        {featuredProperties.map((property) => (
          <RevealItem key={property.id} className="h-full">
            <PropertyCard property={property} className="h-full" />
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
