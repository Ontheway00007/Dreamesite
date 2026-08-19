import { ArrowRight, ArrowUpRight } from "lucide-react";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { getFeaturedProperties } from "@/lib/properties/repository";
import { PROPERTIES_ROUTE, propertyHref } from "@/lib/routes";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

/** Featured work arranged like a magazine feature, never a repeated card grid. */
export async function SelectedProjects() {
  const featured = await getFeaturedProperties();

  if (featured.length === 0) {
    return null;
  }

  const [lead, ...rest] = featured.slice(0, 3);

  return (
    <section
      aria-labelledby="selected-projects-heading"
      className="bg-background-alt relative overflow-hidden py-24 lg:py-36"
    >
      <div
        aria-hidden="true"
        className="outline-type absolute top-12 right-[-0.08em] font-display text-[clamp(8rem,20vw,22rem)] leading-none tracking-[-0.06em] opacity-35"
      >
        WORK
      </div>

      <div className="relative mx-auto max-w-[120rem] px-5 sm:px-8 lg:px-12">
        <div>
          <header className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <p className="editorial-kicker text-accent">Selected work</p>
              <h2
                id="selected-projects-heading"
                className="font-display text-heading-1 mt-7 max-w-4xl"
              >
                Work with a
                <span className="block pl-[1.15em] italic">point of view.</span>
              </h2>
            </div>
            <div className="lg:col-span-4 lg:pb-2">
              <p className="text-foreground-muted max-w-sm leading-relaxed">
                A closer look at homes carried from first decisions to finished
                rooms across the northern corridor.
              </p>
              <a
                href={PROPERTIES_ROUTE}
                className="text-foreground hover:text-accent group mt-6 inline-flex items-center gap-2 text-xs font-bold tracking-[0.14em] uppercase transition-colors"
              >
                View the full portfolio
                <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-1" aria-hidden />
              </a>
            </div>
          </header>
        </div>

        <LeadProject property={lead} />

        {rest.length > 0 ? (
          <div>
            <div className="mt-20 grid gap-16 lg:mt-28 lg:grid-cols-12 lg:gap-10">
              {rest.map((property, index) => (
                <div
                  key={property.id}
                  className={cn(
                    index === 0
                      ? "lg:col-span-7"
                      : "lg:col-span-4 lg:col-start-9 lg:mt-28",
                  )}
                >
                  <SecondaryProject property={property} index={index + 2} compact={index === 1} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LeadProject({ property }: { property: Property }) {
  return (
    <a
      href={propertyHref(property.slug)}
      className="focus-visible:ring-ring group mt-16 grid gap-8 focus-visible:ring-2 focus-visible:outline-none lg:mt-24 lg:grid-cols-12 lg:items-end lg:gap-12"
    >
      <div className="editorial-frame bg-surface border-border relative aspect-[5/4] overflow-hidden border shadow-raised sm:aspect-[16/10] lg:col-span-8">
        <div className="absolute inset-0 transition-transform duration-[1100ms] ease-luxe motion-safe:group-hover:scale-[1.035]">
          <PropertyMedia property={property} sizes="(min-width: 1024px) 68vw, 100vw" showPreviewLabel className="p-10" />
        </div>
        <div className="absolute top-5 left-5 sm:top-7 sm:left-7">
          <StatusBadge status={property.status} size="sm" />
        </div>
        <span className="bg-accent text-accent-foreground absolute right-0 bottom-0 grid size-20 place-items-center rounded-tl-[3rem] font-display text-3xl italic sm:size-28 sm:text-5xl">
          01
        </span>
      </div>

      <div className="lg:col-span-4 lg:pb-8">
        <p className="text-accent text-[0.65rem] font-bold tracking-[0.2em] uppercase">
          {property.suburb}{property.state ? ` · ${property.state}` : ""}
        </p>
        <h3 className="font-display text-heading-2 mt-5 transition-colors duration-(--duration-base) group-hover:text-accent">
          {property.name}
        </h3>
        <p className="text-foreground-muted mt-5 max-w-lg leading-relaxed">
          {property.summary}
        </p>
        <PropertySpecs property={property} size="sm" includeHouseSize className="border-border mt-7 border-t pt-6" />
        <span className="text-foreground mt-7 inline-flex items-center gap-3 text-xs font-bold tracking-[0.14em] uppercase">
          Enter the project
          <span className="border-border-strong group-hover:border-accent grid size-9 place-items-center rounded-full border transition-[border-color,transform] motion-safe:group-hover:rotate-45">
            <ArrowUpRight className="size-4" aria-hidden />
          </span>
        </span>
      </div>
    </a>
  );
}

function SecondaryProject({
  property,
  index,
  compact,
}: {
  property: Property;
  index: number;
  compact: boolean;
}) {
  return (
    <a href={propertyHref(property.slug)} className="group block">
      <div
        className={cn(
          "bg-surface border-border relative overflow-hidden border shadow-soft",
          compact
            ? "aspect-[4/5] rounded-[5rem_0.75rem_0.75rem_0.75rem]"
            : "aspect-[16/11] rounded-[0.75rem_5rem_0.75rem_0.75rem]",
        )}
      >
        <div className="absolute inset-0 transition-transform duration-[900ms] ease-luxe motion-safe:group-hover:scale-105">
          <PropertyMedia property={property} sizes="(min-width: 1024px) 50vw, 100vw" showPreviewLabel className="p-8" />
        </div>
        <span className="paper-glass absolute top-4 right-4 rounded-full px-3 py-1.5 text-[0.62rem] font-bold tracking-[0.14em]">
          {String(index).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-6 grid grid-cols-[1fr_auto] items-start gap-6">
        <div>
          <p className="text-accent text-[0.6rem] font-bold tracking-[0.18em] uppercase">{property.suburb}</p>
          <h3 className="font-display mt-2 text-[clamp(1.8rem,3vw,3rem)] leading-none transition-colors group-hover:text-accent">
            {property.name}
          </h3>
          <p className="text-foreground-subtle mt-3 max-w-md text-sm leading-relaxed">{property.summary}</p>
        </div>
        <ArrowUpRight className="text-foreground-subtle mt-2 size-5 transition-[color,transform] group-hover:text-accent motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:translate-x-1" aria-hidden />
      </div>
    </a>
  );
}
