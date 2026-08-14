import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
import { PropertyDetailHero } from "@/components/property/detail/property-detail-hero";
import { PropertyDetailSpecs } from "@/components/property/detail/property-detail-specs";
import { PropertyFeatures } from "@/components/property/detail/property-features";
import { EnquiryForm } from "@/components/enquiry/enquiry-form";
import { PropertyLocationSection } from "@/components/property/detail/property-location-section";
import { PropertyProgress } from "@/components/property/detail/property-progress";
import { PropertyResources } from "@/components/property/detail/property-resources";
import { PropertyShowcase } from "@/components/property/detail/property-showcase";
import { PropertyTestimonials } from "@/components/property/detail/property-testimonials";
import { RelatedProperties } from "@/components/property/detail/related-properties";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { floorPlanVisuals } from "@/lib/properties/media";
import { JsonLd } from "@/components/seo/json-ld";
import { propertyMetadata } from "@/lib/seo/metadata";
import { breadcrumbSchema, residenceSchema } from "@/lib/seo/structured-data";
import { getPublicSettings } from "@/lib/settings/public-settings";
import { PropertyFloorPlans } from "@/components/property/detail/property-floor-plans";
import {
  descriptionBlocks,
  getPropertyBySlug,
  getPropertySlugs,
  getRelatedProperties,
} from "@/lib/properties/repository";
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

export const revalidate = 300;

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

  // The whole chain — administrator override, then the property's own content,
  // then the site default — lives in lib/seo/metadata.ts. The site-wide level is
  // passed in rather than read there, so the resolver stays a pure function.
  // `getPublicSettings` is request-cached, so this shares the read with the
  // layout and the page body.
  const settings = await getPublicSettings();

  return propertyMetadata(property, {
    defaultMetaTitle: settings.defaultMetaTitle,
    defaultMetaDescription: settings.defaultMetaDescription,
    defaultOgImageUrl: settings.defaultOgImageUrl,
  });
}

/** Section wrapper, so the rhythm of the page is defined in one place. */
function DetailSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-border scroll-mt-28 border-t py-14 md:py-20">
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
  const hasRecord = (property.constructionUpdates ?? []).length > 0;

  if (hasRecord) {
    return property.status === "under-construction"
      ? "Updates recorded against this home as the build has progressed."
      : "The stages recorded against this home through to completion.";
  }

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
  // Only counts plans whose file actually resolves, so the section never
  // appears as an empty heading.
  const hasFloorPlans = floorPlanVisuals(property).some(
    (plan) => plan.url !== null,
  );
  const hasFeatures = (property.featureGroups ?? []).some(
    (group) => group.features.length > 0,
  );

  // Request-cached, so this shares the read with the layout and generateMetadata.
  const settings = await getPublicSettings();

  return (
    <Container width="content" className="pt-(--header-height)">
      {/*
        Two documents rather than one graph: they describe different things, and
        a crawler that rejects one should still get the other. Both contain only
        what this page displays — see lib/seo/structured-data.ts for what is
        deliberately absent, and why no coordinate ever appears here.
      */}
      <JsonLd
        data={residenceSchema(property, {
          defaultMetaTitle: settings.defaultMetaTitle,
          defaultMetaDescription: settings.defaultMetaDescription,
          defaultOgImageUrl: settings.defaultOgImageUrl,
        })}
      />
      <JsonLd data={breadcrumbSchema(property)} />
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

      {/* Follows the measured figures: the same subject in more detail. Renders
          only when this home has published features. */}
      {hasFeatures ? (
        <DetailSection
          eyebrow="Features"
          title="What is in the home."
          description="Inclusions, materials and finishes recorded for this home."
        >
          <PropertyFeatures property={property} />
        </DetailSection>
      ) : null}

      <DetailSection
        eyebrow="Build progress"
        title="Every stage, on the record."
        description={progressDescription(property)}
      >
        <PropertyProgress property={property} />
      </DetailSection>

      {/* Floor plans sit between the measurements and the location: they
          answer "how does it lay out?", which follows on from the figures. */}
      {hasFloorPlans ? (
        <DetailSection
          eyebrow="Floor plan"
          title="How the home is arranged."
          description="Drawn to the plan for this home."
        >
          <PropertyFloorPlans property={property} />
        </DetailSection>
      ) : null}

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

      {/* The enquiry is attached to this property, so the admin list shows
          which home was being asked about rather than just "website". */}
      <DetailSection
        id="property-enquiry"
        eyebrow="Enquire"
        title="Ask us anything about this home."
        description="Send through your questions and timeframe, and our team will reply with the detail you need, including location and availability."
      >
        <EnquiryForm
          propertyId={property.id}
          source="property-page"
          defaultMessage={`I would like to know more about ${property.name} in ${property.suburb}.`}
        />
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
