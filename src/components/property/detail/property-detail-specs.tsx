import { propertyStatusTokens } from "@/lib/design/property-status";
import type { Property } from "@/types";

export interface PropertyDetailSpecsProps {
  property: Property;
}

/**
 * The specification table. Only measured values appear: a figure the record does
 * not hold is left out rather than shown as unknown.
 */
export function PropertyDetailSpecs({ property }: PropertyDetailSpecsProps) {
  const rows: ReadonlyArray<{ label: string; value: string }> = [
    { label: "Bedrooms", value: String(property.bedrooms) },
    { label: "Bathrooms", value: String(property.bathrooms) },
    { label: "Car spaces", value: String(property.carSpaces) },
    ...(property.landSize > 0
      ? [{ label: "Land size", value: `${property.landSize} m²` }]
      : []),
    ...(property.houseSize && property.houseSize > 0
      ? [{ label: "Internal area", value: `${property.houseSize} m²` }]
      : []),
    { label: "Status", value: propertyStatusTokens[property.status].label },
    { label: "Suburb", value: `${property.suburb} ${property.state}` },
  ];

  return (
    <dl className="border-border grid grid-cols-2 gap-x-8 border-t sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className="border-border border-b py-5">
          <dt className="text-foreground-subtle text-label font-medium tracking-label uppercase">
            {row.label}
          </dt>
          <dd className="font-display mt-2 text-xl font-light">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
