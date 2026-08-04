import "server-only";

import { logAdminError } from "@/lib/admin/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SiteSettingsRow } from "@/types/database";

/**
 * Admin read of the settings singleton.
 *
 * Reads the table rather than the public view, because the administrator is the
 * one person who needs `enquiry_recipient_email` — the field the view exists to
 * withhold from everyone else.
 */

export interface AdminSettings {
  readonly row: SiteSettingsRow | null;
  /** True when the read failed, as distinct from "no row configured yet". */
  readonly failed: boolean;
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .maybeSingle();

  if (error) {
    logAdminError("Loading site settings", error);
    return { row: null, failed: true };
  }

  // No row is the expected state before the business has filled anything in.
  return { row: (data as unknown as SiteSettingsRow) ?? null, failed: false };
}
