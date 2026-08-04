"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Heading, Text } from "@/components/ui/typography";
import { PROPERTIES_ROUTE } from "@/lib/routes";

/**
 * Error boundary for every route under the root layout.
 *
 * ## What a visitor is told
 *
 * That something failed, and what they can do next. Not the message, not the
 * stack, not the digest — a server error message can name a table, a column or
 * an environment variable, and none of that helps somebody looking for a house.
 *
 * The `digest` Next generates is logged rather than displayed. It is the link
 * between this page and the server log entry, and showing it invites a visitor to
 * quote a hash at a sales team who cannot do anything with it.
 *
 * ## Why the links
 *
 * A dead end is the worst outcome of an error page. Reset retries the render,
 * which fixes a transient database blip; the two links get the visitor back to
 * something that works if it does not.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reaches the platform's runtime logs, where the digest can be matched to
    // the server-side entry that carries the real cause.
    console.error("[public] Unhandled render error", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <Container width="content" className="pt-(--header-height)">
      <div className="flex min-h-[60vh] flex-col justify-center py-20">
        <p className="text-eyebrow text-foreground-subtle font-medium uppercase">
          Something went wrong
        </p>
        <Heading level={1} as="h1" className="mt-6 max-w-2xl">
          This page could not be loaded.
        </Heading>
        <Text size="lead" className="mt-7 max-w-xl">
          The problem is on our side, not yours. Trying again often works — if it
          does not, the homes listing and the homepage are unaffected.
        </Text>

        <div className="mt-10 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={reset}
            className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-6 py-3 text-sm font-medium transition-colors"
          >
            Try again
          </button>
          <Link
            href={PROPERTIES_ROUTE}
            className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-6 py-3 text-sm font-medium transition-colors"
          >
            Browse homes
          </Link>
          <Link
            href="/"
            className="text-foreground-subtle hover:text-foreground-muted px-2 py-3 text-sm transition-colors"
          >
            Return home
          </Link>
        </div>
      </div>
    </Container>
  );
}
