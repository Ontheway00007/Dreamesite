"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { MAX_SEARCH_LENGTH } from "@/lib/admin/search";
import {
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
} from "@/lib/admin/validation/enquiry";
import type { EnquiryCounts } from "@/lib/admin/enquiry-repository";

/**
 * Status tabs, search and property filter for the enquiry list.
 *
 * Filter state lives in the query string so a view can be shared with a
 * colleague — "the four unanswered ones about Mickleham" is a URL.
 *
 * Status is a row of tabs rather than another select: it is the filter used on
 * every visit, and the counts beside each one answer "is there anything waiting"
 * without a click.
 */

interface Props {
  readonly search: string;
  readonly status: string;
  readonly propertyId: string;
  readonly counts: EnquiryCounts;
  readonly properties: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}

const SEARCH_DEBOUNCE_MS = 300;

export function EnquiryFiltersBar({
  search,
  status,
  propertyId,
  counts,
  properties,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchDraft, setSearchDraft] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync when the URL term changes from outside this input (back button,
  // Clear). Adjusting state during render is React's documented pattern for
  // this; an effect would render once with the stale value first.
  const [lastSynced, setLastSynced] = useState(search);

  if (search !== lastSynced) {
    setLastSynced(search);
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

      // Page 3 of one filter is not page 3 of another.
      params.delete("page");

      const query = params.toString();

      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname);
      });
    },
    [router, pathname, searchParams],
  );

  function handleSearchChange(value: string) {
    setSearchDraft(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      updateParams({ search: value.trim() });
    }, SEARCH_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const hasFilters = search !== "" || status !== "all" || propertyId !== "all";

  const tabs = [
    { value: "all", label: "All", count: counts.all },
    ...ENQUIRY_STATUSES.map((value) => ({
      value,
      label: ENQUIRY_STATUS_LABELS[value],
      count: counts[value],
    })),
  ];

  return (
    <div
      className={`space-y-4 transition-opacity ${isPending ? "opacity-60" : ""}`}
    >
      <div
        className="border-border flex flex-wrap gap-1 border-b"
        role="tablist"
        aria-label="Filter by status"
      >
        {tabs.map((tab) => {
          const isActive = status === tab.value;

          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => updateParams({ status: tab.value })}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-accent text-accent"
                  : "text-foreground-muted hover:text-foreground border-transparent"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  tab.value === "new" && tab.count > 0
                    ? "bg-accent/20 text-accent"
                    : "bg-surface-raised text-foreground-subtle"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="enquiry-search" className="sr-only">
            Search enquiries
          </label>
          <input
            id="enquiry-search"
            type="search"
            value={searchDraft}
            maxLength={MAX_SEARCH_LENGTH}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search name, email or message…"
            className="bg-surface border-border text-foreground placeholder:text-foreground-subtle focus:border-accent focus:ring-accent/20 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2"
          />
        </div>

        <div>
          <label htmlFor="enquiry-property" className="sr-only">
            Filter by property
          </label>
          <select
            id="enquiry-property"
            value={propertyId}
            onChange={(event) => updateParams({ property: event.target.value })}
            className="bg-surface border-border text-foreground max-w-[16rem] rounded-lg border px-3 py-2 text-sm"
          >
            <option value="all">All properties</option>
            <option value="none">General enquiries</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() =>
              updateParams({ search: "", status: "all", property: "all" })
            }
            className="text-foreground-subtle hover:text-foreground-muted text-sm transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
