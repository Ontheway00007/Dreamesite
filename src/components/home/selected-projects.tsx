import { ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { propertyHref } from "@/lib/routes";
import { getFeaturedProperties } from "@/lib/properties/repository";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

/**
 * Selected projects: an edge-to-edge editorial section.
 *
 * ## Why this is not a card grid
 *
 * Cards suggest every item is equal. Editorial layout suggests curation.
 * The lead project spans the full viewport width with a cinematic crop.
 * Secondary projects break the grid intentionally: different sizes, different
 * aspect ratios, different information hierarchy.
 *
 * ## One hover, not a choreography
 *
 * Phase 7A set out to hit "intensity 9/10" and gave each card six simultaneous
 * hover reactions: the image scaled and rotated, two gradients crossfaded, and
 * four separate content layers lifted by increasing amounts so the whole block
 * appeared to float. Every one of those ran for 500ms to 900ms.
 *
 * That was the wrong target. A hover is not a first impression, it is something
 * a visitor triggers dozens of times while scanning a page, and animation at
 * that frequency should be reduced to the point of being barely noticeable
 * rather than amplified. Six overlapping 900ms transitions read as the page
 * being unsettled by the cursor, and they were still finishing after it moved
 * on.
 *
 * So each card now says one thing on hover: the photograph opens up slightly
 * and the scrim lifts off it. Titles take a colour, which is a state change
 * rather than a movement. Nothing translates. Everything lands inside 200ms.
 *
 * The entrance animations are a different matter and are unchanged: a section
 * reveal is seen once, so it can afford `--duration-slow`.
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
      {/*
        Section header. No eyebrow here on purpose: the neighbouring sections
        already carry one, and a small uppercase label above every single
        heading is what makes a page read as templated. The heading is enough.
      */}
      <Reveal>
        <Container width="stage">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2
              id="selected-projects-heading"
              className="font-display text-heading-2 text-foreground max-w-xl font-light"
            >
              Selected projects
            </h2>
            <p className="text-foreground-subtle max-w-sm text-sm leading-relaxed">
              A closer look at homes we have taken from land to handover across the
              northern corridor.
            </p>
          </div>
        </Container>
      </Reveal>

      {/* Lead project: edge to edge, cinematic. */}
      <LeadProject property={lead} />

      {/* Secondary projects: asymmetric, different treatments. */}
      {secondary.length > 0 ? (
        <RevealGroup stagger={0.08}>
          <Container
            width="stage"
            className="mt-8 grid gap-8 lg:mt-12 lg:grid-cols-12 lg:gap-12"
          >
            {/*
              The column span belongs on `RevealItem`, because `RevealItem` is
              the grid child. It used to be passed down to `SecondaryProject`,
              which renders the anchor *inside* that child, so the grid never saw
              it: both items auto-placed into a single column of a 12-column
              grid and each card rendered at a twelfth of the container from `lg`
              up, one word per line. This is why the section looked collapsed at
              desktop width.

              The vertical offset stays on the anchor rather than moving up with
              the span. `RevealItem` is a `motion.div` that animates `y`, and
              Framer Motion writes an inline transform when it settles, which
              would overwrite a `translate-y` utility on the same element.
            */}
            {secondary.map((property, index) => (
              <RevealItem
                key={property.id}
                className={index === 0 ? "lg:col-span-7" : "lg:col-span-5"}
              >
                <SecondaryProject
                  property={property}
                  variant={index === 0 ? "wide" : "tall"}
                  className={index === 0 ? undefined : "lg:translate-y-20"}
                />
              </RevealItem>
            ))}
          </Container>
        </RevealGroup>
      ) : null}
    </section>
  );
}

/**
 * Lead project: the hero treatment.
 *
 * Edge-to-edge photography with an overlay that lifts on hover. Typography
 * emerges from the image rather than sitting beside it.
 */
function LeadProject({ property }: { property: Property }) {
  return (
    <Reveal>
      <a
        href={propertyHref(property.slug)}
        className="focus-visible:ring-ring press group relative mt-10 block overflow-hidden focus-visible:ring-2 focus-visible:outline-none lg:mt-14"
      >
        {/*
          Edge to edge: no container padding, no border radius. The photograph
          bleeds to the viewport edges on mobile.
        */}
        <div className="bg-background-alt relative aspect-4/5 w-full overflow-hidden sm:aspect-16/9 lg:aspect-[2.6/1]">
          {/*
            The one hover move on this card. 800ms became
            `--duration-hover` (200ms): a scale that is still travelling a
            second after the cursor arrives feels like lag, not luxury.
          */}
          <div className="absolute inset-0 transition-transform duration-(--duration-hover) ease-luxe motion-safe:group-hover:scale-[1.03] motion-safe:group-focus-visible:scale-[1.03]">
            <PropertyMedia
              property={property}
              sizes="100vw"
              showPreviewLabel
              className="p-10"
            />
          </div>

          {/*
            Scrim. It exists to keep the overlaid text legible against an
            unknown photograph, so it lifts only slightly on hover: any more and
            the text it protects starts to fail contrast.

            The second gradient that used to sit on top of this one, a brass wash
            fading in from the bottom left, is gone. It tinted the photograph of
            a real house on every hover, which is a claim about the building
            rather than a piece of interface feedback.
          */}
          <div
            aria-hidden="true"
            className="from-background/95 via-background/20 absolute inset-0 bg-gradient-to-t to-transparent transition-opacity duration-(--duration-hover) ease-luxe motion-safe:group-hover:opacity-85"
          />

          {/* Content overlay. */}
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-12">
            <Container width="stage" className="px-0">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={property.status} size="sm" />
                <span className="text-foreground-muted text-label tracking-label uppercase">
                  {property.suburb}
                  {property.state ? `, ${property.state}` : ""}
                </span>
              </div>

              <h3 className="font-display text-heading-2 text-foreground mt-4 max-w-2xl font-light">
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
                    className="size-4 transition-transform duration-(--duration-hover) ease-luxe motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Container>
          </div>
        </div>
      </a>
    </Reveal>
  );
}

/**
 * Secondary project: two variants with different treatments.
 *
 * Each has its own aspect ratio and information layout. Not identical cards
 * with different content, but different compositions.
 *
 * Every hover state here is paired with `group-focus-visible`, which the
 * original was missing. The "View project" line used to be `opacity-0` and was
 * revealed only by `group-hover`, so a visitor navigating by keyboard could
 * focus this card and never see that it led anywhere, and a visitor on a
 * touchscreen never saw it at all. It is visible unconditionally now. Hiding a
 * call to action until the cursor finds it is not a reveal, it is a card with a
 * missing label for everyone who is not using a mouse.
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
        "focus-visible:ring-ring press group block focus-visible:ring-2 focus-visible:outline-none",
        className
      )}
    >
      {/* Photography with rounded corners, in contrast to the lead's edge-to-edge. */}
      <div
        className={cn(
          "bg-background-alt shadow-soft relative w-full overflow-hidden rounded-2xl",
          "transition-shadow duration-(--duration-hover) ease-luxe",
          "motion-safe:group-hover:shadow-accent motion-safe:group-focus-visible:shadow-accent",
          variant === "wide" ? "aspect-16/10" : "aspect-3/4"
        )}
      >
        {/*
          One move: the photograph opens up. `scale-110` at 900ms was a
          noticeable crop into the image, which on a photograph of a house means
          losing a corner of the roofline. 1.03 at 200ms reads as the image
          responding without recomposing it.

          The card itself no longer scales as well. Scaling the frame and the
          image inside it by different amounts at the same time was what made
          the edges look soft on hover.
        */}
        <div className="absolute inset-0 transition-transform duration-(--duration-hover) ease-luxe motion-safe:group-hover:scale-[1.03] motion-safe:group-focus-visible:scale-[1.03]">
          <PropertyMedia
            property={property}
            sizes="(min-width: 1024px) 50vw, 100vw"
            showPreviewLabel
            className="p-8"
          />
        </div>

        {/* Scrim, so the badge stays legible over an unknown photograph. */}
        <div
          aria-hidden="true"
          className="from-background/60 absolute inset-0 bg-gradient-to-t to-transparent transition-opacity duration-(--duration-hover) ease-luxe motion-safe:group-hover:opacity-70 motion-safe:group-focus-visible:opacity-70"
        />

        {/*
          The badge is a status, so it holds still. It used to scale and lift on
          hover, which made the one element on the card carrying real
          information behave like decoration.
        */}
        <div className="absolute top-4 left-4">
          <StatusBadge status={property.status} size="sm" />
        </div>
      </div>

      {/* Content below the image. */}
      <div className="mt-5">
        <p className="text-foreground-subtle text-label tracking-label uppercase">
          {property.suburb}
        </p>

        <h3 className="font-display text-heading-3 text-foreground mt-2 transition-colors duration-(--duration-hover) motion-safe:group-hover:text-accent motion-safe:group-focus-visible:text-accent">
          {property.name}
        </h3>

        {/*
          The summary used to fade to 70% opacity on hover. Reducing the
          legibility of the description at the exact moment someone is reading
          it inverted the intent.
        */}
        <p className="text-foreground-subtle mt-2 max-w-md text-sm leading-relaxed">
          {property.summary}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-foreground text-sm font-medium">
            View project
          </span>
          <ArrowRight
            className="size-4 transition-transform duration-(--duration-hover) ease-luxe motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1"
            aria-hidden="true"
          />
        </div>
      </div>
    </a>
  );
}

