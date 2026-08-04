import "server-only";

import { logAdminError } from "@/lib/admin/errors";
import { callRpc } from "@/lib/admin/rpc";
import {
  buildSearchFilter,
  safeSortColumn,
  safeSortDirection,
} from "@/lib/admin/search";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  PropertiesRow,
  PropertyLocationSettingsRow,
  PropertyPrivateLocationsRow,
} from "@/types/database";

/**
 * Admin property reads.
 *
 * Distinct from the public repository in `lib/properties/` in two ways: it
 * returns drafts as well as published rows, and it can reach the private
 * location tables. Both are governed by RLS — an authenticated session with
 * no `admin_users` row sees nothing here.
 */

export interface AdminPropertyListItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly suburb: string;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly carSpaces: number;
  readonly isPublished: boolean;
  readonly isFeatured: boolean;
  readonly displayPriority: number;
  readonly locationVisibility: string | null;
  /** False when the property has no location configured — blocks publishing. */
  readonly hasLocation: boolean;
  readonly updatedAt: string;
}

export interface AdminPropertyListResult {
  readonly properties: AdminPropertyListItem[];
  readonly total: number;
  /** True when the read failed, so the UI can say so rather than "no results". */
  readonly failed: boolean;
}

export interface PropertyListParams {
  readonly page?: number;
  readonly perPage?: number;
  readonly search?: string;
  readonly status?: string;
  readonly suburb?: string;
  readonly published?: "all" | "published" | "draft";
  readonly sortBy?: string;
  readonly sortDir?: "asc" | "desc";
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

/** Columns the table may sort by. Not a value — never caller-supplied. */
const SORTABLE_COLUMNS = [
  "name",
  "status",
  "suburb",
  "bedrooms",
  "bathrooms",
  "car_spaces",
  "is_published",
  "is_featured",
  "display_priority",
  "updated_at",
] as const;

/** Columns the search box matches against. */
const SEARCHABLE_COLUMNS = ["name", "slug", "suburb"] as const;

const LIST_SELECT = `
  id, slug, name, status, suburb, bedrooms, bathrooms, car_spaces,
  is_published, is_featured, display_priority, updated_at,
  settings:property_location_settings(location_visibility)
`;

export async function getAdminProperties(
  params: PropertyListParams = {},
): Promise<AdminPropertyListResult> {
  const supabase = await createAdminClient();

  const page = Math.max(1, Math.floor(params.page ?? 1));
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Math.floor(params.perPage ?? DEFAULT_PER_PAGE)),
  );
  const offset = (page - 1) * perPage;

  let query = supabase
    .from("properties")
    .select(LIST_SELECT, { count: "exact" });

  // Search terms are escaped and quoted before reaching PostgREST — see
  // lib/admin/search.ts for why raw interpolation here is unsafe.
  const searchFilter = buildSearchFilter(params.search, SEARCHABLE_COLUMNS);

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params.suburb && params.suburb !== "all") {
    query = query.eq("suburb", params.suburb);
  }

  if (params.published === "published") {
    query = query.eq("is_published", true);
  } else if (params.published === "draft") {
    query = query.eq("is_published", false);
  }

  const column = safeSortColumn(
    params.sortBy,
    SORTABLE_COLUMNS,
    "display_priority",
  );
  const ascending = safeSortDirection(params.sortDir) === "asc";

  query = query.order(column, { ascending });

  // Ties on the primary sort would otherwise come back in arbitrary order,
  // which makes pagination unstable: a row can appear on two pages or none.
  if (column !== "name") {
    query = query.order("name", { ascending: true });
  }
  if (column !== "id") {
    query = query.order("id", { ascending: true });
  }

  const { data, error, count } = await query.range(offset, offset + perPage - 1);

  if (error) {
    logAdminError("Listing properties for the admin table", error);
    return { properties: [], total: 0, failed: true };
  }

  const rows = (data ?? []) as unknown as Array<
    PropertiesRow & {
      settings: Array<{ location_visibility: string }> | null;
    }
  >;

  const properties = rows.map((row): AdminPropertyListItem => {
    const visibility = row.settings?.[0]?.location_visibility ?? null;

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      suburb: row.suburb,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      carSpaces: row.car_spaces,
      isPublished: row.is_published,
      isFeatured: row.is_featured,
      displayPriority: row.display_priority,
      locationVisibility: visibility,
      hasLocation: visibility !== null,
      updatedAt: row.updated_at,
    };
  });

  return { properties, total: count ?? 0, failed: false };
}

export interface AdminPropertyDetail {
  readonly property: PropertiesRow;
  readonly privateLocation: PropertyPrivateLocationsRow | null;
  readonly locationSettings: PropertyLocationSettingsRow | null;
  /**
   * When the public projection stopped matching the property it was derived
   * from, or null when it still matches.
   *
   * The projection embeds the suburb and state, so changing either leaves the
   * stored marker describing the previous one. A trigger records that; the
   * location editor surfaces it. Saving the location again clears it.
   */
  readonly projectionStaleSince: string | null;
}

/**
 * Loads one property and its location for the editor.
 *
 * Three reads, issued together rather than in sequence, so the page waits
 * one round trip instead of three.
 *
 * This deliberately does **not** load images, resources, features,
 * construction updates or testimonials. The previous version fetched all
 * five — seven queries per page load — and no editor consumed them, because
 * those editors do not exist yet. Each will add its own read when it is
 * built, rather than every page paying for all of them now.
 *
 * `maybeSingle` on the location tables is correct: a property legitimately
 * has no location until an administrator sets one.
 */
export async function getAdminPropertyById(
  id: string,
): Promise<AdminPropertyDetail | null> {
  if (!id) {
    return null;
  }

  const supabase = await createAdminClient();

  const [propertyResult, privateResult, settingsResult, projectionResult] =
    await Promise.all([
      supabase.from("properties").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("property_private_locations")
        .select("*")
        .eq("property_id", id)
        .maybeSingle(),
      supabase
        .from("property_location_settings")
        .select("*")
        .eq("property_id", id)
        .maybeSingle(),
      // One column, because the editor needs the staleness flag and nothing
      // else from the projection — it derives its own preview.
      supabase
        .from("property_public_locations")
        .select("stale_since")
        .eq("property_id", id)
        .maybeSingle(),
    ]);

  if (propertyResult.error) {
    logAdminError(`Loading property ${id}`, propertyResult.error);
    return null;
  }

  if (!propertyResult.data) {
    return null;
  }

  // A failure reading the location is logged but not fatal: the editor can
  // still open on the Details tab, and the Location tab will show as unset.
  if (privateResult.error) {
    logAdminError(`Loading private location for ${id}`, privateResult.error);
  }

  if (settingsResult.error) {
    logAdminError(`Loading location settings for ${id}`, settingsResult.error);
  }

  if (projectionResult.error) {
    logAdminError(`Loading projection staleness for ${id}`, projectionResult.error);
  }

  return {
    property: propertyResult.data as unknown as PropertiesRow,
    privateLocation:
      (privateResult.data as unknown as PropertyPrivateLocationsRow) ?? null,
    locationSettings:
      (settingsResult.data as unknown as PropertyLocationSettingsRow) ?? null,
    projectionStaleSince:
      (projectionResult.data as unknown as { stale_since: string | null } | null)
        ?.stale_since ?? null,
  };
}

/**
 * Distinct suburbs across every property, for the filter dropdown.
 *
 * Selects one column and de-duplicates in memory. At this scale that is
 * cheaper and clearer than a view or an RPC; if the catalogue ever reaches
 * thousands of rows, a `select distinct` view becomes worthwhile.
 */
export async function getAdminSuburbs(): Promise<string[]> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("properties")
    .select("suburb")
    .order("suburb", { ascending: true });

  if (error) {
    logAdminError("Loading suburb filter options", error);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{ suburb: string }>;

  return [...new Set(rows.map((row) => row.suburb).filter(Boolean))];
}

/**
 * Reasons a property cannot be published, for display in the editor.
 *
 * Shares the single `property_publish_blockers` definition with the publish
 * action, so what the editor warns about and what the action refuses can
 * never disagree.
 */
export async function getPublishBlockers(id: string): Promise<string[]> {
  if (!id) {
    return [];
  }

  const supabase = await createAdminClient();

  const { data, error } = await callRpc(supabase, "property_publish_blockers", {
    p_property_id: id,
  });

  if (error) {
    logAdminError(`Reading publish blockers for ${id}`, error);
    return [];
  }

  return data ?? [];
}
