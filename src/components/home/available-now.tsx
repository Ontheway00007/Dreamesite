import { ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { ENQUIRY_ANCHOR, propertyHref } from "@/lib/routes";
import { propertiesByStatus } from "@/lib/properties/portfolio-summary";
import { getProperties } from "@/lib/properties/repository";
import { publicPriceLabel } from "@/lib/properties/display";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

/**
 * Available now: the one section on the page that inverts.
 *
 * ## Why this section exists
 *
 * Move-in-ready homes are actionable today. Portfolio pieces are
 * retrospective. Mixing them would flatten that distinction, so this section
 * takes the inverted surface and the rest of the page does not. Inverting
 * exactly one section is a deliberate device; inverting several would just make
 * the page feel like it changes identity as you scroll.
 *
 * ## Two corrections to the Phase 7A version
 *
 * **Colour.** The card title took `group-hover:text-black`. In the dark theme
 * this section renders as a pale panel and black text on it was fine, which is
 * why it went unnoticed. In the daylight theme `--foreground` is `#211e1a`, so
 * the panel is dark and its text is light: hovering a card turned the title
 * black on near-black and the heading vanished. It underlines instead now; see
 * the note on the heading for why the accent is not the right repair on an
 * inverted surface. A hard-coded `rgba(194,147,91,0.3)` glow had the same
 * problem in reverse, ignoring the daylight theme's warmer shadow base, and is
 * a token now. A literal colour in a two-theme system is a bug with a delay
 * on it.
 *
 * **Timing.** The header used load-time keyframes with delays of 0.2s to 0.4s.
 * This section sits several screens down, so those animations had always
 * finished before anybody scrolled to it: the entrance was being spent on an
 * empty viewport. They are in-view reveals now, which is what the rest of the
 * page uses and what the effect was written to be. The card hover states came
 * down from 500ms to 900ms to a single move inside 200ms, for the reasons set
 * out at the top of `selected-projects.tsx`.
 *
 * ## Honest empty state
 *
 * Zero available means an honest statement and an enquiry route, which is
 * better than silence or a fake listing.
 *
 * ## Do not add "use client" to this file
 *
 * This is an async Server Component. Marking it `"use client"` makes it an
 * async Client Component, which React does not support: it is re-invoked in a
 * loop, and because the body awaits `getProperties()`, every iteration issues a
 * Supabase request from the browser.
 *
 * `Reveal`, `RevealGroup` and `RevealItem` are already Client Components, and a
 * Server Component may render one. No directive is needed here to use them.
 */
export async function AvailableNow() {
  const properties = await getProperties();
  const available = propertiesByStatus(properties, "move-in-ready");

  return (
    <section
      aria-labelledby="available-now-heading"
      className="bg-foreground text-foreground-inverse relative overflow-hidden py-20 lg:py-28"
    >
      <Container width="stage" className="relative">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-foreground-inverse/55 text-eyebrow tracking-eyebrow font-medium uppercase">
                Ready to inspect
              </p>
              <h2
                id="available-now-heading"
                className="font-display text-heading-2 mt-3 font-light"
              >
                {available.length > 0
                  ? "Available now"
                  : "Nothing available this week"}
              </h2>
            </div>

            {available.length > 0 ? (
              <p className="text-foreground-inverse/65 max-w-sm text-sm leading-relaxed">
                {available.length === 1
                  ? "One home is finished and ready to walk through."
                  : `${available.length} homes are finished and ready to walk through.`}
              </p>
            ) : null}
          </div>
        </Reveal>

        {available.length === 0 ? (
          <Reveal delay={0.08}>
            <div className="border-foreground-inverse/15 mt-10 max-w-2xl border-t pt-8">
              <p className="text-foreground-inverse/70 text-base leading-relaxed">
                Every home we have built is either still on site or already
                handed over. Tell us the suburb and timeframe you are considering
                and we will let you know the moment something is ready.
              </p>
              {/*
                The shared Button rather than a hand-rolled anchor. Every action
                elsewhere on the site is a pill; this one was a 0.5rem
                rectangle, and it also animated `gap` on hover, which is a
                layout property and so forces a reflow on every frame of the
                transition. The arrow translates instead.
              */}
              <Button
                href={ENQUIRY_ANCHOR}
                variant="accent"
                size="md"
                className="press group mt-6"
                iconRight={
                  <ArrowRight
                    className="size-4 transition-transform duration-(--duration-hover) ease-luxe motion-safe:group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                }
              >
                Tell us what you are after
              </Button>
            </div>
          </Reveal>
        ) : (
          <RevealGroup stagger={0.08}>
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
      </Container>
    </section>
  );
}

/**
 * One available home.
 *
 * Hover does two things: the photograph opens up and the frame takes an accent
 * ring. Everything else holds still. The version this replaces moved nine
 * separate elements at once, including rotating the photograph by half a degree
 * and growing the gap inside the call to action, and the price sat in a box
 * that lifted and changed colour while an underline swept in beneath it.
 *
 * The price is the most consequential number on the card. It should be easy to
 * read at rest, which means it should not be in motion at the moment someone
 * looks at it.
 */
function AvailableCard({
  property,
  featured,
}: {
  property: Property;
  featured: boolean;
}) {
  const priceLabel = publicPriceLabel(property.priceDisplay);

  return (
    <li className={featured ? "lg:col-span-2" : undefined}>
      <a
        href={propertyHref(property.slug)}
        className="focus-visible:ring-ring press group block focus-visible:ring-2 focus-visible:outline-none"
      >
        {/*
          The frame takes an accent ring on hover, which is the one signal that
          says "this listing is live". `shadow-accent` replaces the literal
          `rgba(194,147,91,0.3)` that used to be here: the token is redefined
          with a warmer base in the daylight theme, the literal was not.
        */}
        <div
          className={cn(
            "bg-foreground-inverse/5 ring-foreground-inverse/5 shadow-soft relative w-full overflow-hidden rounded-xl ring-1",
            "transition-shadow duration-(--duration-hover) ease-luxe",
            "motion-safe:group-hover:ring-accent/40 motion-safe:group-hover:shadow-accent",
            "motion-safe:group-focus-visible:ring-accent/40 motion-safe:group-focus-visible:shadow-accent",
            featured ? "aspect-16/9 lg:aspect-[2.6/1]" : "aspect-4/3"
          )}
        >
          {/*
            Scale only. The half-degree rotation that used to accompany it read
            as the photograph slipping in its frame rather than as depth, and on
            an image of a house every straight line in the composition tilts with
            it.
          */}
          <div className="absolute inset-0 transition-transform duration-(--duration-hover) ease-luxe motion-safe:group-hover:scale-[1.03] motion-safe:group-focus-visible:scale-[1.03]">
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

          <div
            aria-hidden="true"
            className="from-foreground-inverse/10 absolute inset-0 bg-gradient-to-t to-transparent transition-opacity duration-(--duration-hover) ease-luxe motion-safe:group-hover:opacity-0 motion-safe:group-focus-visible:opacity-0"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-foreground-inverse/55 text-label tracking-label uppercase">
              {property.suburb}
              {property.state ? `, ${property.state}` : ""}
            </p>
            {/*
              The hover signal here is an underline, not a colour.

              What was here was `group-hover:text-black`, which vanished against
              the daylight theme's dark panel. The obvious repair is
              `text-accent`, and it is what the cards on `bg-background` use, but
              it does not survive a contrast check on this surface: brass on the
              dark theme's pale panel measures about 2.4:1, and the daylight
              theme's darker brass on its dark panel about 3.2:1. The first
              fails outright and the second only passes while the heading is
              large enough to count as large text, which it is not at narrow
              viewports where the clamp bottoms out at 22px.

              An underline costs no contrast in either theme, and on a title that
              is genuinely a link it is the more honest affordance anyway. The
              accent still appears on hover, on the ring around the photograph,
              where it is decoration and carries no text.
            */}
            <h3 className="font-display text-heading-3 mt-2 underline decoration-transparent decoration-1 underline-offset-4 transition-[text-decoration-color] duration-(--duration-hover) group-hover:decoration-current group-focus-visible:decoration-current">
              {property.name}
            </h3>
          </div>

          {/* The price holds still. See the note above this component. */}
          {priceLabel ? (
            <div className="bg-foreground-inverse/5 shrink-0 rounded-md px-3 py-1.5">
              <p className="text-foreground-inverse/80 text-sm font-medium">
                {priceLabel}
              </p>
            </div>
          ) : null}
        </div>

        <p className="text-foreground-inverse/65 mt-3 max-w-xl text-sm leading-relaxed">
          {property.summary}
        </p>

        <div className="border-foreground-inverse/12 mt-5 flex flex-wrap items-center gap-6 border-t pt-5">
          <PropertySpecs
            property={property}
            size="sm"
            includeHouseSize
            className="[&_*]:!text-foreground-inverse/70"
          />

          <span className="inline-flex items-center gap-2 text-sm font-medium">
            Explore this home
            <ArrowRight
              className="size-4 transition-transform duration-(--duration-hover) ease-luxe motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1"
              aria-hidden="true"
            />
          </span>
        </div>
      </a>
    </li>
  );
}

