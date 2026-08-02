import { ArrowRight } from "lucide-react";

import { Section } from "@/components/layout/section";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { PropertyCard } from "@/components/property/property-card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { getFeaturedProperties } from "@/lib/properties/repository";
import { PROPERTIES_ROUTE } from "@/lib/routes";

export async function FeaturedProperties() {
  const properties = await getFeaturedProperties();

  return (
    <Section id="homes" tone="alt" spacing="lg" divided>
      <SectionHeading
        eyebrow="Concept façades"
        title="Three façades, three ways to live on a northern block."
        description="Concept façades from our plan types, shown while live listings are connected. Each card carries the status label it will show as a listing."
        action={
          <Button
            href={PROPERTIES_ROUTE}
            variant="outline"
            size="sm"
            iconRight={<ArrowRight size={14} aria-hidden />}
          >
            Explore all homes
          </Button>
        }
      />

      <RevealGroup
        className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
        stagger={0.1}
      >
        {properties.map((property) => (
          <RevealItem key={property.id} className="h-full">
            <PropertyCard property={property} className="h-full" />
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
