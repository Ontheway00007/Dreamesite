import { MapPinOff, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export type MapFallbackReason = "no-token" | "error";

export interface PropertyMapFallbackProps {
  reason: MapFallbackReason;
  className?: string;
}

/**
 * Shown instead of the map when it cannot run.
 *
 * The wording stays useful to a visitor — the list beside it still works — and
 * the environment-variable hint only appears during development, so nobody
 * public is ever told about missing configuration.
 */
export function PropertyMapFallback({
  reason,
  className,
}: PropertyMapFallbackProps) {
  const isMissingToken = reason === "no-token";
  const Icon = isMissingToken ? MapPinOff : TriangleAlert;

  return (
    <div
      className={cn(
        "border-border bg-background-alt flex h-full w-full items-center justify-center rounded-xl border p-8",
        className,
      )}
    >
      <div className="max-w-sm text-center">
        <span className="border-border bg-surface text-foreground-subtle mx-auto flex size-12 items-center justify-center rounded-full border">
          <Icon size={20} aria-hidden />
        </span>

        <p className="font-display text-heading-3 mt-6 font-normal">
          {isMissingToken ? "Map unavailable" : "The map could not load"}
        </p>

        <p className="text-foreground-muted mt-3 text-sm leading-relaxed">
          {isMissingToken
            ? "Every home is listed beside this panel, with its suburb, status and specifications."
            : "Something went wrong loading the map. The full list of homes is still available beside this panel."}
        </p>

        {isMissingToken && process.env.NODE_ENV === "development" ? (
          <p className="border-border text-foreground-subtle mt-6 border-t pt-4 text-xs">
            Development note: set{" "}
            <code className="text-foreground">
              NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
            </code>{" "}
            in <code className="text-foreground">.env.local</code> to enable the
            map.
          </p>
        ) : null}
      </div>
    </div>
  );
}
