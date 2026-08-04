"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import type { AdminPropertyListItem } from "@/lib/admin/repository";

interface Props {
  properties: AdminPropertyListItem[];
  total: number;
  page: number;
  perPage: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}

const STATUS_LABELS: Record<string, string> = {
  "move-in-ready": "Move-in ready",
  "under-construction": "Under construction",
  completed: "Completed",
  sold: "Sold",
};

const STATUS_COLORS: Record<string, string> = {
  "move-in-ready": "bg-emerald-500/20 text-emerald-400",
  "under-construction": "bg-amber-500/20 text-amber-400",
  completed: "bg-sky-500/20 text-sky-400",
  sold: "bg-zinc-500/20 text-zinc-400",
};

const VISIBILITY_LABELS: Record<string, string> = {
  exact: "Exact",
  approximate: "Approx.",
  suburb: "Suburb",
  hidden: "Hidden",
};

function SortHeader({
  column,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  column: string;
  label: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (column: string) => void;
}) {
  const isActive = sortBy === column;
  return (
    <button
      onClick={() => onSort(column)}
      className={`group inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors ${
        isActive ? "text-accent" : "text-foreground-subtle hover:text-foreground-muted"
      }`}
    >
      {label}
      {isActive && (
        <span className="text-accent">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
      )}
    </button>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        active ? "bg-emerald-400" : "bg-zinc-600"
      }`}
      aria-label={active ? "Yes" : "No"}
    />
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PropertyTable({
  properties,
  total,
  page,
  perPage,
  sortBy,
  sortDir,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.ceil(total / perPage);

  function handleSort(column: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === column) {
      params.set("sortDir", sortDir === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", column);
      params.set("sortDir", "asc");
    }
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage > 1) {
      params.set("page", String(newPage));
    } else {
      params.delete("page");
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  if (properties.length === 0) {
    return (
      <div className="bg-surface border-border rounded-xl border p-12 text-center">
        <p className="text-foreground-muted">No properties found.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${isPending ? "opacity-60" : ""}`}>
      <div className="bg-surface border-border overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="px-4 py-3 text-left">
                <SortHeader column="name" label="Property" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader column="status" label="Status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader column="suburb" label="Suburb" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-center">
                <SortHeader column="bedrooms" label="Bed" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-center">
                <SortHeader column="bathrooms" label="Bath" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-center">
                <SortHeader column="car_spaces" label="Car" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-foreground-subtle text-xs font-medium uppercase tracking-wider">
                  Visibility
                </span>
              </th>
              <th className="px-4 py-3 text-center">
                <SortHeader column="is_published" label="Published" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-center">
                <SortHeader column="is_featured" label="Featured" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader column="updated_at" label="Updated" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-right">
                <span className="text-foreground-subtle text-xs font-medium uppercase tracking-wider">
                  Actions
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {properties.map((property) => (
              <tr
                key={property.id}
                className="border-border hover:bg-surface-raised border-b transition-colors last:border-b-0"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/properties/${property.id}`}
                    className="text-foreground hover:text-accent font-medium transition-colors"
                  >
                    {property.name}
                  </Link>
                  <p className="text-foreground-subtle mt-0.5 text-xs">
                    /{property.slug}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[property.status] ?? "bg-zinc-500/20 text-zinc-400"
                    }`}
                  >
                    {STATUS_LABELS[property.status] ?? property.status}
                  </span>
                </td>
                <td className="text-foreground-muted px-4 py-3">
                  {property.suburb}
                </td>
                <td className="text-foreground-muted px-4 py-3 text-center">
                  {property.bedrooms}
                </td>
                <td className="text-foreground-muted px-4 py-3 text-center">
                  {property.bathrooms}
                </td>
                <td className="text-foreground-muted px-4 py-3 text-center">
                  {property.carSpaces}
                </td>
                <td className="px-4 py-3">
                  <span className="text-foreground-subtle text-xs">
                    {property.locationVisibility
                      ? VISIBILITY_LABELS[property.locationVisibility] ?? property.locationVisibility
                      : "\u2014"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusDot active={property.isPublished} />
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusDot active={property.isFeatured} />
                </td>
                <td className="text-foreground-subtle px-4 py-3 text-xs">
                  {formatDate(property.updatedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/properties/${property.id}`}
                    className="text-accent hover:text-accent-strong text-xs font-medium transition-colors"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-foreground-subtle text-sm">
            Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of{" "}
            {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-foreground-muted text-sm">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
