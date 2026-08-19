import { Suspense } from "react";

import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PropertyCard } from "@/components/property/property-card";
import { PropertyExplorer } from "@/components/property/property-explorer";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { getProperties } from "@/lib/properties/repository";
import { serviceAreas } from "@/lib/site-config";
import type { Property } from "@/types";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Homes on the map",
  description:
    "Browse every Dreame home across Mickleham, Craigieburn and Donnybrook on an interactive map, filtered by status, suburb and bedrooms.",
  alternates: { canonical: "/properties" },
};

function PropertyListFallback({ properties }: { properties: readonly Property[] }) {
  return (
    <div className="grid gap-6 pb-16 sm:grid-cols-2 xl:grid-cols-3">
      {properties.map((property) => (
        <PropertyCard key={property.id} property={property} />
      ))}
    </div>
  );
}

export default async function PropertiesPage() {
  const properties = await getProperties();

  return (
    <>
      <section className="bg-background-alt relative overflow-hidden pt-[calc(var(--header-height)+4rem)] pb-16 md:pt-[calc(var(--header-height)+6rem)] md:pb-24">
        <div
          aria-hidden
          className="outline-type pointer-events-none absolute -right-8 -bottom-[0.28em] font-display text-[clamp(10rem,26vw,28rem)] leading-none tracking-[-0.06em] opacity-40"
        >
          ATLAS
        </div>
        <div aria-hidden className="bg-accent absolute top-1/2 right-[9%] size-28 rounded-full opacity-[0.18] blur-2xl" />

        <Container className="relative grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <Eyebrow className="editorial-kicker text-accent">The portfolio</Eyebrow>
            <Heading level="display" as="h1" className="mt-8 max-w-5xl">
              Find your place
              <span className="block pl-[0.9em] italic">in the north.</span>
            </Heading>
          </div>
          <Text size="lead" className="max-w-md lg:col-span-4 lg:pb-3">
            Every marker is a published home in {serviceAreas.join(", ")}.
            Filter the same live portfolio by stage, suburb or bedrooms.
          </Text>
        </Container>
      </section>

      <Container className="pt-8 lg:pt-12">
        <Suspense fallback={<PropertyListFallback properties={properties} />}>
          <PropertyExplorer properties={properties} />
        </Suspense>
      </Container>
    </>
  );
}
