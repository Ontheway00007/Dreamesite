import type { ComponentPropsWithoutRef, ReactNode } from "react";

import Link from "next/link";

import { cn } from "@/lib/utils/cn";

const buttonVariants = {
  primary:
    "bg-foreground text-foreground-inverse hover:bg-accent active:bg-accent-strong",
  accent:
    "bg-accent text-accent-foreground hover:bg-accent-strong shadow-accent",
  outline:
    "border border-border-strong bg-background/20 text-foreground hover:border-accent hover:bg-accent-soft hover:text-accent-strong",
  ghost: "text-foreground-muted hover:text-foreground hover:bg-surface-raised",
} as const;

const buttonSizes = {
  sm: "h-9 gap-2 px-4 text-[0.6875rem]",
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

const baseClassName =
  "inline-flex items-center justify-center rounded-[0.45rem_1.4rem_1.4rem_1.4rem] font-semibold uppercase tracking-[0.13em] whitespace-nowrap transition-[background-color,color,border-color,box-shadow,transform] duration-(--duration-base) ease-luxe select-none hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

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
