import "server-only";

import { logAdminError } from "@/lib/admin/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  STAGE_ORDER,
  type ConstructionStage,
  type ConstructionStatus,
} from "@/lib/admin/validation/construction";
import type { FeatureCategory } from "@/lib/admin/validation/features";
import type {
  ConstructionUpdatesRow,
  PropertyFeaturesRow,
} from "@/types/database";

/**
 * Admin reads for the two content children: construction updates and
 * features.
 *
 * Both return drafts as well as published rows — editing content before it goes
 * live is the point. RLS permits that only for an active administrator.
 *
 * Kept apart from the property and media repositories so the construction tab
 * fetches neither media nor private location data. Data minimisation by tab:
 * a response cannot leak what it never contained.
 */

export interface AdminConstructionUpdate {
  readonly id: string;
  readonly propertyId: string;
  readonly stage: ConstructionStage;
  readonly title: string;
  readonly description: string | null;
  readonly status: ConstructionStatus;
  readonly progressValue: number | null;
  readonly occurredAt: string | null;
  readonly sortOrder: number;
  readonly isPublished: boolean;
  readonly updatedAt: string;
}

export interface AdminFeature {
  readonly id: string;
  readonly propertyId: string;
  readonly category: FeatureCategory;
  readonly label: string;
  readonly value: string | null;
  readonly sortOrder: number;
  readonly isPublished: boolean;
  readonly updatedAt: string;
}

export interface AdminPropertyContent {
  readonly constructionUpdates: readonly AdminConstructionUpdate[];
  readonly features: readonly AdminFeature[];
  /** True when the read failed, so the UI says so rather than "nothing yet". */
  readonly failed: boolean;
}

function toConstructionUpdate(
  row: ConstructionUpdatesRow,
): AdminConstructionUpdate {
  return {
    id: row.id,
    propertyId: row.property_id,
    stage: row.stage as ConstructionStage,
    title: row.title,
    description: row.description,
    status: row.status,
    progressValue: row.progress_value,
    occurredAt: row.occurred_at,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
  };
}

function toFeature(row: PropertyFeaturesRow): AdminFeature {
  return {
    id: row.id,
    propertyId: row.property_id,
    category: row.category as FeatureCategory,
    label: row.label,
    value: row.value,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
  };
}

/**
 * Every construction update and feature on a property, drafts included.
 *
 * Two reads issued together, so the tab waits one round trip rather than two.
 * `id` is the final sort key in both so the order is total — without it, rows
 * sharing a `sort_order` could swap places between renders and the move
 * buttons would appear to do nothing.
 */
export async function getPropertyContent(
  propertyId: string,
): Promise<AdminPropertyContent> {
  if (!propertyId) {
    return { constructionUpdates: [], features: [], failed: false };
  }

  const supabase = await createAdminClient();

  const [constructionResult, featureResult] = await Promise.all([
    supabase
      .from("construction_updates")
      .select("*")
      .eq("property_id", propertyId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("property_features")
      .select("*")
      .eq("property_id", propertyId)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (constructionResult.error || featureResult.error) {
    logAdminError(
      `Loading content for property ${propertyId}`,
      constructionResult.error ?? featureResult.error,
    );
    return { constructionUpdates: [], features: [], failed: true };
  }

  const constructionRows = (constructionResult.data ??
    []) as unknown as ConstructionUpdatesRow[];
  const featureRows = (featureResult.data ?? []) as unknown as PropertyFeaturesRow[];

  return {
    constructionUpdates: constructionRows.map(toConstructionUpdate),
    features: featureRows.map(toFeature),
    failed: false,
  };
}

/**
 * Stages that already have an update on this property.
 *
 * One update per stage is enforced by a unique index, so the form hides the
 * stages already used rather than letting the administrator pick one and then
 * be told it is taken.
 */
export function usedStages(
  updates: readonly AdminConstructionUpdate[],
): ReadonlySet<ConstructionStage> {
  return new Set(updates.map((update) => update.stage));
}

/**
 * Sorts updates into build order rather than stored order.
 *
 * `sort_order` is the administrator's chosen display order, which the public
 * page respects. This is for the admin list, where seeing them in the sequence
 * the build actually follows makes a missing stage obvious.
 */
export function inBuildOrder(
  updates: readonly AdminConstructionUpdate[],
): AdminConstructionUpdate[] {
  return [...updates].sort(
    (a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage],
  );
}

/** The next free sort position within a group. */
export async function getNextContentSortOrder(
  propertyId: string,
  table: "construction_updates" | "property_features",
  filter?: { column: "category"; value: string },
): Promise<number> {
  const supabase = await createAdminClient();

  let query = supabase
    .from(table)
    .select("sort_order")
    .eq("property_id", propertyId);

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { data, error } = await query
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return 0;
  }

  return ((data as unknown as { sort_order: number }).sort_order ?? -1) + 1;
}
