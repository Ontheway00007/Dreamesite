import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArrowLeft, ArrowRight, Navigation } from "lucide-react";

import { Container } from "@/components/layout/container";
import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { propertyStatusTokens } from "@/lib/design/property-status";
import {
  getPropertyBySlug,
  getPropertySlugs,
} from "@/lib/properties/repository";
import { ENQUIRY_ANCHOR, PROPERTIES_ROUTE } from "@/lib/routes";
import { siteConfig } from "@/lib/site-config";

/**
 * TEMPORARY PROPERTY PAGE.
 *
 * This exists so a card link never lands on an unstyled 404 while the full
 * detail page — gallery, floor plan, virtual tour, structured data — is built in
 * the next phase. It shows only what the current data can support, and is meant
 * to be replaced wholesale rather than extended.
 */

interface PropertyPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getPropertySlugs();

  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PropertyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const property = await getPropertyBySlug(slug);

  if (!property) {
    return { title: "Home not found" };
  }

  const status = propertyStatusTokens[property.status].label;

  return {
    title: `${property.name}, ${property.suburb}`,
    description: `${property.summary} ${status} in ${property.suburb} ${property.state}.`.trim(),
    alternates: { canonical: `${PROPERTIES_ROUTE}/${property.slug}` },
  };
}

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { slug } = await params;
  const property = await getPropertyBySlug(slug);

  if (!property) {
    notFound();
  }

  const { address, label, accuracyNote, allowDirections } = property.location;
  const details = [property.priceDisplay, property.completionLabel].filter(
    Boolean,
  );
  const directionsHref = allowDirections
    ? `https://www.google.com/maps/search/?api=1&query=${property.location.publicLatitude},${property.location.publicLongitude}`
    : null;

  return (
    <Container className="pt-(--header-height)" width="content">
      <div className="py-16 md:py-24">
        <Button href={PROPERTIES_ROUTE} variant="ghost" size="sm">
          <ArrowLeft size={14} aria-hidden />
          All homes
        </Button>

        <div className="border-border bg-background-alt relative mt-8 aspect-16/9 overflow-hidden rounded-xl border">
          <PropertyMedia
            property={property}
            sizes="(min-width: 1024px) 60rem, 100vw"
          />
        </div>

        <div className="mt-10">
          <StatusBadge status={property.status} />
          <Heading level={1} as="h1" className="mt-6">
            {property.name}
          </Heading>
          <p className="text-foreground-subtle mt-3 text-sm tracking-[0.16em] uppercase">
            {address ?? `${property.suburb} ${property.state}`}
          </p>

          <Text size="lead" className="mt-8">
            {property.summary}
          </Text>

          <PropertySpecs
            property={property}
            includeHouseSize
            className="border-border mt-8 border-t pt-8"
          />

          {details.length > 0 ? (
            <Text size="small" className="mt-6">
              {details.join(" · ")}
            </Text>
          ) : null}

          {label || accuracyNote || directionsHref ? (
            <div className="border-border mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-6">
              <div>
                {label ? (
                  <p className="text-foreground text-sm font-medium">{label}</p>
                ) : null}
                {accuracyNote ? (
                  <Text size="small" tone="subtle" className="mt-1">
                    {accuracyNote}
                  </Text>
                ) : null}
              </div>

              {/* Only offered when the property's settings allow directions. */}
              {directionsHref ? (
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-strong ml-auto inline-flex items-center gap-2 text-xs font-medium tracking-[0.16em] uppercase transition-colors duration-(--duration-fast)"
                >
                  <Navigation size={14} aria-hidden />
                  Open in Maps
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="border-border mt-12 border-t pt-8">
            <Text size="small">
              The full profile for this home — floor plan, gallery and virtual
              tour — is being prepared. In the meantime our team can answer
              anything about it directly.
            </Text>

            <div className="mt-8 flex flex-wrap gap-4">
              <Button
                href={`mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(
                  `${property.name}, ${property.suburb}`,
                )}`}
                variant="accent"
                size="lg"
              >
                Enquire about this home
              </Button>
              <Button
                href={PROPERTIES_ROUTE}
                variant="outline"
                size="lg"
                iconRight={<ArrowRight size={16} aria-hidden />}
              >
                Back to the map
              </Button>
            </div>

            <Text size="small" tone="subtle" className="mt-6">
              Prefer to talk it through?{" "}
              <a href={ENQUIRY_ANCHOR} className="text-accent underline">
                Send us the suburb and timeframe
              </a>{" "}
              you are considering.
            </Text>
          </div>
        </div>
      </div>
    </Container>
  );
}
