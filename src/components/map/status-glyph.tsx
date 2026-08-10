import { cn } from "@/lib/utils/cn";
import type { PropertyStatus } from "@/types";

export function StatusGlyph({
  status,
  className,
}: {
  status: PropertyStatus;
  className?: string;
}) {
  const shared = cn("status-glyph inline-flex size-4 shrink-0", className);

  if (status === "under-construction") {
    return (
      <span aria-hidden="true" data-status={status} className={shared}>
        <svg viewBox="0 0 24 24" className="size-full">
          <path d="m12.8 3.6 8.4 15.3H4.5Z" fill="currentColor" opacity=".22" />
          <path
            d="M12 2.2 20.4 18H3.6Z"
            fill="var(--background)"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M12 6.1v8.7M7.5 15h9" stroke="currentColor" strokeWidth="1.4" />
          <path d="m12 2.2 8.4 15-3.1-1.4Z" fill="currentColor" opacity=".13" />
        </svg>
      </span>
    );
  }

  if (status === "completed") {
    return (
      <span aria-hidden="true" data-status={status} className={shared}>
        <svg viewBox="0 0 24 24" className="size-full">
          <path d="m13.2 2.8 9 8.2-9 10.2-9-8.2Z" fill="currentColor" opacity=".2" />
          <path d="m12 1.8 9 8.2-9 10.2L3 10Z" fill="currentColor" />
          <path d="m12 1.8 9 8.2-9 1.8L3 10Z" fill="var(--foreground)" opacity=".42" />
          <path d="m3 10 9 1.8v8.4Z" fill="var(--background)" opacity=".42" />
          <path d="M10.4 10.2h3.4v4h-3.4z" fill="var(--background)" />
        </svg>
      </span>
    );
  }

  if (status === "sold") {
    return (
      <span aria-hidden="true" data-status={status} className={shared}>
        <svg viewBox="0 0 24 24" className="size-full">
          <circle cx="12.9" cy="12.9" r="8.8" fill="currentColor" opacity=".2" />
          <circle
            cx="12"
            cy="12"
            r="8.8"
            fill="var(--background)"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7.8 12h8.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8.4 7.8 16 15.4" stroke="currentColor" strokeWidth=".9" opacity=".55" />
        </svg>
      </span>
    );
  }

  return (
    <span aria-hidden="true" data-status={status} className={shared}>
      <svg viewBox="0 0 24 24" className="size-full">
        <circle cx="12.8" cy="12.8" r="9" fill="currentColor" opacity=".2" />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="var(--background)"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="12" r="5" fill="currentColor" />
        <circle cx="10.6" cy="10.4" r="1.35" fill="var(--foreground)" opacity=".9" />
      </svg>
    </span>
  );
}
