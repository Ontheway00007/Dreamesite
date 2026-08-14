import { SearchX } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export interface EmptyPropertyResultsProps {
  onReset: () => void;
  className?: string;
}

/** Shown when the filters exclude everything. */
export function EmptyPropertyResults({
  onReset,
  className,
}: EmptyPropertyResultsProps) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center justify-center border-t px-6 py-16 text-center",
        className,
      )}
    >
      <span className="border-border bg-surface text-foreground-subtle flex size-11 items-center justify-center rounded-full border">
        <SearchX size={18} aria-hidden />
      </span>
      <p className="font-display text-heading-3 mt-5 font-normal">
        No homes match these filters
      </p>
      <p className="text-foreground-muted mt-3 max-w-xs text-sm leading-relaxed">
        Try widening the suburb or bedroom filters, or clear them to see every
        home in the corridor.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="text-accent hover:text-accent-strong mt-6 text-xs font-medium tracking-label uppercase transition-colors duration-(--duration-fast)"
      >
        Clear all filters
      </button>
    </div>
  );
}
