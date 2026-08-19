import { ArrowRight, ArrowUpRight } from "lucide-react";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { publicPriceLabel } from "@/lib/properties/display";
import { propertiesByStatus } from "@/lib/properties/portfolio-summary";
import { getProperties } from "@/lib/properties/repository";
import { ENQUIRY_ANCHOR, propertyHref } from "@/lib/routes";
import type { Property } from "@/types";

/** The commercially active homes receive a bold, unmistakable interruption. */
export async function AvailableNow() {
  const properties = await getProperties();
  const available = propertiesByStatus(properties, "move-in-ready");

  return (
    <section
      aria-labelledby="available-now-heading"
      className="relative overflow-hidden bg-[#ca4d31] py-24 text-[#fff8ed] lg:py-36"
    >
      <div aria-hidden="true" className="absolute -top-44 -right-28 size-[34rem] rounded-full border border-[#fff8ed]/18" />
      <div aria-hidden="true" className="absolute -top-24 -right-6 size-[22rem] rounded-full border border-[#172017]/24" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-[0.15em] -left-[0.05em] font-display text-[clamp(10rem,27vw,30rem)] leading-none tracking-[-0.07em] text-transparent opacity-35 [-webkit-text-stroke:1px_rgba(255,248,237,0.42)]">
        NOW
      </div>

      <div className="relative mx-auto max-w-[120rem] px-5 sm:px-8 lg:px-12">
        <header className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="editorial-kicker text-[#fff8ed]/72">Ready to inspect</p>
            <h2 id="available-now-heading" className="font-display mt-7 max-w-4xl text-[clamp(4rem,9vw,9rem)] leading-[0.8] tracking-[-0.05em]">
              {available.length > 0 ? (
                <>
                  Skip the wait.
                  <span className="block pl-[0.85em] italic">Walk in.</span>
                </>
              ) : (
                <>
                  Nothing rushed.
                  <span className="block pl-[0.85em] italic">Nothing fake.</span>
                </>
              )}
            </h2>
          </div>
          <p className="max-w-sm text-base leading-relaxed text-[#fff8ed]/76 lg:col-span-4 lg:pb-2">
            {available.length === 0
              ? "There are no finished homes available today. Tell us what you need and we will respond when a genuine match is ready."
              : available.length === 1
                ? "One finished home is ready to walk through now."
                : `${available.length} finished homes are ready to walk through now.`}
          </p>
        </header>

        {available.length === 0 ? (
          <a
            href={ENQUIRY_ANCHOR}
            className="group mt-14 inline-flex min-h-14 items-center gap-3 rounded-[0.45rem_1.6rem_1.6rem_1.6rem] bg-[#172017] px-7 text-xs font-bold tracking-[0.14em] uppercase shadow-raised transition-transform motion-safe:hover:-translate-y-1"
          >
            Tell us what you are looking for
            <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-1" aria-hidden />
          </a>
        ) : (
          <div>
            <ul className="mt-16 space-y-8 lg:mt-24 lg:space-y-12">
              {available.map((property, index) => (
                <li key={property.id} className="list-none">
                  <AvailableHome property={property} index={index} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function AvailableHome({ property, index }: { property: Property; index: number }) {
  const priceLabel = publicPriceLabel(property.priceDisplay);

  return (
    <div>
      <a
        href={propertyHref(property.slug)}
        className="group grid overflow-hidden rounded-[0.75rem_0.75rem_5rem_0.75rem] border border-[#fff8ed]/22 bg-[#fff8ed] text-[#172017] shadow-raised lg:grid-cols-12"
      >
        <div className="relative min-h-[24rem] overflow-hidden lg:col-span-7 lg:min-h-[34rem]">
          <div className="absolute inset-0 transition-transform duration-[1000ms] ease-luxe motion-safe:group-hover:scale-105">
            <PropertyMedia property={property} sizes="(min-width: 1024px) 58vw, 100vw" showPreviewLabel className="p-10" labelClassName="text-[#172017]/55" />
          </div>
          <span className="absolute top-5 left-5 rounded-full bg-[#ca4d31] px-4 py-2 text-[0.62rem] font-bold tracking-[0.16em] text-white uppercase shadow-soft">
            Available now
          </span>
        </div>

        <div className="flex flex-col justify-between p-7 sm:p-10 lg:col-span-5 lg:p-12">
          <div>
            <div className="flex items-center justify-between gap-5 border-b border-[#172017]/14 pb-5">
              <p className="text-[0.62rem] font-bold tracking-[0.18em] text-[#ca4d31] uppercase">
                {property.suburb}{property.state ? ` · ${property.state}` : ""}
              </p>
              <span className="font-display text-3xl italic text-[#172017]/35">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="font-display mt-8 text-[clamp(2.6rem,5vw,5rem)] leading-[0.88] tracking-[-0.035em]">
              {property.name}
            </h3>
            <p className="mt-6 max-w-lg leading-relaxed text-[#172017]/68">{property.summary}</p>
            {priceLabel ? <p className="mt-6 text-sm font-bold">{priceLabel}</p> : null}
          </div>

          <div className="mt-10">
            <PropertySpecs property={property} size="sm" includeHouseSize className="[&_*]:!text-[#172017]/70" />
            <span className="mt-8 flex items-center justify-between border-t border-[#172017]/14 pt-6 text-xs font-bold tracking-[0.14em] uppercase">
              Walk through this home
              <span className="grid size-11 place-items-center rounded-full bg-[#172017] text-[#fff8ed] transition-transform motion-safe:group-hover:rotate-45">
                <ArrowUpRight className="size-5" aria-hidden />
              </span>
            </span>
          </div>
        </div>
      </a>
    </div>
  );
}
