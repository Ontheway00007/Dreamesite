import { cn } from "@/lib/utils/cn";
import type { ArchitecturalVariant } from "@/types";

/**
 * Abstract material compositions used when photography has not been supplied.
 * They suggest mass, rhythm and light without depicting a fictional façade.
 * The legacy component name is retained to avoid changing stored variant data.
 */
const variants: Record<ArchitecturalVariant, React.ReactNode> = {
  "single-storey": (
    <>
      <polygon
        points="80,390 520,135 735,245 278,482"
        fill="currentColor"
        opacity="0.12"
      />
      <rect
        x="155"
        y="92"
        width="205"
        height="318"
        rx="5"
        fill="var(--accent)"
        opacity="0.62"
        transform="rotate(11 155 92)"
      />
      <rect
        x="385"
        y="150"
        width="260"
        height="225"
        rx="5"
        fill="currentColor"
        opacity="0.2"
        transform="rotate(-7 385 150)"
      />
      <circle
        cx="585"
        cy="118"
        r="58"
        fill="var(--status-move-in-ready)"
        opacity="0.22"
      />
    </>
  ),
  "double-storey": (
    <>
      <rect x="118" y="248" width="526" height="170" rx="6" fill="currentColor" opacity="0.12" />
      <rect x="235" y="78" width="352" height="215" rx="6" fill="var(--accent)" opacity="0.48" />
      <rect x="318" y="120" width="328" height="254" rx="6" fill="currentColor" opacity="0.19" transform="rotate(8 318 120)" />
      <circle cx="198" cy="162" r="86" fill="var(--status-under-construction)" opacity="0.2" />
      <rect x="286" y="64" width="8" height="365" fill="var(--foreground)" opacity="0.45" />
    </>
  ),
  townhouse: (
    <>
      {[0, 1, 2, 3, 4].map((column) => (
        <rect
          key={column}
          x={140 + column * 106}
          y={84 + (column % 2) * 44}
          width="78"
          height={300 - (column % 3) * 38}
          rx="4"
          fill={column === 2 ? "var(--accent)" : "currentColor"}
          opacity={column === 2 ? 0.62 : 0.14 + column * 0.035}
        />
      ))}
      <polygon points="95,420 698,345 742,430 132,478" fill="currentColor" opacity="0.1" />
      <circle cx="616" cy="110" r="52" fill="var(--status-completed)" opacity="0.2" />
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
    >
      <g opacity="0.22" stroke="currentColor" strokeWidth="1">
        {[100, 200, 300, 400].map((y) => (
          <path key={`h-${y}`} d={`M40 ${y} H760`} />
        ))}
        {[160, 280, 400, 520, 640].map((x) => (
          <path key={`v-${x}`} d={`M${x} 40 V460`} />
        ))}
      </g>
      <circle cx="400" cy="250" r="185" fill="currentColor" opacity="0.025" />
      {variants[variant]}
    </svg>
  );
}
