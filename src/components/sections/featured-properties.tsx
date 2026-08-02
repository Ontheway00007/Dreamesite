import { Section } from "@/components/layout/section";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { PropertyCard } from "@/components/property/property-card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { featuredProperties } from "@/content/featured-properties";
import { ENQUIRY_ANCHOR } from "@/lib/routes";

export function FeaturedProperties() {
  return (
    <Section id="homes" tone="alt" spacing="lg" divided>
      <SectionHeading
        eyebrow="Concept façades"
        title="Three façades, three ways to live on a northern block."
        description="Concept façades from our plan types, shown while live listings are connected. Each card carries the status label it will show as a listing."
        action={
          <Button href={ENQUIRY_ANCHOR} variant="outline" size="sm">
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
