import { Info } from "lucide-react";

import { getActivePropertySourceName } from "@/lib/properties/repository";

/**
 * Says so, when the catalogue on screen is demonstration data.
 *
 * The fixtures in `content/properties.ts` exist so the interface can be built
 * and reviewed before a real catalogue is published. They are named "concept"
 * for a reason, but a name is easy to miss, and a visitor has no way to tell a
 * placeholder from a home the company actually built. Left unlabelled, the page
 * would be claiming a portfolio that does not exist yet.
 *
 * So the fixtures stay honest by being labelled rather than by being disguised.
 * The notice is only rendered when the local source is active — in production
 * with Supabase configured this returns null, and when Supabase is unreachable
 * on a production deploy the repository serves an empty catalogue rather than
 * fixtures, so no visitor ever sees demonstration data unlabelled.
 */
export function DemonstrationNotice() {
  if (getActivePropertySourceName() !== "local") {
    return null;
  }

  return (
    <aside
      aria-label="About the properties shown"
      className="border-border bg-surface border-t border-b"
    >
      <div className="mx-auto flex max-w-[110rem] items-start gap-3 px-5 py-4 sm:px-8 lg:px-12">
        <Info
          className="text-foreground-subtle mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <p className="text-foreground-subtle text-sm leading-relaxed">
          <span className="text-foreground-muted font-medium">
            Demonstration data.
          </span>{" "}
          The homes shown here are illustrative examples used while the site is
          being built — not properties Dreame has constructed. Real projects
          appear here once they are published.
        </p>
      </div>
    </aside>
  );
}
