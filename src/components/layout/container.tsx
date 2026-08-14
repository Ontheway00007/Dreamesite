import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/utils/cn";

const containerWidths = {
  narrow: "max-w-3xl",
  content: "max-w-5xl",
  wide: "max-w-7xl",
  /**
   * The homepage's editorial width. Wider than `wide` because the sections it
   * holds are photograph-led and a 7xl column leaves a lead image looking
   * cropped rather than composed.
   *
   * This exists so those sections stop hand-rolling `mx-auto max-w-[110rem]
   * px-5 sm:px-8 lg:px-12`, which is what they did before. Four components each
   * repeated their own copy of that string, so the homepage had a second
   * layout rhythm that drifted from the gutter token every other page uses.
   */
  stage: "max-w-[110rem]",
  full: "max-w-none",
} as const;

export type ContainerWidth = keyof typeof containerWidths;

/**
 * `ComponentPropsWithRef` rather than `...WithoutRef`: `ConstructionJourney`
 * needs a ref on its container to scope its GSAP context to. React 19 passes
 * `ref` through to function components as an ordinary prop, so no `forwardRef`
 * is involved.
 */
export interface ContainerProps extends ComponentPropsWithRef<"div"> {
  width?: ContainerWidth;
}

/**
 * Horizontal layout primitive: centres content and applies the shared gutter.
 */
export function Container({
  width = "wide",
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-(--container-gutter)",
        containerWidths[width],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
