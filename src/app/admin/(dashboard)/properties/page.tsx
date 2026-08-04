import Link from "next/link";

import { getAdminProperties, getAdminSuburbs } from "@/lib/admin/repository";
import { PropertyTable } from "@/components/admin/property-table";
import { PropertyFiltersBar } from "@/components/admin/property-filters-bar";
import { AdminAlert } from "@/components/admin/admin-alert";

export const metadata = { title: "Properties" };

const PER_PAGE = 20;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Reads a single string from a search param that may arrive as an array. */
function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

export default async function PropertiesPage({ searchParams }: Props) {
  const params = await searchParams;

  const pageParam = Number(readParam(params, "page"));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  const search = readParam(params, "search") ?? "";
  const status = readParam(params, "status") ?? "all";
  const suburb = readParam(params, "suburb") ?? "all";
  const publishedParam = readParam(params, "published");
  const published =
    publishedParam === "published" || publishedParam === "draft"
      ? publishedParam
      : "all";
  const sortBy = readParam(params, "sortBy") ?? "display_priority";
  const sortDir = readParam(params, "sortDir") === "desc" ? "desc" : "asc";

  const [result, suburbs] = await Promise.all([
    getAdminProperties({
      page,
      perPage: PER_PAGE,
      search,
      status,
      suburb,
      published,
      sortBy,
      sortDir,
    }),
    getAdminSuburbs(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-heading-2 font-display text-foreground">Properties</h1>
          {!result.failed && (
            <p className="text-foreground-subtle mt-1 text-sm">
              {result.total === 1 ? "1 property" : `${result.total} properties`}
            </p>
          )}
        </div>

        <Link
          href="/admin/properties/new"
          className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          New property
        </Link>
      </div>

      {/* A failed read and an empty catalogue look identical in a table, so
          they are distinguished explicitly. */}
      {result.failed ? (
        <AdminAlert tone="error" title="Could not load properties">
          <p className="mt-1">
            The database did not respond. Reload the page to try again — the
            details have been recorded in the server logs.
          </p>
        </AdminAlert>
      ) : (
        <>
          <PropertyFiltersBar
            search={search}
            status={status}
            suburb={suburb}
            published={published}
            suburbs={suburbs}
          />

          <PropertyTable
            properties={result.properties}
            total={result.total}
            page={page}
            perPage={PER_PAGE}
            sortBy={sortBy}
            sortDir={sortDir}
          />
        </>
      )}
    </div>
  );
}
