"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

interface Props {
  search: string;
  status: string;
  suburb: string;
  published: string;
  suburbs: string[];
}

export function PropertyFiltersBar({
  search,
  status,
  suburb,
  published,
  suburbs,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all" && value !== "") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Reset to page 1 when filters change
      params.delete("page");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams, startTransition],
  );

  return (
    <div className={`flex flex-wrap items-center gap-3 ${isPending ? "opacity-60" : ""}`}>
      {/* Search */}
      <div className="relative min-w-[200px] flex-1">
        <input
          type="search"
          placeholder="Search properties..."
          defaultValue={search}
          onChange={(e) => {
            // Debounce search
            const value = e.target.value;
            const timer = setTimeout(() => updateParam("search", value), 300);
            return () => clearTimeout(timer);
          }}
          className="bg-surface border-border text-foreground placeholder:text-foreground-subtle focus:border-accent focus:ring-accent/20 w-full rounded-lg border px-3 py-2 pl-9 text-sm outline-none transition-colors focus:ring-2"
        />
        <svg
          className="text-foreground-subtle absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
      </div>

      {/* Status filter */}
      <select
        value={status}
        onChange={(e) => updateParam("status", e.target.value)}
        className="bg-surface border-border text-foreground rounded-lg border px-3 py-2 text-sm"
      >
        <option value="all">All statuses</option>
        <option value="move-in-ready">Move-in ready</option>
        <option value="under-construction">Under construction</option>
        <option value="completed">Completed</option>
        <option value="sold">Sold</option>
      </select>

      {/* Suburb filter */}
      <select
        value={suburb}
        onChange={(e) => updateParam("suburb", e.target.value)}
        className="bg-surface border-border text-foreground rounded-lg border px-3 py-2 text-sm"
      >
        <option value="all">All suburbs</option>
        {suburbs.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {/* Published filter */}
      <select
        value={published}
        onChange={(e) => updateParam("published", e.target.value)}
        className="bg-surface border-border text-foreground rounded-lg border px-3 py-2 text-sm"
      >
        <option value="all">All</option>
        <option value="published">Published</option>
        <option value="draft">Draft</option>
      </select>
    </div>
  );
}
