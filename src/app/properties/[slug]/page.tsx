import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { PropertyDetailHero } from "@/components/property/detail/property-detail-hero";
import { PropertyDetailSpecs } from "@/components/property/detail/property-detail-specs";
import { PropertyLocationSection } from "@/components/property/detail/property-location-section";
import { PropertyProgress } from "@/components/property/detail/property-progress";
import { PropertyResources } from "@/components/property/detail/property-resources";
import { PropertyShowcase } from "@/components/property/detail/property-showcase";
import { PropertyTestimonials } from "@/components/property/detail/property-testimonials";
import { RelatedProperties } from "@/components/property/detail/related-properties";
import { Button } from "@/components/ui/button";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { propertyStatusTokens } from "@/lib/design/property-status";
import { propertyMediaUrl } from "@/lib/images/property-image";
import { env } from "@/lib/env";
import {
  descriptionBlocks,
  getPropertyBySlug,
  getPropertySlugs,
  getRelatedProperties,
} from "@/lib/properties/repository";
import { ENQUIRY_ANCHOR, PROPERTIES_ROUTE } from "@/lib/routes";
import { siteConfig } from "@/lib/site-config";
import type { Property } from "@/types";

/**
 * Property page.
 *
 * Entirely server-rendered except the gallery, which only mounts once a home has
 * more than one image. Every section is driven by the property's own data, and a
 * section with nothing to show renders nothing — so tours, drone footage,
 * brochures, floor plans and testimonials all appear the moment they are added to
 * a record, with no change here.
 *
 * Location comes only from `property.location`, the published shape produced by
 * the privacy pipeline. This page never sees a stored coordinate.
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
  const description = `${property.summary} ${status} in ${property.suburb} ${property.state}.`;
  const canonicalUrl = `${env.siteUrl}${PROPERTIES_ROUTE}/${property.slug}`;

  // The architectural drawing is not a photograph of the home, so it is left
  // out of the Open Graph image rather than shared as if it were one.
  const imageUrl = propertyMediaUrl(property.imagePath);

  return {
    title: `${property.name}, ${property.suburb}`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "website",
      title: `${property.name}, ${property.suburb}`,
      description,
      url: canonicalUrl,
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
  };
}

/** Section wrapper, so the rhythm of the page is defined in one place. */
function DetailSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border border-t py-14 md:py-20">
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading level={3} as="h2" className="mt-4">
          {title}
        </Heading>
        {description ? (
          <Text className="mt-4 max-w-2xl">{description}</Text>
        ) : null}
      </Reveal>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function progressDescription(property: Property): string {
  return property.status === "under-construction"
    ? "Where this home is in our documented build process."
    : "This home has progressed through every recorded construction stage.";
}

export default async function PropertyPage({ params }: PropertyPageProps) {
  const { slug } = await params;
  const property = await getPropertyBySlug(slug);

  if (!property) {
    notFound();
  }

  const related = await getRelatedProperties(slug);
  const hasTestimonials = (property.testimonials ?? []).length > 0;

  return (
    <Container width="content" className="pt-(--header-height)">
      <div className="py-12 md:py-16">
        <PropertyDetailHero property={property} />
      </div>

      <PropertyShowcase property={property} />

      {property.description ? (
        <DetailSection eyebrow="Overview" title="About this home">
          <div className="max-w-2xl space-y-5">
            {descriptionBlocks(property.description).map((block) => (
              <Text key={block.key}>{block.text}</Text>
            ))}
            {property.description.source === "ai-assisted" ? (
              <Text size="small" tone="subtle">
                This description was drafted with AI assistance and reviewed by
                our team.
              </Text>
            ) : null}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection
        eyebrow="Specifications"
        title="The measured detail."
        description="Figures come from the plan for this home. Anything not yet measured is left out rather than estimated."
      >
        <PropertyDetailSpecs property={property} />
      </DetailSection>

      <DetailSection
        eyebrow="Build progress"
        title="Every stage, on the record."
        description={progressDescription(property)}
      >
        <PropertyProgress property={property} />
      </DetailSection>

      <DetailSection
        eyebrow="Location"
        title="Where this home sits."
        description="Each home is published according to the privacy settings configured for it."
      >
        <PropertyLocationSection property={property} />
      </DetailSection>

      {/* Renders only when this home has a tour, footage or documents. */}
      <PropertyResources property={property} />

      {hasTestimonials ? (
        <DetailSection eyebrow="In their words" title="From the owners.">
          <PropertyTestimonials property={property} />
        </DetailSection>
      ) : null}

      <DetailSection
        eyebrow="Enquire"
        title="Ask us anything about this home."
        description="Send through your questions and timeframe, and our team will reply with the detail you need — including location and availability."
      >
        <div className="flex flex-wrap gap-4">
          <Button
            href={`mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(
              `${property.name}, ${property.suburb}`,
            )}`}
            variant="accent"
            size="lg"
          >
            Email our team
          </Button>
          <Button href={ENQUIRY_ANCHOR} variant="ghost" size="lg">
            Other ways to reach us
          </Button>
        </div>
      </DetailSection>

      {related.length > 0 ? (
        <DetailSection
          eyebrow="More homes"
          title={`Others in ${property.suburb} and nearby.`}
        >
          <RelatedProperties properties={related} />
        </DetailSection>
      ) : null}
    </Container>
  );
}
