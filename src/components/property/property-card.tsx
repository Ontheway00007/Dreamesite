import Link from "next/link";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { propertyHref } from "@/lib/routes";
import { cn } from "@/lib/utils/cn";
import type { PropertyPreview } from "@/types";

export interface PropertyCardProps {
  property: PropertyPreview;
  /** Image sizes hint for the responsive loader. */
  sizes?: string;
  className?: string;
}

/**
 * Premium property card, as a Server Component.
 *
 * IMPORTANT — stretched link layering. The title is the card's only interactive
 * element, and its `::after` covers the whole card so the entire surface is
 * clickable. That gives one tab stop and no nested links, but it also means any
 * additional control added inside this card — favourite, gallery, compare —
 * would sit underneath the stretched link and be unreachable. Adding one
 * requires dropping the stretched-link pattern in favour of a titled link plus
 * separately positioned controls, with the card's own hover state reworked.
 *
 * Hover and keyboard focus share the same treatment through `group-hover` and
 * `group-focus-within`, which is why no animation library is needed here.
 */
export function PropertyCard({
  property,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  className,
}: PropertyCardProps) {
  return (
    <article
      className={cn(
        "group border-border bg-surface focus-within:border-accent hover:border-border-strong relative overflow-hidden rounded-xl border transition-colors duration-(--duration-base)",
        className,
      )}
    >
      <div className="bg-background-alt relative aspect-4/3 overflow-hidden">
        <div className="absolute inset-0 transition-transform duration-(--duration-slow) ease-luxe group-hover:scale-105 group-focus-within:scale-105">
          <PropertyMedia
            property={property}
            sizes={sizes}
            showPreviewLabel={false}
          />
        </div>

        <StatusBadge
          status={property.status}
          className="absolute top-5 left-5"
        />

        {property.heroImage ? null : (
          <span className="text-foreground-subtle text-label tracking-label absolute right-5 bottom-4 font-medium uppercase">
            Material study
          </span>
        )}
      </div>

      <div className="p-6 md:p-7">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-heading-3 font-normal">
            <Link
              href={propertyHref(property.slug)}
              className="group-hover:text-accent transition-colors duration-(--duration-base) after:absolute after:inset-0 after:content-['']"
            >
              {property.name}
            </Link>
          </h3>
          <p className="text-foreground-subtle text-label tracking-label font-medium uppercase">
            {property.suburb}
          </p>
        </div>

        <div className="bg-accent mt-5 h-px w-10 origin-left transition-transform duration-(--duration-slow) ease-luxe group-hover:scale-x-[2.4] group-focus-within:scale-x-[2.4]" />

        <p className="text-foreground-muted mt-5 text-sm leading-relaxed">
          {property.summary}
        </p>

        <PropertySpecs property={property} className="mt-7" />
      </div>
    </article>
  );
}
