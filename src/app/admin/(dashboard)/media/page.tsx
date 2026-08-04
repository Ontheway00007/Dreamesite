import Link from "next/link";

import { AdminAlert } from "@/components/admin/admin-alert";
import { getMediaOverview } from "@/lib/admin/metrics-repository";

export const metadata = { title: "Media" };

/**
 * Global media overview.
 *
 * Uploading and ordering stay in the property editor, where the image is next to
 * the home it belongs to. What could not be answered there is the question this
 * page exists for: *across the whole catalogue, what is missing?* Which homes
 * have no photography, which have a hero that visitors cannot see, and where is
 * alt text still outstanding.
 *
 * So this is a worklist that links into each property's Media tab, not a second
 * uploader and not a page that says the work happens elsewhere.
 */
export default async function MediaPage() {
  const overview = await getMediaOverview();

  const needingWork = overview.properties.filter(
    (property) =>
      property.images === 0 ||
      property.missingAltText > 0 ||
      !property.hasPublishedHero,
  );

  // A set, so the sort below is a lookup per comparison rather than a scan.
  const needsWorkIds = new Set(needingWork.map((property) => property.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading-2 font-display text-foreground">Media</h1>
        <p className="text-foreground-subtle mt-1 text-sm">
          Where photography stands across every home. Uploading happens on each
          property&rsquo;s Media tab.
        </p>
      </div>

      {overview.failed ? (
        <AdminAlert tone="error" title="Could not load the media overview">
          <p className="mt-1">
            The database did not respond. Reload the page to try again — the
            details are in the server logs.
          </p>
        </AdminAlert>
      ) : (
        <>
          {overview.truncated && (
            <AdminAlert tone="warning" title="Showing a partial picture">
              <p className="mt-1">
                There is more media than this page reads in one pass, so the
                totals below are lower than the real figures. Per-property counts
                on each property&rsquo;s own Media tab remain accurate.
              </p>
            </AdminAlert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Images"
              value={overview.totals.images}
              detail={`${overview.totals.publishedImages} published`}
            />
            <StatCard
              label="Documents & links"
              value={overview.totals.resources}
              detail={`${overview.totals.publishedResources} published`}
            />
            <StatCard
              label="Homes with a live hero"
              value={
                overview.properties.filter(
                  (property) => property.hasPublishedHero,
                ).length
              }
              detail={`of ${overview.properties.length}`}
            />
            <StatCard
              label="Needing work"
              value={needingWork.length}
              detail={
                needingWork.length === 0
                  ? "Nothing outstanding"
                  : "Listed below first"
              }
            />
          </div>

          {overview.properties.length === 0 ? (
            <AdminAlert tone="info" title="No properties yet">
              <p className="mt-1">
                Create a property first — media is stored against a home.
              </p>
            </AdminAlert>
          ) : (
            <div className="border-border bg-surface overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Media held against each property, with outstanding work first
                </caption>
                <thead>
                  <tr className="border-border bg-surface-raised border-b text-left">
                    <Th>Property</Th>
                    <Th align="right">Images</Th>
                    <Th align="right">Documents</Th>
                    <Th>Hero</Th>
                    <Th>Alt text</Th>
                  </tr>
                </thead>
                <tbody>
                  {/*
                    Outstanding work first, then the rest alphabetically. Sorting
                    by name alone would bury the one home with no photographs
                    somewhere in the middle of the list.
                  */}
                  {[...overview.properties]
                    .sort((a, b) => {
                      const aNeeds = needsWorkIds.has(a.id) ? 0 : 1;
                      const bNeeds = needsWorkIds.has(b.id) ? 0 : 1;

                      return aNeeds - bNeeds || a.name.localeCompare(b.name);
                    })
                    .map((property) => (
                      <tr
                        key={property.id}
                        className="border-border border-b last:border-0"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/properties/${property.id}`}
                            className="text-foreground hover:text-accent font-medium transition-colors"
                          >
                            {property.name}
                          </Link>
                          {!property.isPublished && (
                            <span className="text-foreground-subtle ml-2 rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                              Draft
                            </span>
                          )}
                        </td>
                        <td className="text-foreground-muted px-4 py-3 text-right tabular-nums">
                          {property.images === 0 ? (
                            <span className="text-amber-400">None</span>
                          ) : (
                            <>
                              {property.publishedImages}
                              <span className="text-foreground-subtle">
                                {" / "}
                                {property.images}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="text-foreground-muted px-4 py-3 text-right tabular-nums">
                          {property.resources === 0 ? (
                            <span className="text-foreground-subtle">—</span>
                          ) : (
                            <>
                              {property.publishedResources}
                              <span className="text-foreground-subtle">
                                {" / "}
                                {property.resources}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <HeroState
                            hasHero={property.hasHero}
                            hasPublishedHero={property.hasPublishedHero}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {property.missingAltText > 0 ? (
                            <span className="text-amber-400">
                              {property.missingAltText} missing
                            </span>
                          ) : (
                            <span className="text-foreground-subtle">
                              Complete
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-foreground-subtle border-border border-t pt-4 text-xs leading-relaxed">
            An image needs alt text before it can be published, and a hero has to
            be a published photograph before it appears on the public page — a
            designated but unpublished hero shows as{" "}
            <span className="text-amber-400">Not visible</span> above.
          </p>
        </>
      )}
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      scope="col"
      className={`text-foreground-subtle px-4 py-2.5 text-[0.625rem] font-medium tracking-[0.2em] uppercase ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

/**
 * The three hero states worth distinguishing.
 *
 * "Designated but not visible" is the one that matters: the administrator chose
 * a hero, and a visitor still sees no photograph. Reporting that as simply
 * missing would send them to set a hero that is already set.
 */
function HeroState({
  hasHero,
  hasPublishedHero,
}: {
  hasHero: boolean;
  hasPublishedHero: boolean;
}) {
  if (hasPublishedHero) {
    return <span className="text-emerald-400">Live</span>;
  }

  if (hasHero) {
    return <span className="text-amber-400">Not visible</span>;
  }

  return <span className="text-foreground-subtle">Not set</span>;
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="bg-surface border-border rounded-xl border p-5">
      <p className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
        {label}
      </p>
      <p className="font-display text-foreground mt-2 text-3xl font-light tabular-nums">
        {value}
      </p>
      <p className="text-foreground-subtle mt-1 text-xs">{detail}</p>
    </div>
  );
}
