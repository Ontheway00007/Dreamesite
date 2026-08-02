"use client";

import Image from "next/image";

import { motion } from "framer-motion";
import { Bath, BedDouble, Car, Ruler } from "lucide-react";

import { ArchitecturalFrame } from "@/components/media/architectural-frame";
import { StatusBadge } from "@/components/property/status-badge";
import { duration, easing } from "@/lib/animation/easing";
import { propertyImageUrl } from "@/lib/images/property-image";
import { cn } from "@/lib/utils/cn";
import type { PropertyPreview } from "@/types";

const hoverTransition = { duration: duration.slow, ease: easing.luxe };

export interface PropertyCardProps {
  property: PropertyPreview;
  /** Image sizes hint for the responsive loader. */
  sizes?: string;
  className?: string;
}

/**
 * Premium property card. Hover state is driven by Framer Motion variants on the
 * article, so the media, rule and label move as one composed gesture using
 * transforms only.
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
    <motion.article
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileFocus="hover"
      className={cn(
        "border-border bg-surface group relative overflow-hidden rounded-xl border",
        className,
      )}
    >
      <div className="bg-background-alt relative aspect-4/3 overflow-hidden">
        <motion.div
          variants={{ rest: { scale: 1 }, hover: { scale: 1.05 } }}
          transition={hoverTransition}
          className="absolute inset-0"
        >
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
        </motion.div>

        <div className="absolute inset-x-5 top-5 flex items-center justify-between gap-3">
          <StatusBadge status={property.status} />
          {imageUrl ? null : (
            <span className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
              Placeholder
            </span>
          )}
        </div>
      </div>

      <div className="p-6 md:p-7">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-heading-3 font-normal">
            {property.name}
          </h3>
          <p className="text-foreground-subtle text-xs font-medium tracking-[0.2em] uppercase">
            {property.suburb}
          </p>
        </div>

        <motion.div
          variants={{ rest: { scaleX: 1 }, hover: { scaleX: 2.4 } }}
          transition={hoverTransition}
          className="bg-accent mt-5 h-px w-10 origin-left"
        />

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
    </motion.article>
  );
}
