"use client";

import { useState } from "react";

import Image from "next/image";

import { ArchitecturalFrame } from "@/components/media/architectural-frame";
import { cn } from "@/lib/utils/cn";
import type { ResolvedVisual } from "@/lib/properties/media";

export interface PropertyGalleryProps {
  visuals: readonly ResolvedVisual[];
  alt: string;
}

/**
 * Gallery for a property with more than one still.
 *
 * Only mounted when there is something to choose between — a home with a single
 * visual renders a plain frame on the server instead, so no interactivity is
 * shipped for a page that cannot use it.
 */
export function PropertyGallery({ visuals, alt }: PropertyGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = visuals[activeIndex] ?? visuals[0];

  return (
    <div>
      <div className="border-border bg-background-alt relative aspect-16/9 overflow-hidden rounded-xl border">
        {active.url ? (
          <Image
            src={active.url}
            alt={active.caption ?? alt}
            fill
            sizes="(min-width: 1024px) 60rem, 100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="text-foreground-subtle/45 h-full w-full p-10">
            <ArchitecturalFrame variant={active.placeholderVariant} />
          </div>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Property images"
        className="mt-4 flex flex-wrap gap-3"
      >
        {visuals.map((visual, index) => {
          const isActive = index === activeIndex;

          return (
            <button
              key={visual.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "bg-background-alt relative aspect-4/3 w-24 overflow-hidden rounded-lg border transition-colors duration-(--duration-fast)",
                isActive
                  ? "border-accent"
                  : "border-border hover:border-border-strong",
              )}
            >
              <span className="sr-only">
                {visual.caption ?? `View image ${index + 1}`}
              </span>
              {visual.url ? (
                <Image
                  src={visual.url}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : (
                <span className="text-foreground-subtle/45 block h-full w-full p-2">
                  <ArchitecturalFrame variant={visual.placeholderVariant} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active.caption ? (
        <p className="text-foreground-subtle mt-4 text-xs">{active.caption}</p>
      ) : null}
    </div>
  );
}
