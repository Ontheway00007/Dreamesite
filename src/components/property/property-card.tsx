import Image from "next/image";
import Link from "next/link";

import { Bath, BedDouble, Car, Ruler } from "lucide-react";

import { ArchitecturalFrame } from "@/components/media/architectural-frame";
import { StatusBadge } from "@/components/property/status-badge";
import { propertyImageUrl } from "@/lib/images/property-image";
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
 * The title is the card's single link and it stretches over the whole card
 * through a pseudo-element, so there is one interactive control, one tab stop
 * and no nested links. Hover and keyboard focus share the same treatment:
 * `group-hover` and `group-focus-within` drive identical CSS transitions, which
 * removes the need for a JavaScript animation library here.
 */
export function PropertyCard({
  property,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  className,
}: PropertyCardProps) {
  const imageUrl = propertyImageUrl(property.imagePath);

  const specs = [
    { icon: BedDouble, value: `${property.bedrooms}`, label: "bedrooms" },
    { icon: Bath, value: `${property.bathrooms}`, label: "bathrooms" },
    { icon: Car, value: `${property.carSpaces}`, label: "car spaces" },
    { icon: Ruler, value: `${property.landSize} m²`, label: "land size" },
  ];

  return (
    <article
      className={cn(
        "group border-border bg-surface focus-within:border-accent hover:border-border-strong relative overflow-hidden rounded-xl border transition-colors duration-(--duration-base)",
        className,
      )}
    >
      <div className="bg-background-alt relative aspect-4/3 overflow-hidden">
        <div className="absolute inset-0 transition-transform duration-(--duration-slow) ease-luxe group-hover:scale-105 group-focus-within:scale-105">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={`${property.name}, ${property.suburb}`}
              fill
              sizes={sizes}
              className="object-cover"
            />
          ) : (
            <div className="text-foreground-subtle/45 h-full w-full p-6">
              <ArchitecturalFrame variant={property.placeholderVariant} />
            </div>
          )}
        </div>

        <StatusBadge status={property.status} className="absolute top-5 left-5" />

        {imageUrl ? null : (
          <span className="text-foreground-subtle absolute right-5 bottom-4 text-[0.625rem] font-medium tracking-[0.2em] uppercase">
            Architectural preview
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
          <p className="text-foreground-subtle text-xs font-medium tracking-[0.2em] uppercase">
            {property.suburb}
          </p>
        </div>

        <div className="bg-accent mt-5 h-px w-10 origin-left transition-transform duration-(--duration-slow) ease-luxe group-hover:scale-x-[2.4] group-focus-within:scale-x-[2.4]" />

        <p className="text-foreground-muted mt-5 text-sm leading-relaxed">
          {property.summary}
        </p>

        <dl className="text-foreground-subtle mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {specs.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon size={15} aria-hidden />
              <dt className="sr-only">{label}</dt>
              <dd className="text-foreground-muted">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}
