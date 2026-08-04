import Link from "next/link";

import { AdminAlert } from "@/components/admin/admin-alert";
import { requireAdmin } from "@/lib/admin/auth";
import { getDashboardMetrics } from "@/lib/admin/metrics-repository";
import { PROPERTY_STATUSES } from "@/lib/admin/validation/property";
import { propertyStatusTokens } from "@/lib/design/property-status";

export const metadata = {
  title: "Dashboard",
};

/**
 * Admin dashboard.
 *
 * Two halves, in the order they matter: what needs doing, then what exists.
 *
 * "Needs attention" is built only from conditions that are actually actionable
 * and that the database can answer cheaply — unread enquiries, drafts, missing
 * locations, images without alt text. Every item links to the page where the
 * work happens. Nothing here is a chart: a builder with a dozen homes gains
 * nothing from a graph, and a graph would need the row data these counts avoid
 * transferring.
 */
export default async function AdminDashboardPage() {
  const [admin, metrics] = await Promise.all([
    requireAdmin(),
    getDashboardMetrics(),
  ]);

  /*
    Two related but different numbers, and the distinction is deliberate.

    `publishBlocked` is every draft the publish gate would refuse, for any
    reason. `missingLocation` is the subset with no location at all — the most
    common cause and the one with an obvious next step.

    Showing only the subset and calling it "blocked" would understate the work;
    showing only the total leaves the administrator without a starting point. So
    both appear, each labelled as what it actually counts, and the location line
    is suppressed when it accounts for the whole figure rather than repeating it.
  */
  const blocked = metrics.properties.publishBlocked;
  const showLocationLine =
    metrics.properties.missingLocation > 0 &&
    (blocked === null || metrics.properties.missingLocation < blocked);

  const attention = [
    {
      count: metrics.enquiries.unread,
      href: "/admin/enquiries?status=new",
      singular: "enquiry has not been read",
      plural: "enquiries have not been read",
    },
    {
      count: blocked ?? 0,
      href: "/admin/properties?published=draft",
      singular: "draft property cannot be published yet",
      plural: "draft properties cannot be published yet",
    },
    {
      count: showLocationLine ? metrics.properties.missingLocation : 0,
      href: "/admin/properties",
      singular: "of those has no location set up at all",
      plural: "of those have no location set up at all",
    },
    {
      count: metrics.images.missingAltText,
      href: "/admin/media",
      singular: "image has no alt text, so it cannot be published",
      plural: "images have no alt text, so they cannot be published",
    },
    {
      count: metrics.properties.draft,
      href: "/admin/properties?published=draft",
      singular: "property is still a draft",
      plural: "properties are still drafts",
    },
  ].filter((item) => item.count > 0);

  // Ordered as the listing orders them, so the dashboard and the filter agree.
  const statuses = PROPERTY_STATUSES.map((status) => ({
    status,
    label: propertyStatusTokens[status].label,
    count: metrics.byStatus[status] ?? 0,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-heading-2 font-display text-foreground">
          Dashboard
        </h1>
        <p className="text-foreground-muted mt-1">
          Welcome back, {admin.displayName ?? admin.email}
        </p>
      </div>

      {metrics.failed ? (
        <AdminAlert tone="error" title="Could not load the figures">
          <p className="mt-1">
            The database did not respond. The rest of the admin still works —
            reload to try the counts again. Nothing is shown rather than showing
            zeros that would read as real.
          </p>
        </AdminAlert>
      ) : (
        <>
          {attention.length > 0 ? (
            <section className="border-border bg-surface rounded-xl border p-6">
              <h2 className="text-foreground text-sm font-semibold uppercase tracking-wider">
                Needs attention
              </h2>
              <ul className="mt-4 space-y-2.5">
                {attention.map((item) => (
                  <li key={item.href + item.singular}>
                    <Link
                      href={item.href}
                      className="text-foreground-muted hover:text-foreground group inline-flex items-baseline gap-2 text-sm transition-colors"
                    >
                      <span className="text-accent font-medium tabular-nums">
                        {item.count}
                      </span>
                      <span>
                        {item.count === 1 ? item.singular : item.plural}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-foreground-subtle group-hover:text-accent"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <AdminAlert tone="success" title="Nothing needs attention">
              <p className="mt-1">
                No unread enquiries, no drafts, and every image and location is
                complete.
              </p>
            </AdminAlert>
          )}

          <section>
            <h2 className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
              The catalogue
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                href="/admin/properties"
                label="Properties"
                value={metrics.properties.total}
                detail={`${metrics.properties.published} published · ${metrics.properties.draft} draft · ${metrics.properties.featured} featured`}
              />
              <MetricCard
                href="/admin/enquiries"
                label="Enquiries"
                value={metrics.enquiries.total}
                detail={
                  metrics.enquiries.unread > 0
                    ? `${metrics.enquiries.unread} unread`
                    : "All read"
                }
              />
              <MetricCard
                href="/admin/media"
                label="Images"
                value={metrics.images.total}
                detail={`${metrics.images.published} published`}
              />
              <MetricCard
                href="/admin/properties"
                label="Content entries"
                value={
                  metrics.content.constructionUpdates + metrics.content.features
                }
                detail={`${metrics.content.constructionUpdates} build updates · ${metrics.content.features} features`}
              />
            </div>
          </section>

          {/* Only the statuses actually in use. A row of zeros describes the
              vocabulary, not the catalogue. */}
          {statuses.length > 0 && (
            <section>
              <h2 className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
                By status
              </h2>
              <ul className="mt-4 flex flex-wrap gap-3">
                {statuses.map((entry) => (
                  <li key={entry.status}>
                    <Link
                      href={`/admin/properties?status=${entry.status}`}
                      className="bg-surface hover:bg-surface-raised border-border flex items-baseline gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors"
                    >
                      <span className="text-foreground font-medium tabular-nums">
                        {entry.count}
                      </span>
                      <span className="text-foreground-muted">{entry.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section>
        <h2 className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
          Go to
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NavCard
            title="Properties"
            href="/admin/properties"
            description="Details, location, media, build timeline, features and search."
          />
          <NavCard
            title="Enquiries"
            href="/admin/enquiries"
            description="Everything sent through the website."
          />
          <NavCard
            title="Media"
            href="/admin/media"
            description="Which homes have photography, and what is still missing."
          />
          <NavCard
            title="Settings"
            href="/admin/settings"
            description="Business details, search defaults and the site-wide notice."
          />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  href,
  label,
  value,
  detail,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="bg-surface hover:bg-surface-raised border-border block rounded-xl border p-5 transition-colors"
    >
      <p className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
        {label}
      </p>
      <p className="font-display text-foreground mt-2 text-3xl font-light tabular-nums">
        {value}
      </p>
      <p className="text-foreground-subtle mt-1 text-xs">{detail}</p>
    </Link>
  );
}

function NavCard({
  title,
  href,
  description,
}: {
  title: string;
  href: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="bg-surface hover:bg-surface-raised border-border group block rounded-xl border p-5 transition-colors"
    >
      <h3 className="text-foreground group-hover:text-accent text-sm font-medium transition-colors">
        {title}
      </h3>
      <p className="text-foreground-subtle mt-1 text-xs leading-relaxed">
        {description}
      </p>
    </Link>
  );
}
