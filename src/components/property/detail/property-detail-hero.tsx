import Link from "next/link";

import { ArrowLeft, DoorOpen } from "lucide-react";

import { StatusBadge } from "@/components/property/status-badge";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { publicPriceLabel } from "@/lib/properties/display";
import { PROPERTIES_ROUTE } from "@/lib/routes";
import type { Property } from "@/types";

export interface PropertyDetailHeroProps {
  property: Property;
}

/**
 * Opening block of a property page: what this home is, where it is, and the two
 * things a visitor can do next.
 */
export function PropertyDetailHero({ property }: PropertyDetailHeroProps) {
  const { address, label } = property.location;
  const facts = [publicPriceLabel(property.priceDisplay), property.completionLabel].filter(
    Boolean,
  );

  return (
    <div>
      <Link
        href={PROPERTIES_ROUTE}
        className="text-foreground-subtle hover:text-foreground inline-flex items-center gap-2 text-xs font-medium tracking-[0.16em] uppercase transition-colors duration-(--duration-fast)"
      >
        <ArrowLeft size={14} aria-hidden />
        All homes
      </Link>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <StatusBadge status={property.status} />
        {property.displayHome?.isDisplayHome ? (
          <span className="border-border-strong text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.6875rem] font-medium tracking-[0.16em] uppercase">
            <DoorOpen size={13} aria-hidden />
            Display home
          </span>
        ) : null}
      </div>

      <Heading level={1} as="h1" className="mt-6">
        {property.name}
      </Heading>

      <p className="text-foreground-subtle mt-4 text-sm tracking-[0.16em] uppercase">
        {address ?? `${property.suburb} ${property.state}`}
        {label ? (
          <span className="text-foreground-subtle normal-case"> · {label}</span>
        ) : null}
      </p>

      <Text size="lead" className="mt-8 max-w-2xl">
        {property.summary}
      </Text>

      {facts.length > 0 || property.displayHome?.openingNote ? (
        <Text size="small" className="mt-5">
          {[...facts, property.displayHome?.openingNote]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-4">
        <Button href="#property-enquiry" variant="accent" size="lg">
          Enquire about this home
        </Button>
        <Button href={PROPERTIES_ROUTE} variant="outline" size="lg">
          Browse other homes
        </Button>
      </div>
    </div>
  );
}
