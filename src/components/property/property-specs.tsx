import { Bath, BedDouble, Car, Ruler } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

const sizes = {
  sm: { text: "text-xs", icon: 14, gap: "gap-x-4 gap-y-2" },
  md: { text: "text-sm", icon: 15, gap: "gap-x-6 gap-y-3" },
} as const;

export interface PropertySpecsProps {
  property: Pick<
    Property,
    "bedrooms" | "bathrooms" | "carSpaces" | "landSize" | "houseSize"
  >;
  size?: keyof typeof sizes;
  /** Adds the internal floor area when the property has one. */
  includeHouseSize?: boolean;
  className?: string;
}

/**
 * The property specification row, shared by the card, the list and the map
 * preview. Each figure carries a screen-reader label because the icons alone do
 * not say what the number means.
 */
export function PropertySpecs({
  property,
  size = "md",
  includeHouseSize = false,
  className,
}: PropertySpecsProps) {
  const scale = sizes[size];

  const specs = [
    { icon: BedDouble, value: `${property.bedrooms}`, label: "bedrooms" },
    { icon: Bath, value: `${property.bathrooms}`, label: "bathrooms" },
    { icon: Car, value: `${property.carSpaces}`, label: "car spaces" },
    { icon: Ruler, value: `${property.landSize} m²`, label: "land size" },
  ];

  if (includeHouseSize && property.houseSize) {
    specs.push({
      icon: Ruler,
      value: `${property.houseSize} m² internal`,
      label: "internal area",
    });
  }

  return (
    <dl
      className={cn(
        "text-foreground-muted flex flex-wrap",
        scale.text,
        scale.gap,
        className,
      )}
    >
      {specs.map(({ icon: Icon, value, label }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon size={scale.icon} className="text-foreground-subtle" aria-hidden />
          <dt className="sr-only">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
