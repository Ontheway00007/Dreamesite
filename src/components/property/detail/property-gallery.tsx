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
      <div className="editorial-frame border-border-strong bg-background relative aspect-[5/4] overflow-hidden border shadow-raised">
        {active.url ? (
          <Image
            src={active.url}
            /*
              The editor's description first. A caption is written for everyone
              and often adds context rather than describing the picture — "The
              kitchen was designed with the owners" tells a screen reader user
              nothing about what is on screen. The property name and suburb is
              the last resort, and is at least accurate.
            */
            alt={active.altText ?? alt}
            fill
            sizes="(min-width: 1024px) 60rem, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="text-foreground-subtle/45 h-full w-full p-10">
            <ArchitecturalFrame variant={active.placeholderVariant} />
          </div>
        )}
      </div>

      <div aria-label="Property images" className="mt-5 flex flex-wrap gap-3">
        {visuals.map((visual, index) => {
          const isActive = index === activeIndex;

          return (
            <button
              key={visual.id}
              type="button"
              aria-pressed={isActive}
              aria-label={
                visual.altText
                  ? `Show ${visual.altText}`
                  : `Show image ${index + 1} of ${visuals.length}`
              }
              onClick={() => setActiveIndex(index)}
              className={cn(
                "bg-background-alt relative aspect-[4/3] w-24 overflow-hidden rounded-[0.35rem_1rem_1rem_1rem] border transition-[border-color,transform] duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ring) motion-safe:hover:-translate-y-0.5",
                isActive
                  ? "border-accent"
                  : "border-border hover:border-border-strong",
              )}
            >
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
