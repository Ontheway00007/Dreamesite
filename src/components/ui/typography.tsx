import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/* -------------------------------------------------------------------------- */
/* Heading                                                                    */
/* -------------------------------------------------------------------------- */

const headingLevels = {
  display: "font-display text-display font-light",
  1: "font-display text-heading-1 font-light",
  2: "font-display text-heading-2 font-light",
  3: "font-display text-heading-3 font-normal",
} as const;

export type HeadingLevel = keyof typeof headingLevels;

export interface HeadingProps extends ComponentPropsWithoutRef<"h2"> {
  /** Visual size. Independent of the rendered tag. */
  level?: HeadingLevel;
  /** Semantic tag. Choose it from the document outline, not the size. */
  as?: "h1" | "h2" | "h3" | "h4" | "p";
  children?: ReactNode;
}

export function Heading({
  level = 2,
  as = "h2",
  className,
  children,
  ...props
}: HeadingProps) {
  const Component = as as ElementType;

  return (
    <Component
      className={cn(
        "text-foreground text-balance",
        headingLevels[level],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

/* -------------------------------------------------------------------------- */
/* Eyebrow                                                                    */
/* -------------------------------------------------------------------------- */

export interface EyebrowProps extends ComponentPropsWithoutRef<"p"> {
  children?: ReactNode;
}

/** Small uppercase label that sits above a heading. */
export function Eyebrow({ className, children, ...props }: EyebrowProps) {
  return (
    <p
      className={cn(
        "text-eyebrow text-foreground-subtle font-medium uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

const textSizes = {
  lead: "text-lead",
  base: "text-base leading-relaxed",
  small: "text-sm leading-relaxed",
} as const;

const textTones = {
  default: "text-foreground",
  muted: "text-foreground-muted",
  subtle: "text-foreground-subtle",
} as const;

export interface TextProps extends ComponentPropsWithoutRef<"p"> {
  size?: keyof typeof textSizes;
  tone?: keyof typeof textTones;
  as?: "p" | "span" | "div";
  children?: ReactNode;
}

export function Text({
  size = "base",
  tone = "muted",
  as = "p",
  className,
  children,
  ...props
}: TextProps) {
  const Component = as as ElementType;

  return (
    <Component
      className={cn(textSizes[size], textTones[tone], className)}
      {...props}
    >
      {children}
    </Component>
  );
}
