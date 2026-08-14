"use client";

import { List, Map as MapIcon } from "lucide-react";

import type { ViewMode } from "@/lib/properties/filters";
import { cn } from "@/lib/utils/cn";

const options: ReadonlyArray<{
  value: ViewMode;
  label: string;
  icon: typeof MapIcon;
}> = [
  { value: "map", label: "Map", icon: MapIcon },
  { value: "list", label: "List", icon: List },
];

export interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (view: ViewMode) => void;
  className?: string;
}

/** Segmented map/list switch. Only needed where the split layout does not fit. */
export function ViewModeToggle({
  value,
  onChange,
  className,
}: ViewModeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Choose map or list view"
      className={cn(
        "border-border bg-surface inline-flex rounded-full border p-1",
        className,
      )}
    >
      {options.map(({ value: option, label, icon: Icon }) => {
        const isActive = option === value;

        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-xs font-medium tracking-label uppercase transition-colors duration-(--duration-fast)",
              isActive
                ? "bg-foreground text-foreground-inverse"
                : "text-foreground-subtle hover:text-foreground",
            )}
          >
            <Icon size={15} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
