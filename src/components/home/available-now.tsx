import { ArrowRight } from "lucide-react";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { ENQUIRY_ANCHOR, propertyHref } from "@/lib/routes";
import { propertiesByStatus } from "@/lib/properties/portfolio-summary";
import { getProperties } from "@/lib/properties/repository";
import type { Property } from "@/types";

/**
 * Available now — the commercial section.
 *
 * Move-in-ready homes are the only ones a visitor can act on today, so they get
 * their own section and a light surface that breaks the dark rhythm of the page.
 * They are deliberately not mixed with completed or sold work: a portfolio piece
 * and a home you can inspect on Saturday are different propositions, and putting
 * them in one grid flattens that difference.
 *
 * When nothing is available the section still renders, with an honest statement
 * and a route to the enquiry form. Silence would leave a visitor wondering
 * whether the page had failed.
 */
export async function AvailableNow() {
  const properties = await getProperties();
  const available = propertiesByStatus(properties, "move-in-ready");

  return (
    <section
      aria-labelledby="available-now-heading"
      className="bg-foreground text-foreground-inverse py-20 lg:py-28"
    >
      <div className="mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-[0.7rem] tracking-[0.22em] text-black/55 uppercase">
              Ready to inspect
            </p>
            <h2
              id="available-now-heading"
              className="font-display mt-3 text-[clamp(1.9rem,3.6vw,3rem)] leading-[1.05] tracking-[-0.02em]"
            >
              {available.length > 0
                ? "Available now"
                : "Nothing available this week"}
            </h2>
          </div>

          {available.length > 0 ? (
            <p className="max-w-sm text-sm leading-relaxed text-black/65">
              {available.length === 1
                ? "One home is finished and ready to walk through."
                : `${available.length} homes are finished and ready to walk through.`}
            </p>
          ) : null}
        </div>

        {available.length === 0 ? (
          <div className="mt-10 max-w-2xl border-t border-black/15 pt-8">
            <p className="text-base leading-relaxed text-black/70">
              Every home we have built is either still on site or already handed
              over. Tell us the suburb and timeframe you are considering and we
              will let you know the moment something is ready.
            </p>
            <a
              href={ENQUIRY_ANCHOR}
              className="focus-visible:ring-ring group mt-6 inline-flex items-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
            >
              Tell us what you are after
              <ArrowRight
                className="size-4 transition-transform motion-safe:group-hover:translate-x-1"
                aria-hidden="true"
              />
            </a>
          </div>
        ) : (
          <ul className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-16">
            {available.map((property, index) => (
              <AvailableCard
                key={property.id}
                property={property}
                /* The first runs full width, so one home always leads. */
                featured={index === 0 && available.length > 2}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

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
        <div
          className={`relative w-full overflow-hidden bg-black/5 ${
            featured ? "aspect-16/9 lg:aspect-[2.6/1]" : "aspect-4/3"
          }`}
        >
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

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] tracking-[0.18em] text-black/55 uppercase">
              {property.suburb}
              {property.state ? `, ${property.state}` : ""}
            </p>
            <h3 className="font-display mt-2 text-xl leading-tight sm:text-2xl">
              {property.name}
            </h3>
          </div>
          {/* Only when the record carries one. */}
          {property.priceDisplay ? (
            <p className="shrink-0 text-sm font-medium text-black/80">
              {property.priceDisplay}
            </p>
          ) : null}
        </div>

        <p className="mt-3 max-w-xl text-sm leading-relaxed text-black/65">
          {property.summary}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-black/12 pt-5">
          <PropertySpecs
            property={property}
            size="sm"
            includeHouseSize
            className="[&_*]:!text-black/70"
          />
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            Explore this home
            <ArrowRight
              className="size-4 transition-transform motion-safe:group-hover:translate-x-1"
              aria-hidden="true"
            />
          </span>
        </div>
      </a>
    </li>
  );
}
