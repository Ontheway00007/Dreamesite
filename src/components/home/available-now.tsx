import { ArrowRight } from "lucide-react";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { ENQUIRY_ANCHOR, propertyHref } from "@/lib/routes";
import { propertiesByStatus } from "@/lib/properties/portfolio-summary";
import { getProperties } from "@/lib/properties/repository";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

/**
 * Available now — the commercial section with purposeful micro-interactions.
 * 
 * ## Phase 7A Enhancement (Intensity: 9/10)
 * 
 * Light surface breaks the dark rhythm. Micro-interactions are purposeful:
 * hover reveals depth, price highlights to show commercial intent, specs
 * animate to show measurements matter. Every animation explains something.
 * 
 * ## Why this section exists
 * 
 * Move-in-ready homes are actionable today. Portfolio pieces are retrospective.
 * Mixing them would flatten that distinction. This section gets its own visual
 * treatment (light background) and enhanced interactions because these homes
 * demand attention differently.
 * 
 * ## Micro-interactions with purpose
 * 
 * - Image scale on hover = "see more detail"
 * - Price highlight = "commercial availability"
 * - Specs slide = "precise measurements"
 * - Border pulse = "active listing"
 * - CTA arrow extends = "clear path forward"
 * 
 * Not decoration. Information architecture through motion.
 * 
 * ## Honest empty state
 * 
 * Zero available = honest statement + enquiry CTA.
 * Better than silence or fake listings.
 *
 * ## Do not add "use client" to this file
 *
 * This is an async Server Component. Marking it `"use client"` makes it an
 * async Client Component, which React does not support: it is re-invoked in a
 * loop, and because the body awaits `getProperties()`, every iteration issues a
 * Supabase request from the browser.
 *
 * `RevealGroup` and `RevealItem` are already Client Components, and a Server
 * Component may render one. No directive is needed here to use them.
 */
export async function AvailableNow() {
  const properties = await getProperties();
  const available = propertiesByStatus(properties, "move-in-ready");

  return (
    <section
      aria-labelledby="available-now-heading"
      className="bg-foreground text-foreground-inverse relative overflow-hidden py-20 lg:py-28"
    >
      <div className="relative mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12">
        {/* Header with staggered reveal */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-[0.7rem] tracking-[0.22em] uppercase text-black/55 motion-safe:animate-[fadeIn_0.6s_var(--ease-entrance)_0.2s_both]">
              Ready to inspect
            </p>
            <h2
              id="available-now-heading"
              className="font-display mt-3 text-[clamp(1.9rem,3.6vw,3rem)] leading-[1.05] tracking-[-0.02em] motion-safe:animate-[fadeIn_0.6s_var(--ease-entrance)_0.3s_both]"
            >
              {available.length > 0
                ? "Available now"
                : "Nothing available this week"}
            </h2>
          </div>

          {available.length > 0 ? (
            <p className="max-w-sm text-sm leading-relaxed text-black/65 motion-safe:animate-[fadeIn_0.6s_var(--ease-entrance)_0.4s_both]">
              {available.length === 1
                ? "One home is finished and ready to walk through."
                : `${available.length} homes are finished and ready to walk through.`}
            </p>
          ) : null}
        </div>

        {/* Empty state with refined interaction */}
        {available.length === 0 ? (
          <div className="mt-10 max-w-2xl border-t border-black/15 pt-8 motion-safe:animate-[fadeIn_0.6s_var(--ease-entrance)_0.5s_both]">
            <p className="text-base leading-relaxed text-black/70">
              Every home we have built is either still on site or already handed
              over. Tell us the suburb and timeframe you are considering and we
              will let you know the moment something is ready.
            </p>
            <a
              href={ENQUIRY_ANCHOR}
              className="focus-visible:ring-ring group relative mt-6 inline-flex items-center gap-2 overflow-hidden rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition-all hover:gap-3 focus-visible:ring-2 focus-visible:outline-none"
            >
              {/* Hover background that slides in */}
              <span 
                aria-hidden="true"
                className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-black to-black/90 transition-transform duration-500 motion-safe:group-hover:translate-x-0"
              />
              <span className="relative">Tell us what you are after</span>
              <ArrowRight
                className="relative size-4 transition-transform duration-300 motion-safe:group-hover:translate-x-1"
                aria-hidden="true"
              />
            </a>
          </div>
        ) : (
          <RevealGroup stagger={0.1}>
            <ul className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-16">
              {available.map((property, index) => (
                <RevealItem key={property.id}>
                  <AvailableCard
                    property={property}
                    /* The first runs full width, so one home always leads. */
                    featured={index === 0 && available.length > 2}
                  />
                </RevealItem>
              ))}
            </ul>
          </RevealGroup>
        )}
      </div>
    </section>
  );
}

/**
 * Available card with layered micro-interactions.
 * 
 * Each interaction has purpose:
 * - Border pulse = "active listing, available now"
 * - Image scale = "see detail"
 * - Price highlight = "commercial focus"
 * - Specs slide = "measurements are precise"
 * - Arrow extends = "clear next step"
 */
function AvailableCard({
  property,
  featured,
}: {
  property: Property;
  featured: boolean;
}) {
  return (
    <li className={featured ? "lg:col-span-2" : undefined}>
      <a
        href={propertyHref(property.slug)}
        className="focus-visible:ring-ring group block focus-visible:ring-2 focus-visible:outline-none"
      >
        {/* Photography container with purposeful border pulse */}
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-xl bg-black/5 shadow-soft ring-1 ring-black/5 transition-all duration-700",
            // Border pulses to accent on hover = "active, available"
            "motion-safe:group-hover:ring-2 motion-safe:group-hover:ring-accent/40 motion-safe:group-hover:shadow-[0_8px_32px_-8px_rgba(194,147,91,0.3)]",
            featured ? "aspect-16/9 lg:aspect-[2.6/1]" : "aspect-4/3"
          )}
        >
          {/* Image with scale and slight rotation for depth */}
          <div className="absolute inset-0 transition-all duration-[900ms] ease-out motion-safe:group-hover:scale-105 motion-safe:group-hover:rotate-[0.5deg]">
            <PropertyMedia
              property={property}
              sizes={
                featured
                  ? "100vw"
                  : "(min-width: 1024px) 45vw, 100vw"
              }
              showPreviewLabel
              className="p-8"
            />
          </div>

          {/* Subtle gradient overlay that shifts on hover */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-100 transition-opacity duration-700 motion-safe:group-hover:opacity-0"
          />
        </div>

        {/* Content with staggered micro-interactions */}
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="transition-transform duration-500 motion-safe:group-hover:-translate-y-0.5">
            <p className="text-[0.7rem] tracking-[0.18em] uppercase text-black/55 transition-colors duration-300 motion-safe:group-hover:text-black/70">
              {property.suburb}
              {property.state ? `, ${property.state}` : ""}
            </p>
            <h3 className="font-display mt-2 text-xl leading-tight transition-colors duration-300 sm:text-2xl motion-safe:group-hover:text-black">
              {property.name}
            </h3>
          </div>

          {/* Price with purposeful highlight = "commercial intent" */}
          {property.priceDisplay ? (
            <div className="relative shrink-0 overflow-hidden rounded-md bg-black/5 px-3 py-1.5 transition-all duration-500 motion-safe:group-hover:bg-accent/10 motion-safe:group-hover:-translate-y-0.5">
              {/* Animated underline that reveals on hover */}
              <span 
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-0.5 translate-x-[-100%] bg-accent transition-transform duration-500 motion-safe:group-hover:translate-x-0"
              />
              <p className="relative text-sm font-medium text-black/80 transition-colors duration-300 motion-safe:group-hover:text-black">
                {property.priceDisplay}
              </p>
            </div>
          ) : null}
        </div>

        {/* Summary with subtle fade */}
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-black/65 transition-all duration-300 motion-safe:group-hover:text-black/80">
          {property.summary}
        </p>

        {/* Specs and CTA with choreographed reveal */}
        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-black/12 pt-5 transition-all duration-500 motion-safe:group-hover:border-black/20">
          {/* Specs slide in from left = "precise measurements" */}
          <div className="transition-all duration-500 motion-safe:group-hover:translate-x-1">
            <PropertySpecs
              property={property}
              size="sm"
              includeHouseSize
              className="[&_*]:!text-black/70 [&_*]:transition-colors [&_*]:duration-300 motion-safe:group-hover:[&_*]:!text-black/90"
            />
          </div>

          {/* CTA with extending arrow = "clear path forward" */}
          <span className="inline-flex items-center gap-2 text-sm font-medium transition-all duration-300 motion-safe:group-hover:gap-3">
            <span className="transition-colors duration-300 motion-safe:group-hover:text-black">
              Explore this home
            </span>
            <ArrowRight
              className="size-4 transition-all duration-300 motion-safe:group-hover:translate-x-2 motion-safe:group-hover:text-accent"
              aria-hidden="true"
            />
          </span>
        </div>
      </a>
    </li>
  );
}

