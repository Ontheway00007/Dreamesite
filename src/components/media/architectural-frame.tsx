import { cn } from "@/lib/utils/cn";
import type { ArchitecturalVariant } from "@/types";

/**
 * Architectural line drawings used in place of photography.
 *
 * These are deliberately drawn, not stock imagery: an elevation sketch reads as
 * an intentional placeholder rather than a stand-in for a real home. Swap them
 * out per property by setting `imagePath` on the property record.
 */
const variants: Record<ArchitecturalVariant, React.ReactNode> = {
  "single-storey": (
    <>
      <path d="M140 250 L255 178 H545 L660 250" />
      <path d="M120 250 H680" />
      <path d="M170 250 V430 H630 V250" />
      <path d="M205 296 H285 V356 H205 Z M245 296 V356" />
      <path d="M310 296 H370 V356 H310 Z" />
      <path d="M392 322 H448 V430 H392 Z" />
      <path d="M478 316 H630 V430" />
      <path d="M506 316 V430 M534 316 V430 M562 316 V430 M590 316 V430" />
    </>
  ),
  "double-storey": (
    <>
      <path d="M158 176 L400 104 L642 176" />
      <path d="M138 176 H662" />
      <path d="M186 176 V430 H614 V176" />
      <path d="M186 298 H614" />
      <path d="M224 212 H296 V270 H224 Z M260 212 V270" />
      <path d="M330 212 H470 V270 H330 Z M400 212 V270" />
      <path d="M504 212 H576 V270 H504 Z M540 212 V270" />
      <path d="M262 288 H538 M262 288 V264 M538 288 V264" />
      <path d="M224 336 H300 V396 H224 Z" />
      <path d="M372 336 H428 V430 H372 Z" />
      <path d="M470 328 H614 V430" />
      <path d="M506 328 V430 M542 328 V430 M578 328 V430" />
    </>
  ),
  townhouse: (
    <>
      <path d="M268 132 H532 V430 H268 Z" />
      <path d="M252 132 H548" />
      <path d="M268 250 H532" />
      <path d="M300 176 H364 V232 H300 Z M332 176 V232" />
      <path d="M436 176 H500 V232 H436 Z" />
      <path d="M300 246 H500 M300 246 V222 M500 246 V222" />
      <path d="M300 286 H372 V346 H300 Z" />
      <path d="M412 286 H500 V346 H412 Z" />
      <path d="M368 366 H432 V430 H368 Z" />
      <path d="M556 430 V132" strokeDasharray="8 10" />
      <path d="M244 430 V132" strokeDasharray="8 10" />
    </>
  ),
};

export interface ArchitecturalFrameProps {
  variant?: ArchitecturalVariant;
  className?: string;
}

export function ArchitecturalFrame({
  variant = "single-storey",
  className,
}: ArchitecturalFrameProps) {
  return (
    <svg
      viewBox="0 0 800 500"
      role="presentation"
      aria-hidden
      className={cn("h-full w-full", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="square"
    >
      {/* Setback and ground reference lines. */}
      <g opacity={0.45} strokeDasharray="6 12">
        <path d="M60 460 H740" />
        <path d="M400 60 V460" />
      </g>
      <path d="M60 430 H740" opacity={0.7} />
      {variants[variant]}
    </svg>
  );
}
