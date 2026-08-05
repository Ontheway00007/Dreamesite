import { cache } from "react";

import { env } from "@/lib/env";
import { createSupabaseCatalogClient } from "@/lib/supabase/catalog";
import { siteConfig } from "@/lib/site-config";
import type { SiteSettingsPublicRow } from "@/types/database";

/**
 * Site settings as the public pages see them.
 *
 * ## Two layers, not one
 *
 * `siteConfig` stays the floor. It is compiled in, always present, and reviewed
 * in a pull request — which is what you want for the legal name and the
 * description. The settings row overrides the handful of values the business
 * legitimately changes without a deploy: the phone number, the email address,
 * the address to show, a maintenance notice.
 *
 * The database never *removes* a value. A null column falls back rather than
 * blanking the footer, so an administrator clearing a field by accident cannot
 * leave the site with no contact details at all.
 *
 * ## Why the view and not the table
 *
 * `site_settings` is administrator-only under RLS. `site_settings_public` is the
 * column-level projection that omits `enquiry_recipient_email`. Reading the view
 * with the anonymous key is what makes it structurally impossible for this
 * function to return the internal routing address — not a `select` list that a
 * later edit could widen.
 */

export interface PublicSettings {
  readonly companyName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  /** Postal or street address to display, when the business supplies one. */
  readonly addressDisplay?: string;
  readonly defaultMetaTitle?: string;
  readonly defaultMetaDescription?: string;
  readonly defaultOgImageUrl?: string;
  readonly social: {
    readonly facebook?: string;
    readonly instagram?: string;
    readonly linkedin?: string;
  };
  /** Shown site-wide while set. */
  readonly maintenanceNotice?: string;
  /**
   * True when these values came from the database. False means the compiled-in
   * defaults are in use — either Supabase is unconfigured or no settings row
   * exists yet. Surfaced so the admin page can say which.
   */
  readonly fromDatabase: boolean;
}

/** The floor: what the site shows with no settings row at all. */
function defaults(): PublicSettings {
  return {
    companyName: siteConfig.name,
    contactEmail: siteConfig.contact.email,
    contactPhone: siteConfig.contact.phone,
    social: {},
    fromDatabase: false,
  };
}

function nonEmpty(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function merge(row: SiteSettingsPublicRow): PublicSettings {
  const base = defaults();

  return {
    // `??` and not `||`: a stored value wins, a null falls back. The database
    // constraints already reject an empty string here.
    companyName: nonEmpty(row.company_name) ?? base.companyName,
    contactEmail: nonEmpty(row.company_email) ?? base.contactEmail,
    contactPhone: nonEmpty(row.company_phone) ?? base.contactPhone,
    addressDisplay: nonEmpty(row.company_address_display),
    defaultMetaTitle: nonEmpty(row.default_meta_title),
    defaultMetaDescription: nonEmpty(row.default_meta_description),
    defaultOgImageUrl: nonEmpty(row.default_og_image_url),
    social: {
      facebook: nonEmpty(row.social_facebook),
      instagram: nonEmpty(row.social_instagram),
      linkedin: nonEmpty(row.social_linkedin),
    },
    maintenanceNotice: nonEmpty(row.maintenance_notice),
    fromDatabase: true,
  };
}

/**
 * The settings for the current request.
 *
 * Wrapped in React's `cache` so the header, the footer and the enquiry section
 * share one read per request instead of issuing three identical ones.
 *
 * Never throws. A failed read falls back to the compiled-in defaults and logs
 * server-side: a settings table that is briefly unreachable should not take the
 * whole site down, and the defaults are always correct enough to serve.
 */
export const getPublicSettings = cache(async (): Promise<PublicSettings> => {
  if (!env.isSupabaseConfigured) {
    return defaults();
  }

  try {
    const supabase = createSupabaseCatalogClient();

    const { data, error } = await supabase
      .from("site_settings_public")
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("[settings] Could not read site settings", {
        code: error.code,
        message: error.message,
      });
      return defaults();
    }

    if (!data) {
      // No row yet. Not an error — the site works without one.
      return defaults();
    }

    return merge(data as unknown as SiteSettingsPublicRow);
  } catch (cause) {
    console.error("[settings] Unexpected failure reading site settings", cause);
    return defaults();
  }
});

/** A `tel:` href for a display phone number. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}
