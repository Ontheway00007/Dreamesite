import type { ReactNode } from "react";

/**
 * Inline feedback banner for the admin surface.
 *
 * One component for all four tones so an error and a success message can
 * never drift apart visually, and so `role="alert"` is applied consistently
 * — assistive technology should announce a failed save without the
 * administrator having to go looking for it.
 */

export type AlertTone = "error" | "success" | "info" | "warning";

const TONES: Readonly<Record<AlertTone, string>> = {
  error: "border-red-500/20 bg-red-500/10 text-red-300",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  info: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-300",
};

export function AdminAlert({
  tone,
  title,
  children,
}: {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      // Errors interrupt; the rest are announced politely when convenient.
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}
