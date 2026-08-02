import { Check, Loader } from "lucide-react";

import { resolveConstructionProgress } from "@/lib/properties/construction-progress";
import { cn } from "@/lib/utils/cn";
import type { MilestoneState } from "@/lib/properties/construction-progress";
import type { Property } from "@/types";

const stateStyles: Record<
  MilestoneState,
  { dot: string; title: string; body: string }
> = {
  complete: {
    dot: "border-accent bg-accent text-accent-foreground",
    title: "text-foreground",
    body: "text-foreground-muted",
  },
  "in-progress": {
    dot: "border-accent text-accent",
    title: "text-foreground",
    body: "text-foreground-muted",
  },
  upcoming: {
    dot: "border-border text-foreground-subtle",
    title: "text-foreground-subtle",
    body: "text-foreground-subtle",
  },
};

export interface PropertyProgressProps {
  property: Property;
}

/**
 * Where this home is in the build.
 *
 * The stages are the company's four documented stages, and the state of each is
 * derived from the property, so this section cannot describe a stage that is not
 * part of the published process.
 */
export function PropertyProgress({ property }: PropertyProgressProps) {
  const { milestones, percentComplete, currentStage } =
    resolveConstructionProgress(property);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-foreground-muted text-sm">
          {currentStage
            ? `Currently at ${currentStage.title.toLowerCase()}`
            : "All build stages complete"}
        </p>
        <p className="text-foreground-subtle text-xs font-medium tracking-[0.2em] uppercase tabular-nums">
          {percentComplete}% complete
        </p>
      </div>

      <div
        className="bg-border mt-4 h-px w-full overflow-hidden"
        role="img"
        aria-label={`Build progress: ${percentComplete} percent complete`}
      >
        <span
          className="bg-accent block h-full"
          style={{ width: `${percentComplete}%` }}
        />
      </div>

      <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {milestones.map((milestone) => {
          const styles = stateStyles[milestone.state];

          return (
            <li key={milestone.id}>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border",
                    styles.dot,
                  )}
                >
                  {milestone.state === "complete" ? (
                    <Check size={13} aria-hidden />
                  ) : milestone.state === "in-progress" ? (
                    <Loader size={13} aria-hidden />
                  ) : (
                    <span className="text-[0.625rem] tabular-nums">
                      {milestone.step}
                    </span>
                  )}
                </span>
                <h3 className={cn("text-sm font-medium", styles.title)}>
                  {milestone.title}
                </h3>
              </div>
              <p className={cn("mt-3 text-sm leading-relaxed", styles.body)}>
                {milestone.body}
              </p>
              <p className="sr-only">
                {milestone.state === "complete"
                  ? "Stage complete"
                  : milestone.state === "in-progress"
                    ? "Stage in progress"
                    : "Stage not started"}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
