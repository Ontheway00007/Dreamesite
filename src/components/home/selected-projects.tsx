import { ArrowRight } from "lucide-react";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { propertyHref } from "@/lib/routes";
import { getFeaturedProperties } from "@/lib/properties/repository";
import type { Property } from "@/types";

/**
 * Selected projects — an asymmetrical editorial arrangement.
 *
 * ## Why not three cards
 *
 * A three-column grid of identical cards says every project is equally
 * important, which is never true and reads as a template. This gives the first
 * project the full width and a large crop, then sets the next two against each
 * other at different weights. Each composition differs, so the eye moves through
 * the section instead of scanning a row.
 *
 * ## Honest at any volume
 *
 * Renders nothing at all when there are no featured projects — an empty
 * "Selected projects" heading is worse than no section. With one it shows the
 * lead composition alone rather than padding the row.
 */
export async function SelectedProjects() {
  const featured = await getFeaturedProperties();

  if (featured.length === 0) {
    return null;
  }

  const [lead, ...rest] = featured.slice(0, 3);
  const secondary = rest.slice(0, 2);

  return (
    <section
      aria-labelledby="selected-projects-heading"
      className="border-border border-t py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2
            id="selected-projects-heading"
            className="font-display text-foreground max-w-xl text-[clamp(1.9rem,3.6vw,3rem)] leading-[1.05] tracking-[-0.02em]"
          >
            Selected projects
          </h2>
          <p className="text-foreground-subtle max-w-sm text-sm leading-relaxed">
            A closer look at homes we have taken from land to handover across the
            northern corridor.
          </p>
        </div>
      </div>

      {/* Lead project — full width, the largest image on the page. */}
      <LeadProject property={lead} />

      {secondary.length > 0 ? (
        <div className="mx-auto mt-6 grid max-w-[110rem] gap-6 px-5 sm:px-8 lg:mt-10 lg:grid-cols-12 lg:gap-10 lg:px-12">
          {secondary.map((property, index) => (
            <SecondaryProject
              key={property.id}
              property={property}
              /*
                Deliberately unequal: the first takes seven columns and a wider
                crop, the second five and a taller one. Two projects, two
                compositions.
              */
              className={
                index === 0
                  ? "lg:col-span-7"
                  : "lg:col-span-5 lg:mt-16"
              }
              aspect={index === 0 ? "aspect-16/10" : "aspect-4/5"}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LeadProject({ property }: { property: Property }) {
  return (
    <a
      href={propertyHref(property.slug)}
      className="focus-visible:ring-ring group mt-10 block focus-visible:ring-2 focus-visible:outline-none lg:mt-14"
    >
      {/* Edge to edge — the photograph is not inset in a card. */}
      <div className="bg-background-alt relative aspect-4/5 w-full overflow-hidden sm:aspect-16/9 lg:aspect-[2.4/1]">
        <PropertyMedia
          property={property}
          sizes="100vw"
          showPreviewLabel
          className="p-10"
        />
        <div
          aria-hidden="true"
          className="from-background/90 via-background/10 absolute inset-0 bg-gradient-to-t to-transparent"
        />

        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-12">
          <div className="mx-auto max-w-[110rem]">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={property.status} size="sm" />
              <span className="text-foreground-muted text-xs tracking-[0.18em] uppercase">
                {property.suburb}
                {property.state ? `, ${property.state}` : ""}
              </span>
            </div>

            <h3 className="font-display text-foreground mt-4 max-w-2xl text-[clamp(1.6rem,3.4vw,2.75rem)] leading-[1.05]">
              {property.name}
            </h3>

            <p className="text-foreground-muted mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
              {property.summary}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-6">
              <PropertySpecs property={property} size="sm" includeHouseSize />
              <span className="text-foreground inline-flex items-center gap-2 text-sm font-medium">
                Explore this home
                <ArrowRight
                  className="size-4 transition-transform motion-safe:group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}

function SecondaryProject({
  property,
  className,
  aspect,
}: {
  property: Property;
  className?: string;
  aspect: string;
}) {
  return (
    <a
      href={propertyHref(property.slug)}
      className={`focus-visible:ring-ring group block focus-visible:ring-2 focus-visible:outline-none ${className ?? ""}`}
    >
      <div
        className={`bg-background-alt relative w-full overflow-hidden ${aspect}`}
      >
        <PropertyMedia
          property={property}
          sizes="(min-width: 1024px) 45vw, 100vw"
          showPreviewLabel
          className="p-8"
        />
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={property.status} size="sm" />
          <span className="text-foreground-subtle text-xs tracking-[0.18em] uppercase">
            {property.suburb}
          </span>
        </div>
        <h3 className="font-display text-foreground mt-3 text-xl leading-tight sm:text-2xl">
          {property.name}
        </h3>
        <p className="text-foreground-subtle mt-2 max-w-md text-sm leading-relaxed">
          {property.summary}
        </p>
      </div>
    </a>
  );
}
