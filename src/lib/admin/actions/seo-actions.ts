"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";
import { handleAdminError, logAdminError } from "@/lib/admin/errors";
import {
  checkOgImageEligibility,
  validateSeo,
  type SeoAdvisory,
  type SeoInput,
} from "@/lib/admin/validation/seo";
import { summarise, type FieldError } from "@/lib/admin/validation/result";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PropertyImagesRow } from "@/types/database";

/**
 * Per-property SEO overrides.
 *
 * The overrides are columns on `properties`, so this is one update. What makes
 * it more than a form save is the Open Graph image: a social preview is fetched
 * by third parties from a public URL with no session, so the chosen image has to
 * be one that actually resolves publicly. Shape validation cannot tell — it
 * needs the row.
 */

export interface SeoActionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly fieldErrors?: readonly FieldError[];
  /**
   * Advice that did not prevent the save — a short title, a canonical
   * override, noindex left on. Returned on success so the editor can show it.
   */
  readonly advisories?: readonly SeoAdvisory[];
}

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

/**
 * Confirms the chosen social image can actually be shared.
 *
 * Returns the field errors to report, or an empty array when the image is fine.
 * The ownership check is the IDOR guard: an image id from another property is
 * refused, not silently accepted because the id exists.
 */
async function validateOgImage(
  supabase: AdminClient,
  propertyId: string,
  ogImageId: string,
): Promise<readonly FieldError[]> {
  const { data, error } = await supabase
    .from("property_images")
    .select("id, property_id, storage_path, external_url, image_type, is_published")
    .eq("id", ogImageId)
    .maybeSingle();

  if (error) {
    logAdminError(`Loading social image ${ogImageId}`, error);
    return [
      {
        field: "ogImageId",
        message: "Could not check that image. Please try again.",
      },
    ];
  }

  const row = data as unknown as PropertyImagesRow | null;

  if (!row) {
    return [{ field: "ogImageId", message: "That image no longer exists." }];
  }

  const eligibility = checkOgImageEligibility(
    {
      propertyId: row.property_id,
      isPublished: row.is_published,
      hasSource: Boolean(row.storage_path ?? row.external_url),
      imageType: row.image_type,
    },
    propertyId,
  );

  return eligibility.ok ? [] : eligibility.errors;
}

export async function updatePropertySeo(
  propertyId: string,
  input: SeoInput,
): Promise<SeoActionResult> {
  await requireAdmin();

  const validation = validateSeo(input);

  if (!validation.ok) {
    return {
      success: false,
      error: summarise(validation.errors),
      fieldErrors: validation.errors,
    };
  }

  const { value, advisories } = validation.value;
  const supabase = await createAdminClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, slug")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) {
    return { success: false, error: "That property no longer exists." };
  }

  if (value.ogImageId) {
    const imageErrors = await validateOgImage(
      supabase,
      propertyId,
      value.ogImageId,
    );

    if (imageErrors.length > 0) {
      return {
        success: false,
        error: summarise(imageErrors),
        fieldErrors: imageErrors,
      };
    }
  }

  // Every field is written, including the nulls: clearing an override is a
  // real edit, and a partial update would leave a cleared field in place.
  const { error } = await supabase
    .from("properties")
    .update({
      seo_meta_title: value.metaTitle ?? null,
      seo_meta_description: value.metaDescription ?? null,
      seo_og_image_id: value.ogImageId ?? null,
      seo_canonical_url: value.canonicalUrl ?? null,
      seo_noindex: value.noindex,
    } as never)
    .eq("id", propertyId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Saving SEO overrides for property ${propertyId}`,
        error,
        "Could not save the search settings. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "updated",
    // The overrides are columns on `properties`, so the entity is the property
    // and `section` says which part of it was edited. A `property_seo` entity
    // type would name a table that does not exist and split one row's history
    // in two.
    entityType: "property",
    entityId: propertyId,
    // Which overrides are now set, not their text. The values are public once
    // the page renders, but the audit log is not the place to keep a second
    // copy of editorial content that the row itself already holds.
    metadata: {
      section: "seo",
      hasMetaTitle: value.metaTitle !== undefined,
      hasMetaDescription: value.metaDescription !== undefined,
      hasOgImage: value.ogImageId !== undefined,
      hasCanonicalOverride: value.canonicalUrl !== undefined,
      noindex: value.noindex,
    },
  });

  const slug = (property as unknown as { slug: string }).slug;

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath(`/properties/${slug}`);

  return { success: true, advisories };
}
