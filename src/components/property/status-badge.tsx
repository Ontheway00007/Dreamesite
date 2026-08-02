import { propertyStatusTokens } from "@/lib/design/property-status";
import { cn } from "@/lib/utils/cn";
import type { PropertyStatus } from "@/types";

const sizes = {
  sm: "gap-1.5 px-2.5 py-1 text-[0.625rem]",
  md: "gap-2 px-3 py-1.5 text-[0.6875rem]",
} as const;

export interface StatusBadgeProps {
  status: PropertyStatus;
  size?: keyof typeof sizes;
  className?: string;
}

/** Status pill: a neutral surface with the status colour carried by the dot. */
export function StatusBadge({
  status,
  size = "md",
  className,
}: StatusBadgeProps) {
  const token = propertyStatusTokens[status];

  return (
    <span
      className={cn(
        "border-border-strong bg-surface-overlay text-foreground inline-flex items-center rounded-full border font-medium tracking-[0.16em] uppercase backdrop-blur-md",
        sizes[size],
        className,
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", token.swatchClassName)}
        aria-hidden
      />
      {token.label}
    </span>
  );
}
