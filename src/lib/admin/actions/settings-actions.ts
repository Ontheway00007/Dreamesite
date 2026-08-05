"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";
import { handleAdminError } from "@/lib/admin/errors";
import {
  validateSettings,
  type SettingsInput,
} from "@/lib/admin/validation/settings";
import { summarise, type FieldError } from "@/lib/admin/validation/result";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Site settings.
 *
 * One row, so this is an upsert on the fixed primary key `true` — the same
 * idiom the table uses to allow exactly one row. There is no "create settings"
 * step for an administrator to get wrong.
 *
 * The validator refuses anything that looks like a credential. That check
 * matters here more than anywhere else in the admin: these values are read by
 * the public site through `site_settings_public`, so a secret pasted into a
 * settings field is a published secret. The primary defence is that the model is
 * a fixed set of typed fields with no column a key belongs in; the heuristic is
 * the backstop for the case where someone uses a legitimate field wrongly.
 */

export interface SettingsActionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly fieldErrors?: readonly FieldError[];
}

export async function updateSiteSettings(
  input: SettingsInput,
): Promise<SettingsActionResult> {
  await requireAdmin();

  const validation = validateSettings(input);

  if (!validation.ok) {
    return {
      success: false,
      error: summarise(validation.errors),
      fieldErrors: validation.errors,
    };
  }

  const value = validation.value;
  const supabase = await createAdminClient();

  // Every column is written, nulls included: clearing a field is a real edit,
  // and a partial upsert would silently keep the old value.
  const { error } = await supabase.from("site_settings").upsert(
    {
      id: true,
      company_name: value.companyName ?? null,
      company_phone: value.companyPhone ?? null,
      company_email: value.companyEmail ?? null,
      company_address_display: value.companyAddressDisplay ?? null,
      default_meta_title: value.defaultMetaTitle ?? null,
      default_meta_description: value.defaultMetaDescription ?? null,
      default_og_image_url: value.defaultOgImageUrl ?? null,
      social_facebook: value.socialFacebook ?? null,
      social_instagram: value.socialInstagram ?? null,
      social_linkedin: value.socialLinkedin ?? null,
      enquiry_recipient_email: value.enquiryRecipientEmail ?? null,
      maintenance_notice: value.maintenanceNotice ?? null,
    } as never,
    { onConflict: "id" },
  );

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        "Saving site settings",
        error,
        "Could not save the settings. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "updated",
    entityType: "site_settings",
    // Which fields are now set, never their values. The email addresses and the
    // notice text live in the row; a second copy in an append-only log is a
    // liability with no purpose.
    metadata: {
      fieldsSet: Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key]) => key),
    },
  });

  // Settings feed the header, the footer and the enquiry block on every page,
  // so the whole tree is revalidated rather than a list of routes that would
  // fall out of date as pages are added.
  revalidatePath("/", "layout");

  return { success: true };
}
