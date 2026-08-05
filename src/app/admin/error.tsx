"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary for the admin area.
 *
 * Separate from the public one for two reasons. The audience is an
 * administrator, who is better served by "reload, and here is what to check"
 * than by reassurance. And the most likely cause here is configuration — a
 * missing Supabase URL, a withdrawn key — which the public site survives by
 * falling back to fixtures and the admin cannot survive at all.
 *
 * Still no message, no stack and no digest on screen. An administrator's browser
 * is not a more trustworthy place to print a table name than a visitor's, and the
 * server log has the whole story.
 *
 * Deliberately does not use the shared admin layout: the failure may have come
 * from the layout itself, which loads the current administrator and the unread
 * enquiry count.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] Unhandled render error", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="border-border bg-surface w-full max-w-lg rounded-xl border p-8">
        <h1 className="text-foreground text-lg font-medium">
          The dashboard could not load
        </h1>
        <p className="text-foreground-muted mt-3 text-sm leading-relaxed">
          Something failed while rendering this page. The details are in the
          server logs — nothing is shown here, because an error message can
          describe the database.
        </p>

        <p className="text-foreground-subtle mt-4 text-sm leading-relaxed">
          If reloading does not help, the usual causes are a Supabase project
          that is unreachable, or administrator access that has been withdrawn
          from this account. Signing out and back in resolves the second.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Try again
          </button>
          <Link
            href="/admin"
            className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Back to the dashboard
          </Link>
          <Link
            href="/admin/login"
            className="text-foreground-subtle hover:text-foreground-muted px-2 py-2.5 text-sm transition-colors"
          >
            Sign in again
          </Link>
        </div>
      </div>
    </div>
  );
}
