import Image from "next/image";

import { ArchitecturalFrame } from "@/components/media/architectural-frame";
import { PropertyGallery } from "@/components/property/detail/property-gallery";
import { galleryVisuals } from "@/lib/properties/media";
import type { Property } from "@/types";

export interface PropertyShowcaseProps {
  property: Property;
}

/**
 * The property's main visual.
 *
 * A single visual renders entirely on the server. The interactive gallery is
 * only used once a property has more than one still, which is what keeps this
 * page free of client JavaScript until photography exists.
 */
export function PropertyShowcase({ property }: PropertyShowcaseProps) {
  const visuals = galleryVisuals(property);
  const alt = `${property.name}, ${property.suburb}`;

  if (visuals.length > 1) {
    return <PropertyGallery visuals={visuals} alt={alt} />;
  }

  const [visual] = visuals;

  return (
    <figure>
      <div className="border-border bg-background-alt relative aspect-16/9 overflow-hidden rounded-xl border">
        {visual.url ? (
          <Image
            src={visual.url}
            alt={alt}
            fill
            sizes="(min-width: 1024px) 60rem, 100vw"
            className="object-cover"
            priority
          />
        ) : (
          <>
            <div className="text-foreground-subtle/45 h-full w-full p-10">
              <ArchitecturalFrame variant={visual.placeholderVariant} />
            </div>
            <figcaption className="text-foreground-subtle absolute right-6 bottom-5 text-[0.625rem] font-medium tracking-[0.2em] uppercase">
              Architectural preview
            </figcaption>
          </>
        )}
      </div>
    </figure>
  );
}
