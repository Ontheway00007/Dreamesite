import Image from "next/image";

import { floorPlanVisuals } from "@/lib/properties/media";
import type { Property } from "@/types";

export interface PropertyFloorPlansProps {
  property: Property;
}

/**
 * Floor plan images.
 *
 * Shown apart from the photography rather than mixed into it. A floor plan is
 * a diagram: among the photographs it reads as a mistake, the gallery arrows
 * step from a kitchen to a line drawing, and — because it is a drawing full of
 * fine detail — it needs to be shown larger than a photograph does.
 *
 * Returns null when a property has none, so the page shows no empty section.
 * PDF floor plans are separate again: those are downloads and appear alongside
 * the other documents.
 */
export function PropertyFloorPlans({ property }: PropertyFloorPlansProps) {
  const plans = floorPlanVisuals(property).filter((plan) => plan.url !== null);

  if (plans.length === 0) {
    return null;
  }

  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {plans.map((plan) => (
        <li key={plan.id}>
          <figure>
            {/*
              `contain` rather than `cover`: cropping a floor plan removes
              rooms. The light background is deliberate too — these are usually
              black line work on white, which disappears on a dark surface.
            */}
            <div className="border-border relative aspect-4/3 overflow-hidden rounded-xl border bg-white/95">
              <Image
                src={plan.url as string}
                alt={plan.altText ?? `Floor plan for ${property.name}`}
                fill
                sizes="(min-width: 640px) 30rem, 100vw"
                className="object-contain p-3"
              />
            </div>

            {plan.caption ? (
              <figcaption className="text-foreground-subtle mt-3 text-xs">
                {plan.caption}
              </figcaption>
            ) : null}
          </figure>
        </li>
      ))}
    </ul>
  );
}
