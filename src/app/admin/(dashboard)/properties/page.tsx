import Link from "next/link";

import { getAdminProperties, getAdminSuburbs } from "@/lib/admin/repository";
import { PropertyTable } from "@/components/admin/property-table";
import { PropertyFiltersBar } from "@/components/admin/property-filters-bar";

export const metadata = { title: "Properties" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PropertiesPage({ searchParams }: Props) {
  const params = await searchParams;

  const page = Number(params.page) || 1;
  const search = typeof params.search === "string" ? params.search : "";
  const status = typeof params.status === "string" ? params.status : "all";
  const suburb = typeof params.suburb === "string" ? params.suburb : "all";
  const published = typeof params.published === "string" ? params.published as "all" | "published" | "draft" : "all";
  const sortBy = typeof params.sortBy === "string" ? params.sortBy : "display_priority";
  const sortDir = typeof params.sortDir === "string" ? (params.sortDir as "asc" | "desc") : "asc";

  const [result, suburbs] = await Promise.all([
    getAdminProperties({ page, search, status, suburb, published, sortBy, sortDir }),
    getAdminSuburbs(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading-2 font-display text-foreground">
          Properties
        </h1>
        <Link
          href="/admin/properties/new"
          className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          New property
        </Link>
      </div>

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
        perPage={20}
        sortBy={sortBy}
        sortDir={sortDir}
      />
    </div>
  );
}
