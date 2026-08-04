import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PropertiesRow, PropertyLocationSettingsRow, PropertyPrivateLocationsRow } from "@/types/database";

/**
 * Admin property repository.
 *
 * Unlike the public repository, this reads ALL properties (including unpublished/draft).
 * Every function requires an authenticated admin session — RLS enforces this.
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
  readonly updatedAt: string;
}

export interface AdminPropertyListResult {
  readonly properties: AdminPropertyListItem[];
  readonly total: number;
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

/**
 * Lists all properties for the admin table with pagination, filtering,
 * sorting, and search.
 */
export async function getAdminProperties(
  params: PropertyListParams = {},
): Promise<AdminPropertyListResult> {
  const supabase = await createAdminClient();

  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(100, Math.max(1, params.perPage ?? DEFAULT_PER_PAGE));
  const offset = (page - 1) * perPage;
  const sortBy = params.sortBy ?? "display_priority";
  const sortDir = params.sortDir ?? "asc";

  // Build the query
  let query = supabase
    .from("properties")
    .select(
      `id, slug, name, status, suburb, bedrooms, bathrooms, car_spaces,
       is_published, is_featured, display_priority, updated_at,
       settings:property_location_settings(location_visibility)`,
      { count: "exact" },
    );

  // Filters
  if (params.search) {
    const term = `%${params.search}%`;
    query = query.or(`name.ilike.${term},slug.ilike.${term},suburb.ilike.${term}`);
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

  // Sorting
  const validSortColumns = [
    "name", "status", "suburb", "bedrooms", "bathrooms", "car_spaces",
    "is_published", "is_featured", "display_priority", "updated_at",
  ];
  const column = validSortColumns.includes(sortBy) ? sortBy : "display_priority";
  query = query.order(column, { ascending: sortDir === "asc" });

  // Secondary sort for stability
  if (column !== "name") {
    query = query.order("name", { ascending: true });
  }

  // Pagination
  query = query.range(offset, offset + perPage - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin] Failed to load properties:", error);
    return { properties: [], total: 0 };
  }

  const rows = (data ?? []) as unknown as Array<
    PropertiesRow & {
      settings: Array<{ location_visibility: string }> | null;
    }
  >;

  const properties: AdminPropertyListItem[] = rows.map((row) => ({
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
    locationVisibility: row.settings?.[0]?.location_visibility ?? null,
    updatedAt: row.updated_at,
  }));

  return { properties, total: count ?? 0 };
}

/**
 * Get a single property with all its relations for the editor.
 */
export async function getAdminPropertyById(id: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  // Load private location
  const { data: privateLocation } = await supabase
    .from("property_private_locations")
    .select("*")
    .eq("property_id", id)
    .single();

  // Load location settings
  const { data: locationSettings } = await supabase
    .from("property_location_settings")
    .select("*")
    .eq("property_id", id)
    .single();

  // Load images
  const { data: images } = await supabase
    .from("property_images")
    .select("*")
    .eq("property_id", id)
    .order("sort_order", { ascending: true });

  // Load resources
  const { data: resources } = await supabase
    .from("property_resources")
    .select("*")
    .eq("property_id", id)
    .order("sort_order", { ascending: true });

  // Load features
  const { data: features } = await supabase
    .from("property_features")
    .select("*")
    .eq("property_id", id)
    .order("sort_order", { ascending: true });

  // Load construction updates
  const { data: constructionUpdates } = await supabase
    .from("construction_updates")
    .select("*")
    .eq("property_id", id)
    .order("sort_order", { ascending: true });

  // Load testimonials
  const { data: testimonials } = await supabase
    .from("property_testimonials")
    .select("*")
    .eq("property_id", id)
    .order("sort_order", { ascending: true });

  return {
    property: data as unknown as PropertiesRow,
    privateLocation: (privateLocation as unknown as PropertyPrivateLocationsRow) ?? null,
    locationSettings: (locationSettings as unknown as PropertyLocationSettingsRow) ?? null,
    images: (images ?? []) as unknown as Array<Record<string, unknown>>,
    resources: (resources ?? []) as unknown as Array<Record<string, unknown>>,
    features: (features ?? []) as unknown as Array<Record<string, unknown>>,
    constructionUpdates: (constructionUpdates ?? []) as unknown as Array<Record<string, unknown>>,
    testimonials: (testimonials ?? []) as unknown as Array<Record<string, unknown>>,
  };
}

/**
 * Get distinct suburbs from all properties (for filter dropdown).
 */
export async function getAdminSuburbs(): Promise<string[]> {
  const supabase = await createAdminClient();

  const { data } = await supabase
    .from("properties")
    .select("suburb")
    .order("suburb", { ascending: true });

  if (!data) return [];

  const suburbs = new Set(
    (data as unknown as Array<{ suburb: string }>).map((r) => r.suburb),
  );

  return [...suburbs];
}
