"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Admin error boundary.
 *
 * Catches anything a Server Component or Action throws rather than returns.
 * Server Actions handle expected failures by returning a result object, so
 * arriving here means something genuinely unforeseen happened.
 *
 * The message is never shown: a thrown error's text can carry a stack trace
 * or a database detail. Next.js already strips these in production builds,
 * but relying on that would mean the development experience and the
 * production one disagree about what is safe to display. The digest is shown
 * instead, because it is the reference an engineer needs to find the matching
 * server log.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The boundary is the last place this error is visible to us; in the
    // browser console it is at least available while debugging.
    console.error("[admin] Unhandled error reached the boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[24rem] items-center justify-center">
      <div className="max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
          <svg
            className="h-6 w-6 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>

        <div>
          <h2 className="text-foreground text-lg font-medium">
            Something went wrong
          </h2>
          <p className="text-foreground-muted mt-2 text-sm">
            This page could not be loaded. Nothing you were working on has been
            saved, so trying again is safe.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            Try again
          </button>
          <Link
            href="/admin"
            className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          >
            Back to dashboard
          </Link>
        </div>

        {error.digest && (
          <p className="text-foreground-subtle text-xs">
            Reference <code className="font-mono">{error.digest}</code> — quote
            this if you report the problem.
          </p>
        )}
      </div>
    </div>
  );
}
