import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Container, type ContainerWidth } from "@/components/layout/container";
import { cn } from "@/lib/utils/cn";

const spacingScale = {
  none: "",
  sm: "py-12 md:py-16",
  md: "py-20 md:py-28",
  lg: "py-28 md:py-40",
} as const;

const toneStyles = {
  base: "bg-background",
  alt: "bg-background-alt",
  surface: "bg-surface",
} as const;

export interface SectionProps extends ComponentPropsWithoutRef<"section"> {
  spacing?: keyof typeof spacingScale;
  tone?: keyof typeof toneStyles;
  /** Set to false to lay out children without the standard container. */
  contained?: boolean;
  width?: ContainerWidth;
  /** Draws a hairline divider along the top edge. */
  divided?: boolean;
  children?: ReactNode;
}

/** Vertical rhythm primitive for page sections. */
export function Section({
  spacing = "md",
  tone = "base",
  contained = true,
  width = "wide",
  divided = false,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        "relative",
        spacingScale[spacing],
        toneStyles[tone],
        divided && "hairline-top",
        className,
      )}
      {...props}
    >
      {contained ? <Container width={width}>{children}</Container> : children}
    </section>
  );
}
