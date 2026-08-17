import {
  BUILD_STAGES,
  BUILD_STAGE_LABELS,
  buildStageCaption,
  type PropertyBuildState,
} from "@/lib/properties/build-stage";
import { cn } from "@/lib/utils/cn";

export interface ConstructionStageRailProps {
  state: PropertyBuildState;
  className?: string;
}

/**
 * The build position, as five segments.
 *
 * ## Why segments rather than a percentage
 *
 * A percentage invites precision the data does not have. "Frame" is something a
 * builder wrote down; "58% complete" is a number somebody computed from it, and
 * the moment it is on the screen a buyer will treat it as a schedule. Five named
 * segments say exactly as much as is known and no more.
 *
 * The caption carries the provenance, because a stage recorded on site and a
 * stage derived from a four-step process are different claims and should not read
 * identically. Both come from `buildStageCaption`, so this component holds no
 * opinion about the data.
 *
 * This is also the same vocabulary the animated map marker uses — both read
 * `resolveBuildStage` — so the rail and the miniature beside it can never
 * disagree.
 */
export function ConstructionStageRail({
  state,
  className,
}: ConstructionStageRailProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
          Build stage
        </p>
        <p className="text-foreground-muted text-xs">
          {buildStageCaption(state)}
        </p>
      </div>

      <ol className="flex gap-1" aria-label="Construction progress">
        {BUILD_STAGES.map((stage, index) => {
          const isReached = index <= state.stageIndex;
          const isCurrent = index === state.stageIndex;

          return (
            <li key={stage} className="flex-1">
              <span
                className={cn(
                  "block h-[3px] rounded-full transition-colors",
                  isCurrent
                    ? "bg-accent"
                    : isReached
                      ? "bg-accent/45"
                      : "bg-border-strong",
                )}
              />
              <span className="sr-only">
                {BUILD_STAGE_LABELS[stage]}
                {isCurrent
                  ? " — current stage"
                  : isReached
                    ? " — reached"
                    : " — not yet reached"}
              </span>
            </li>
          );
        })}
      </ol>

      <p
        aria-hidden="true"
        className="text-foreground-subtle flex justify-between text-[0.5625rem] tracking-[0.1em] uppercase"
      >
        <span>{BUILD_STAGE_LABELS[BUILD_STAGES[0]]}</span>
        <span className="text-foreground font-medium">
          {BUILD_STAGE_LABELS[state.stage]}
        </span>
        <span>{BUILD_STAGE_LABELS[BUILD_STAGES[BUILD_STAGES.length - 1]]}</span>
      </p>
    </div>
  );
}
