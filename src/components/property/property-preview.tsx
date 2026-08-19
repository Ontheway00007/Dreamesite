import { ArrowRight, X } from "lucide-react";

import { PropertyMedia } from "@/components/property/property-media";
import { PropertySpecs } from "@/components/property/property-specs";
import { StatusBadge } from "@/components/property/status-badge";
import { Button } from "@/components/ui/button";
import { propertyHref } from "@/lib/routes";
import { publicPriceLabel } from "@/lib/properties/display";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

export interface PropertyPreviewProps {
  property: Property;
  /** Rendered as a dismiss control when provided. */
  onClose?: () => void;
  className?: string;
}

/**
 * Compact preview of the selected property.
 *
 * One component serves both surfaces: the floating card on desktop and the
 * bottom sheet on mobile. It reuses the card's media, badge and specification
 * primitives rather than restating them.
 */
export function PropertyPreview({
  property,
  onClose,
  className,
}: PropertyPreviewProps) {
  const { address, label } = property.location;
  const priceLabel = publicPriceLabel(property.priceDisplay);

  return (
    <article
      className={cn(
        "paper-glass border-border-strong shadow-raised relative overflow-hidden rounded-[0.6rem_2rem_2rem_2rem] border",
        className,
      )}
    >
      <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="bg-background-alt relative hidden aspect-[4/5] w-32 shrink-0 overflow-hidden rounded-[0.4rem_1.5rem_1.5rem_1.5rem] sm:block">
          <PropertyMedia
            property={property}
            sizes="128px"
            showPreviewLabel={false}
            className="p-3"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <StatusBadge status={property.status} size="sm" />
              <h3 className="font-display text-heading-3 mt-3 font-normal">
                {property.name}
              </h3>
              <p className="text-foreground-subtle mt-1 text-xs tracking-[0.12em] uppercase">
                {address ?? `${property.suburb} ${property.state}`}
              </p>
            </div>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close property preview"
                className="text-foreground-subtle hover:text-foreground -mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-(--duration-fast)"
              >
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </div>

          <PropertySpecs property={property} size="sm" className="mt-4" />

          {property.completionLabel || priceLabel ? (
            <p className="text-foreground-muted mt-3 text-xs">
              {[priceLabel, property.completionLabel]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}

          {label ? (
            <p className="text-foreground-subtle mt-2 text-[0.6875rem]">
              {label}
            </p>
          ) : null}

          <Button
            href={propertyHref(property.slug)}
            variant="outline"
            size="sm"
            className="mt-5"
            iconRight={<ArrowRight size={14} aria-hidden />}
          >
            View property
          </Button>
        </div>
      </div>
    </article>
  );
}
