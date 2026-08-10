import Image from "next/image";

import { ArchitecturalFrame } from "@/components/media/architectural-frame";
import { resolveMediaSource } from "@/lib/properties/media";
import { cn } from "@/lib/utils/cn";
import type { Property } from "@/types";

export interface PropertyMediaProps {
  property: Pick<
    Property,
    "name" | "suburb" | "heroImage" | "placeholderVariant"
  >;
  /** Image sizes hint for the responsive loader. */
  sizes?: string;
  /** Hidden in compact frames where the caption would crowd the artwork. */
  showPreviewLabel?: boolean;
  labelClassName?: string;
  className?: string;
}

/**
 * Fills its container with a property's photography, or with an abstract
 * material study when there is none. Shared by the card and map preview so the
 * image and fallback rules live in one place.
 */
export function PropertyMedia({
  property,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  showPreviewLabel = true,
  labelClassName,
  className,
}: PropertyMediaProps) {
  const imageUrl = resolveMediaSource(property.heroImage?.source);

  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        // The editor's alt text when there is one; otherwise the name and
        // suburb, which is accurate rather than a generic "property image".
        alt={property.heroImage?.altText ?? `${property.name}, ${property.suburb}`}
        fill
        sizes={sizes}
        className={cn("object-cover", className)}
      />
    );
  }

  return (
    <>
      <div
        className={cn(
          "text-foreground-subtle/45 h-full w-full p-6",
          className,
        )}
      >
        <ArchitecturalFrame variant={property.placeholderVariant} />
      </div>
      {showPreviewLabel ? (
        <span
          className={cn(
            "text-foreground-subtle absolute right-5 bottom-4 text-[0.625rem] font-medium tracking-[0.2em] uppercase",
            labelClassName,
          )}
        >
          Material study
        </span>
      ) : null}
    </>
  );
}
