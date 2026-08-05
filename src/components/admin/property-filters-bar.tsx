"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { MAX_SEARCH_LENGTH } from "@/lib/admin/search";

/**
 * Filter controls for the property table.
 *
 * All filter state lives in the query string, so a filtered view can be
 * shared or bookmarked and the browser's back button behaves as expected.
 */

interface Props {
  search: string;
  status: string;
  suburb: string;
  published: string;
  suburbs: string[];
}

/** Long enough not to fire mid-word, short enough to feel immediate. */
const SEARCH_DEBOUNCE_MS = 300;

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

  // The input is controlled locally so typing stays responsive while the
  // navigation it triggers is debounced.
  const [searchDraft, setSearchDraft] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    Re-sync the draft when the URL's search term changes from outside this
    input — a back navigation, or the Clear button.

    Adjusting state during render is React's documented approach for
    "reset state when a prop changes"; an effect would commit a render with
    the stale value first and then immediately render again.
    https://react.dev/learn/you-might-not-need-an-effect
  */
  const [lastSyncedSearch, setLastSyncedSearch] = useState(search);

  if (search !== lastSyncedSearch) {
    setLastSyncedSearch(search);
    setSearchDraft(search);
  }

  const updateParams = useCallback(
    (changes: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      // Any filter change invalidates the current page number — page 4 of an
      // unfiltered list is rarely page 4 of a filtered one.
      params.delete("page");

      const query = params.toString();

      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname);
      });
    },
    [router, pathname, searchParams],
  );

  /*
    The previous implementation returned a cleanup function from `onChange`,
    which React ignores — so the timeout was never cleared and every
    keystroke produced its own navigation. Holding the timer in a ref and
    clearing it on the next keystroke is what actually debounces.
  */
  function handleSearchChange(value: string) {
    setSearchDraft(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      updateParams({ search: value.trim() });
    }, SEARCH_DEBOUNCE_MS);
  }

  // A pending timeout must not fire after the component has gone.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const hasFilters =
    search !== "" || status !== "all" || suburb !== "all" || published !== "all";

  return (
    <div
      className={`flex flex-wrap items-center gap-3 transition-opacity ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <div className="relative min-w-[200px] flex-1">
        <label htmlFor="property-search" className="sr-only">
          Search properties
        </label>
        <input
          id="property-search"
          type="search"
          value={searchDraft}
          maxLength={MAX_SEARCH_LENGTH}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search name, slug or suburb…"
          className="bg-surface border-border text-foreground placeholder:text-foreground-subtle focus:border-accent focus:ring-accent/20 w-full rounded-lg border px-3 py-2 pl-9 text-sm outline-none transition-colors focus:ring-2"
        />
        <svg
          className="text-foreground-subtle pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
      </div>

      <div>
        <label htmlFor="filter-status" className="sr-only">
          Filter by status
        </label>
        <select
          id="filter-status"
          value={status}
          onChange={(event) => updateParams({ status: event.target.value })}
          className="bg-surface border-border text-foreground rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="move-in-ready">Move-in ready</option>
          <option value="under-construction">Under construction</option>
          <option value="completed">Completed</option>
          <option value="sold">Sold</option>
        </select>
      </div>

      <div>
        <label htmlFor="filter-suburb" className="sr-only">
          Filter by suburb
        </label>
        <select
          id="filter-suburb"
          value={suburb}
          onChange={(event) => updateParams({ suburb: event.target.value })}
          className="bg-surface border-border text-foreground rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">All suburbs</option>
          {suburbs.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-published" className="sr-only">
          Filter by publish state
        </label>
        <select
          id="filter-published"
          value={published}
          onChange={(event) => updateParams({ published: event.target.value })}
          className="bg-surface border-border text-foreground rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">Published &amp; draft</option>
          <option value="published">Published only</option>
          <option value="draft">Drafts only</option>
        </select>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={() =>
            updateParams({ search: "", status: "all", suburb: "all", published: "all" })
          }
          className="text-foreground-subtle hover:text-foreground-muted text-sm transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
