import { PropertyCard } from "@/components/property/property-card";
import type { Property } from "@/types";

export interface RelatedPropertiesProps {
  properties: readonly Property[];
}

/** Other homes worth looking at. Uses the same card as every other listing. */
export function RelatedProperties({ properties }: RelatedPropertiesProps) {
  if (properties.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 100vw"
        />
      ))}
    </div>
  );
}
