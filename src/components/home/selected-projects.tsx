import { ArrowRight } from "lucide-react";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { propertyHref } from "@/lib/routes";
import { getFeaturedProperties } from "@/lib/properties/repository";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

/**
 * Selected projects — edge-to-edge editorial experience.
 * 
 * ## Phase 7A Transformation (Intensity: 9/10)
 * 
 * Photography dominates. Images touch viewport edges. Each project has a
 * unique composition. Hover creates depth through layered state changes.
 * 
 * ## Why this is not a card grid
 * 
 * Cards suggest every item is equal. Editorial layout suggests curation.
 * The lead project spans the full viewport width with a cinematic crop.
 * Secondary projects break the grid intentionally—different sizes, different
 * aspect ratios, different information hierarchy.
 * 
 * ## Layered hover states
 * 
 * Hover doesn't just change one thing. It creates depth through choreographed
 * reactions: image scales, overlay shifts, typography moves, specs reveal.
 * The interaction feels designed, not templated.
 * 
 * ## Honest at any volume
 * 
 * Zero featured properties = no section (better than empty heading).
 * One project = lead composition only.
 * Two projects = lead + one secondary.
 * Three+ projects = lead + two secondary (asymmetric).
 *
 * ## Do not add "use client" to this file
 *
 * This is an async Server Component. Marking it `"use client"` makes it an
 * async Client Component, which React does not support: it is re-invoked in a
 * loop, and because the body awaits `getFeaturedProperties()`, every iteration
 * issues a Supabase request from the browser. That shipped once and flooded the
 * database until the tab exhausted its socket pool.
 *
 * `Reveal` and `RevealGroup` are already Client Components, and a Server
 * Component may render one. No directive is needed here to use them.
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
      className="border-border relative border-t py-20 lg:py-28"
    >
      {/* Section header with staggered reveal */}
      <Reveal>
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
      </Reveal>

      {/* Lead project — edge to edge, cinematic */}
      <LeadProject property={lead} />

      {/* Secondary projects — asymmetric, different treatments */}
      {secondary.length > 0 ? (
        <RevealGroup stagger={0.12}>
          <div className="mx-auto mt-8 grid max-w-[110rem] gap-8 px-5 sm:px-8 lg:mt-12 lg:grid-cols-12 lg:gap-12 lg:px-12">
            {secondary.map((property, index) => (
              <RevealItem key={property.id}>
                <SecondaryProject
                  property={property}
                  variant={index === 0 ? "wide" : "tall"}
                  className={
                    index === 0
                      ? "lg:col-span-7"
                      : "lg:col-span-5 lg:translate-y-20"
                  }
                />
              </RevealItem>
            ))}
          </div>
        </RevealGroup>
      ) : null}
    </section>
  );
}

/**
 * Lead project — the hero treatment.
 * 
 * Edge-to-edge photography with overlay that shifts on hover.
 * Typography emerges from the image, not sitting beside it.
 */
function LeadProject({ property }: { property: Property }) {
  return (
    <Reveal>
      <a
        href={propertyHref(property.slug)}
        className="focus-visible:ring-ring group relative mt-10 block overflow-hidden focus-visible:ring-2 focus-visible:outline-none lg:mt-14"
      >
        {/* 
          Edge to edge — no container padding, no border radius.
          The photograph bleeds to viewport edges on mobile.
        */}
        <div className="bg-background-alt relative aspect-4/5 w-full overflow-hidden sm:aspect-16/9 lg:aspect-[2.6/1]">
          {/* Image with scale hover */}
          <div className="absolute inset-0 transition-transform duration-[800ms] ease-out motion-safe:group-hover:scale-105">
            <PropertyMedia
              property={property}
              sizes="100vw"
              showPreviewLabel
              className="p-10"
            />
          </div>

          {/* Layered gradient overlay that lightens on hover */}
          <div
            aria-hidden="true"
            className="from-background/95 via-background/20 absolute inset-0 bg-gradient-to-t to-transparent transition-opacity duration-700 motion-safe:group-hover:opacity-70"
          />
          
          {/* Accent gradient that appears on hover */}
          <div
            aria-hidden="true"
            className="from-accent/20 absolute inset-0 bg-gradient-to-tr from-bottom-left to-transparent opacity-0 transition-opacity duration-700 motion-safe:group-hover:opacity-100"
          />

          {/* Content overlay */}
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-12">
            <div className="mx-auto max-w-[110rem]">
              {/* Meta line with staggered movement */}
              <div className="flex flex-wrap items-center gap-3 transition-transform duration-500 motion-safe:group-hover:-translate-y-1">
                <StatusBadge status={property.status} size="sm" />
                <span className="text-foreground-muted text-xs tracking-[0.18em] uppercase">
                  {property.suburb}
                  {property.state ? `, ${property.state}` : ""}
                </span>
              </div>

              {/* Title with larger movement */}
              <h3 className="font-display text-foreground mt-4 max-w-2xl text-[clamp(1.6rem,3.4vw,2.75rem)] leading-[1.05] transition-transform duration-500 motion-safe:group-hover:-translate-y-2">
                {property.name}
              </h3>

              {/* Summary with fade reveal */}
              <p className="text-foreground-muted mt-3 max-w-xl text-sm leading-relaxed transition-all duration-500 sm:text-base motion-safe:group-hover:-translate-y-2 motion-safe:group-hover:text-foreground">
                {property.summary}
              </p>

              {/* Specs and CTA with maximum movement and reveal */}
              <div className="mt-6 flex flex-wrap items-center gap-6 transition-all duration-500 motion-safe:group-hover:-translate-y-3">
                <div className="transition-opacity duration-500 motion-safe:group-hover:opacity-100 opacity-80">
                  <PropertySpecs property={property} size="sm" includeHouseSize />
                </div>
                <span className="text-foreground inline-flex items-center gap-2 text-sm font-medium">
                  Explore this home
                  <ArrowRight
                    className="size-4 transition-transform duration-300 motion-safe:group-hover:translate-x-2"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </div>
          </div>
        </div>
      </a>
    </Reveal>
  );
}

/**
 * Secondary project — two variants with different treatments.
 * 
 * Each has unique aspect ratio, hover behavior, and information layout.
 * Not identical cards with different content—different compositions entirely.
 */
function SecondaryProject({
  property,
  variant,
  className,
}: {
  property: Property;
  variant: "wide" | "tall";
  className?: string;
}) {
  return (
    <a
      href={propertyHref(property.slug)}
      className={cn(
        "focus-visible:ring-ring group block focus-visible:ring-2 focus-visible:outline-none",
        className
      )}
    >
      {/* Photography with rounded corners (contrast to lead's edge-to-edge) */}
      <div
        className={cn(
          "bg-background-alt relative w-full overflow-hidden rounded-2xl shadow-soft transition-all duration-700",
          "motion-safe:group-hover:shadow-accent motion-safe:group-hover:scale-[1.02]",
          variant === "wide" ? "aspect-16/10" : "aspect-3/4"
        )}
      >
        {/* Image scales on hover */}
        <div className="absolute inset-0 transition-transform duration-[900ms] ease-out motion-safe:group-hover:scale-110">
          <PropertyMedia
            property={property}
            sizes="(min-width: 1024px) 50vw, 100vw"
            showPreviewLabel
            className="p-8"
          />
        </div>

        {/* Subtle overlay that disappears on hover */}
        <div
          aria-hidden="true"
          className="from-background/60 absolute inset-0 bg-gradient-to-t to-transparent opacity-100 transition-opacity duration-700 motion-safe:group-hover:opacity-30"
        />

        {/* Status badge positioned absolutely */}
        <div className="absolute top-4 left-4 transition-all duration-500 motion-safe:group-hover:scale-110 motion-safe:group-hover:-translate-y-1">
          <StatusBadge status={property.status} size="sm" />
        </div>
      </div>

      {/* Content below image */}
      <div className="mt-5 transition-transform duration-500 motion-safe:group-hover:-translate-y-1">
        {/* Suburb line */}
        <p className="text-foreground-subtle text-xs tracking-[0.18em] uppercase transition-colors duration-300 motion-safe:group-hover:text-accent">
          {property.suburb}
        </p>

        {/* Title */}
        <h3 className="font-display text-foreground mt-2 text-xl leading-tight transition-colors duration-300 sm:text-2xl motion-safe:group-hover:text-accent">
          {property.name}
        </h3>

        {/* Summary */}
        <p className="text-foreground-subtle mt-2 max-w-md text-sm leading-relaxed transition-opacity duration-300 motion-safe:group-hover:opacity-70">
          {property.summary}
        </p>

        {/* CTA that reveals on hover */}
        <div className="mt-4 flex items-center gap-2 opacity-0 transition-all duration-300 motion-safe:group-hover:opacity-100">
          <span className="text-foreground text-sm font-medium">
            View project
          </span>
          <ArrowRight
            className="size-4 transition-transform duration-300 motion-safe:group-hover:translate-x-1"
            aria-hidden="true"
          />
        </div>
      </div>
    </a>
  );
}

