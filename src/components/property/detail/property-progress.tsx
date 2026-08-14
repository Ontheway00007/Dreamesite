import { Check, Loader } from "lucide-react";

import { resolveConstructionTimeline } from "@/lib/properties/construction-progress";
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

function formatDate(iso: string): string | null {
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

export interface PropertyProgressProps {
  property: Property;
}

/**
 * Where this home is in the build.
 *
 * Shows the home's own recorded updates when it has them, and the company's
 * documented build process when it does not. Both render through the same
 * milestone list, so the section does not change shape between a home with a
 * diary and one without.
 */
export function PropertyProgress({ property }: PropertyProgressProps) {
  const { milestones, percentComplete, currentStage, source } =
    resolveConstructionTimeline(property);

  if (milestones.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-foreground-muted text-sm">
          {currentStage
            ? `Currently at ${currentStage.title.toLowerCase()}`
            : "All build stages complete"}
        </p>
        <p className="text-foreground-subtle text-xs font-medium tracking-label uppercase tabular-nums">
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

      {/*
        The grid widens with the number of milestones rather than assuming four,
        so a diary of three stages and one of eight both read well.
      */}
      <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {milestones.map((milestone) => {
          const styles = stateStyles[milestone.state];
          const occurred = milestone.occurredAt
            ? formatDate(milestone.occurredAt)
            : null;

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
                    <span className="text-label tabular-nums">
                      {milestone.step}
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  {milestone.stageLabel && (
                    <p className="text-foreground-subtle text-label font-medium tracking-label uppercase">
                      {milestone.stageLabel}
                    </p>
                  )}
                  <h3 className={cn("text-sm font-medium", styles.title)}>
                    {milestone.title}
                  </h3>
                </div>
              </div>
              {milestone.body && (
                <p className={cn("mt-3 text-sm leading-relaxed", styles.body)}>
                  {milestone.body}
                </p>
              )}
              {occurred && (
                <p className="text-foreground-subtle mt-2 text-xs">
                  <time dateTime={milestone.occurredAt}>{occurred}</time>
                </p>
              )}
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

      {/* Disclosure: a standard process should not read as this home's record. */}
      {source === "process" && (
        <p className="text-foreground-subtle mt-8 text-xs">
          Stages shown are our standard build process. Updates specific to this
          home have not been published yet.
        </p>
      )}
    </div>
  );
}
