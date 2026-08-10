import { ArrowUpRight } from "lucide-react";

import { Section } from "@/components/layout/section";
import { serviceAreas } from "@/lib/site-config";

const positions = [
  { top: "72%", left: "25%" },
  { top: "45%", left: "52%" },
  { top: "19%", left: "72%" },
] as const;

/** A diagrammatic corridor: spatial and memorable, but never a fake map. */
export function ServiceAreasSection() {
  return (
    <Section
      id="locations"
      spacing="lg"
      divided
      aria-labelledby="service-areas-heading"
      className="overflow-hidden"
    >
      <div>
        <div className="grid items-end gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <p className="text-accent text-eyebrow font-medium uppercase">
              Where we build
            </p>
            <h2
              id="service-areas-heading"
              className="font-display text-display mt-5 max-w-4xl font-light"
            >
              Built across the north.
            </h2>
          </div>
          <p className="text-foreground-muted max-w-md leading-relaxed lg:col-span-4 lg:justify-self-end">
            Three established build areas connected by one northern Melbourne
            corridor: Mickleham, Craigieburn and Donnybrook.
          </p>
        </div>
      </div>

      <div className="mt-16 grid gap-10 lg:mt-24 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <div className="border-border relative aspect-[4/3] overflow-hidden rounded-[2rem] border bg-[#d8d0c2] text-[#050506] shadow-raised sm:aspect-[16/10]">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-45"
              style={{
                backgroundImage:
                  "radial-gradient(circle at center, transparent 0 27%, rgba(5,5,6,.12) 27.2% 27.5%, transparent 27.7% 41%, rgba(5,5,6,.1) 41.2% 41.5%, transparent 41.7%)",
              }}
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 800 500"
              className="absolute inset-0 h-full w-full"
              fill="none"
            >
              <path
                d="M110 430 C210 352 280 385 346 294 S473 224 555 170 642 120 720 66"
                stroke="#050506"
                strokeOpacity=".2"
                strokeWidth="28"
                strokeLinecap="round"
              />
              <path
                d="M110 430 C210 352 280 385 346 294 S473 224 555 170 642 120 720 66"
                stroke="var(--accent)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="2 14"
              />
            </svg>

            {serviceAreas.map((area, index) => (
              <div
                key={area}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={positions[index]}
              >
                <span className="bg-background border-accent relative block size-5 rounded-full border-2 shadow-[0_0_0_9px_rgba(5,5,6,.12)]">
                  <span className="bg-accent absolute inset-1 rounded-full" />
                </span>
                <span className="bg-background text-foreground absolute top-7 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-[0.625rem] font-medium tracking-[0.14em] whitespace-nowrap uppercase shadow-soft">
                  {area}
                </span>
              </div>
            ))}

            <p className="absolute right-5 bottom-4 text-[0.58rem] tracking-[0.16em] uppercase opacity-55 sm:right-7 sm:bottom-6">
              Corridor study · not to geographic scale
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 lg:pt-8">
          <div className="border-border border-t">
            {serviceAreas.map((area, index) => (
              <div key={area}>
                <div className="group border-border grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b py-7 sm:py-9">
                  <span className="text-foreground-subtle text-xs font-medium tracking-[0.2em] tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-heading-2 font-light transition-transform duration-(--duration-base) ease-luxe motion-safe:group-hover:translate-x-2">
                    {area}
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="text-foreground-subtle size-4 transition-[color,transform] duration-(--duration-base) motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:translate-x-1 group-hover:text-accent"
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-foreground-subtle mt-8 max-w-sm text-sm leading-relaxed">
            The portfolio map above shows only locations approved for public
            display. Exact addresses remain governed by each home&apos;s privacy
            setting.
          </p>
        </div>
      </div>
    </Section>
  );
}
