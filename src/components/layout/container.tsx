import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils/cn";

const containerWidths = {
  narrow: "max-w-3xl",
  content: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
} as const;

export type ContainerWidth = keyof typeof containerWidths;

export interface ContainerProps extends ComponentPropsWithoutRef<"div"> {
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
