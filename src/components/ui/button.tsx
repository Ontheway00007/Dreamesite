import type { ComponentPropsWithoutRef, ReactNode } from "react";

import Link from "next/link";

import { cn } from "@/lib/utils/cn";

const buttonVariants = {
  primary:
    "bg-foreground text-foreground-inverse hover:bg-accent-strong active:bg-accent",
  accent:
    "bg-accent text-accent-foreground hover:bg-accent-strong shadow-accent",
  outline:
    "border border-border-strong text-foreground hover:border-accent hover:text-accent",
  ghost: "text-foreground-muted hover:text-foreground hover:bg-surface-raised",
} as const;

const buttonSizes = {
  sm: "h-9 gap-2 px-4 text-label",
  md: "h-11 gap-2.5 px-6 text-xs",
  lg: "h-14 gap-3 px-8 text-sm",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon rendered before the label. */
  iconLeft?: ReactNode;
  /** Icon rendered after the label. */
  iconRight?: ReactNode;
  /** Stretches the button to the width of its container. */
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
}

type ButtonAsButtonProps = ButtonBaseProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof ButtonBaseProps> & {
    href?: undefined;
  };

type ButtonAsLinkProps = ButtonBaseProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof ButtonBaseProps>;

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

/*
  `active:scale-[0.97]` is the press feedback, and it is the point of this
  string. The previous version had `active:translate-y-0`, which only cancelled
  the hover lift: pressing produced no change at all for a visitor who had not
  hovered first, and no change beyond stopping for one who had. Cancelling an
  effect is not acknowledgement.

  The scale is deliberately small. It should be felt rather than watched, and
  because `scale()` also scales children, the label and any icon come with it,
  which is what makes the whole control feel pressed rather than resized.

  `--duration-press` (120ms) instead of `--duration-base` (320ms) for the
  transform: a press is the fastest thing on the page, since the visitor already
  knows they did it and is only waiting for confirmation. Colour and border keep
  the slower duration, which is why the two are listed separately.
*/
const baseClassName = cn(
  "inline-flex items-center justify-center rounded-full font-medium uppercase",
  "tracking-label whitespace-nowrap select-none",
  "transition-[background-color,color,border-color,box-shadow,transform] ease-luxe",
  // Colour and elevation settle at the standard rate; the transform is quicker.
  "[transition-duration:var(--duration-base),var(--duration-base),var(--duration-base),var(--duration-base),var(--duration-press)]",
  "hover:-translate-y-px active:translate-y-0 motion-safe:active:scale-[0.97]",
  "disabled:pointer-events-none disabled:opacity-45",
  "aria-disabled:pointer-events-none aria-disabled:opacity-45",
);

/**
 * Primary action component. Renders a `next/link` anchor when `href` is
 * supplied and a native button otherwise, keeping both fully typed.
 */
export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    iconLeft,
    iconRight,
    fullWidth = false,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    baseClassName,
    buttonVariants[variant],
    buttonSizes[size],
    fullWidth && "w-full",
    className,
  );

  const content = (
    <>
      {iconLeft}
      {children}
      {iconRight}
    </>
  );

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...linkProps } = rest as ButtonAsLinkProps;

    return (
      <Link href={href} className={classes} {...linkProps}>
        {content}
      </Link>
    );
  }

  const { type = "button", ...buttonProps } = rest as ButtonAsButtonProps;

  return (
    <button type={type} className={classes} {...buttonProps}>
      {content}
    </button>
  );
}
