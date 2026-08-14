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

/**
 * Server-rendered listing.
 *
 * This is the Suspense fallback for the explorer, which means it is what search
 * engines and visitors without JavaScript receive: the complete set of homes as
 * real HTML, rather than an empty shell.
 */
function PropertyListFallback({
  properties,
}: {
  properties: readonly Property[];
}) {
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
      <Container className="pt-(--header-height)">
        <div className="max-w-2xl py-10 md:py-12">
          <Eyebrow>Homes</Eyebrow>
          <Heading level={1} as="h1" className="mt-5">
            Every home on the corridor map.
          </Heading>
          <Text size="lead" className="mt-6">
            Each marker is one of our homes in {serviceAreas.join(", ")}. Filter
            by status, suburb or bedrooms. The list beside the map carries the
            same information as text.
          </Text>
        </div>
      </Container>

      <Container>
        {/*
         * The explorer reads filters from the query string, so it needs a
         * Suspense boundary. The fallback is the full server-rendered list,
         * which keeps the page useful before and without hydration.
         */}
        <Suspense fallback={<PropertyListFallback properties={properties} />}>
          <PropertyExplorer properties={properties} />
        </Suspense>
      </Container>
    </>
  );
}
