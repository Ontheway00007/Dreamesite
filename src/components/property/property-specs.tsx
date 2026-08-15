import type { ReactNode } from "react";

import { Bath, BedDouble, Car, Ruler } from "lucide-react";

import { HouseTypeGlyph } from "@/components/property/house-type-glyph";
import { houseTypeTokens } from "@/lib/design/house-type";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

const sizes = {
  sm: { text: "text-xs", icon: 14, glyph: "size-3.5", gap: "gap-x-4 gap-y-2" },
  md: { text: "text-sm", icon: 15, glyph: "size-4", gap: "gap-x-6 gap-y-3" },
} as const;

export interface PropertySpecsProps {
  property: Pick<
    Property,
    | "bedrooms"
    | "bathrooms"
    | "carSpaces"
    | "landSize"
    | "houseSize"
    | "placeholderVariant"
  >;
  size?: keyof typeof sizes;
  /** Adds the internal floor area when the property has one. */
  includeHouseSize?: boolean;
  /**
   * Drops the house category from the row. For contexts that already state it,
   * like the corridor map's marker label or a detail page heading, where
   * repeating it would just spend a column.
   */
  hideHouseType?: boolean;
  className?: string;
}

interface Spec {
  readonly key: string;
  readonly icon: ReactNode;
  readonly value: string;
  readonly label: string;
}

/**
 * The property specification row, shared by the card, the list, the map preview
 * and the map panel. Each figure carries a screen-reader label because the icons
 * alone do not say what the number means.
 *
 * ## The house category leads the row
 *
 * It is first because it is the most defining fact about a home and the one a
 * visitor sorts on before any of the counts: whether it is single storey, two
 * storey or a townhouse decides whether the bedroom count is even relevant.
 *
 * Until now the site knew this and never said it. `placeholderVariant` existed
 * from the first phase and was used for exactly one thing, choosing which
 * abstract artwork to draw where a photograph was missing, so the information was
 * in the database and never on the page. Adding it here rather than to each
 * consumer means the card, the list, the preview and the map panel all gained it
 * at once, and cannot drift apart later.
 *
 * It is a `dt`/`dd` pair like the rest of the row, so the category is announced
 * as "home type, Townhouse" rather than as a bare word.
 */
export function PropertySpecs({
  property,
  size = "md",
  includeHouseSize = false,
  hideHouseType = false,
  className,
}: PropertySpecsProps) {
  const scale = sizes[size];
  const specs: Spec[] = [];

  if (!hideHouseType) {
    specs.push({
      key: "house-type",
      icon: (
        <HouseTypeGlyph
          variant={property.placeholderVariant}
          className={cn("text-foreground-subtle", scale.glyph)}
        />
      ),
      value: houseTypeTokens[property.placeholderVariant].label,
      label: "home type",
    });
  }

  specs.push(
    {
      key: "bedrooms",
      icon: <BedDouble size={scale.icon} className="text-foreground-subtle" aria-hidden />,
      value: `${property.bedrooms}`,
      label: "bedrooms",
    },
    {
      key: "bathrooms",
      icon: <Bath size={scale.icon} className="text-foreground-subtle" aria-hidden />,
      value: `${property.bathrooms}`,
      label: "bathrooms",
    },
    {
      key: "car-spaces",
      icon: <Car size={scale.icon} className="text-foreground-subtle" aria-hidden />,
      value: `${property.carSpaces}`,
      label: "car spaces",
    },
  );

  if (property.landSize > 0) {
    specs.push({
      key: "land-size",
      icon: <Ruler size={scale.icon} className="text-foreground-subtle" aria-hidden />,
      value: `${property.landSize} m²`,
      label: "land size",
    });
  }

  if (includeHouseSize && property.houseSize && property.houseSize > 0) {
    specs.push({
      key: "house-size",
      icon: <Ruler size={scale.icon} className="text-foreground-subtle" aria-hidden />,
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
      {specs.map(({ key, icon, value, label }) => (
        <div key={key} className="flex items-center gap-2">
          {icon}
          <dt className="sr-only">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
