import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Audit logging for admin actions.
 *
 * Records who did what and when. The audit_log table is append-only
 * and accessible only to administrators. No UI for viewing the log
 * exists yet — the architecture is ready for Phase 7.
 */

/**
 * Actions the audit trail records.
 *
 * Mirrors the `audit_log_action_check` constraint, widened by migration 0009
 * with the media verbs. Media events get their own names rather than being
 * folded into `updated` because "who replaced the hero photograph" is a
 * question worth being able to answer directly.
 */
export type AuditAction =
  | "created"
  | "updated"
  | "published"
  | "unpublished"
  | "deleted"
  | "archived"
  | "uploaded"
  | "replaced"
  | "reordered"
  | "hero_set"
  | "link_added";

export interface AuditEntry {
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Records an admin action in the audit log.
 *
 * This is fire-and-forget — audit failures must never block the
 * primary operation. Errors are logged server-side only.
 */
export async function logAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload: unknown = {
      user_id: user?.id ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
    };

    await (
      supabase.from("audit_log") as unknown as {
        insert(values: unknown): PromiseLike<{ error: unknown }>;
      }
    ).insert(payload);
  } catch (error) {
    // Audit failures never surface to the user
    console.error("[audit] Failed to log event:", error);
  }
}
