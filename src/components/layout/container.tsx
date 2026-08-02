import type { ElementType, ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

const containerWidths = {
  narrow: "max-w-3xl",
  content: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
} as const;

export type ContainerWidth = keyof typeof containerWidths;

export interface ContainerProps<T extends ElementType = "div"> {
  /** Element to render. Defaults to a div. */
  as?: T;
  width?: ContainerWidth;
  className?: string;
  children?: ReactNode;
}

/**
 * Horizontal layout primitive: centres content and applies the shared gutter.
 */
export function Container<T extends ElementType = "div">({
  as,
  width = "wide",
  className,
  children,
  ...props
}: ContainerProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof ContainerProps<T>>) {
  const Component = (as ?? "div") as ElementType;

  return (
    <Component
      className={cn(
        "mx-auto w-full px-(--container-gutter)",
        containerWidths[width],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
