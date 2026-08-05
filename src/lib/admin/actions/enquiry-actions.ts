"use server";

import { revalidatePath } from "next/cache";

import { logAuditEvent } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";
import { handleAdminError, logAdminError } from "@/lib/admin/errors";
import {
  isEnquiryStatus,
  validateAdminNotes,
  type EnquiryStatus,
} from "@/lib/admin/validation/enquiry";
import { summarise, type FieldError } from "@/lib/admin/validation/result";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EnquiriesRow } from "@/types/database";

/**
 * Enquiry management actions.
 *
 * Two operations only: move an enquiry through its statuses, and write a staff
 * note against it. There is deliberately no delete.
 *
 * ## Audit metadata
 *
 * The audit log records that an administrator changed an enquiry, and nothing
 * about the person who sent it. No name, no email address, no phone number, no
 * message text, and not even the length of the message — a second copy of
 * someone's personal data inside an append-only table nobody can edit is a
 * liability, not a control. The enquiry's own id is enough to find the record
 * for anyone with the access to read it.
 */

export interface EnquiryActionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly fieldErrors?: readonly FieldError[];
}

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

async function loadEnquiry(
  supabase: AdminClient,
  enquiryId: string,
): Promise<Pick<EnquiriesRow, "id" | "status"> | null> {
  const { data, error } = await supabase
    .from("enquiries")
    .select("id, status")
    .eq("id", enquiryId)
    .maybeSingle();

  if (error) {
    logAdminError(`Loading enquiry ${enquiryId}`, error);
    return null;
  }

  return (data as unknown as Pick<EnquiriesRow, "id" | "status">) ?? null;
}

/**
 * Which audit verb a status change is.
 *
 * Archiving is its own verb because "who archived this enquiry" is a question
 * worth answering directly. The other transitions are ordinary updates, with
 * the new status in the metadata.
 */
function auditActionFor(status: EnquiryStatus): "archived" | "updated" {
  return status === "archived" ? "archived" : "updated";
}

export async function setEnquiryStatus(
  enquiryId: string,
  status: string,
): Promise<EnquiryActionResult> {
  await requireAdmin();

  if (!isEnquiryStatus(status)) {
    return { success: false, error: "That is not a valid enquiry status." };
  }

  const supabase = await createAdminClient();
  const existing = await loadEnquiry(supabase, enquiryId);

  if (!existing) {
    return { success: false, error: "That enquiry could not be found." };
  }

  if (existing.status === status) {
    // Nothing to do, and an audit entry saying nothing changed is noise.
    return { success: true };
  }

  const { error } = await supabase
    .from("enquiries")
    .update({ status } as never)
    .eq("id", enquiryId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Setting status of enquiry ${enquiryId}`,
        error,
        "Could not change that enquiry's status. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: auditActionFor(status),
    entityType: "enquiry",
    entityId: enquiryId,
    // Statuses only. Nothing here identifies the sender.
    metadata: { field: "status", from: existing.status, to: status },
  });

  revalidatePath("/admin/enquiries");
  revalidatePath("/admin");

  return { success: true };
}

export async function saveEnquiryNotes(
  enquiryId: string,
  notes: string,
): Promise<EnquiryActionResult> {
  await requireAdmin();

  const validation = validateAdminNotes(notes);

  if (!validation.ok) {
    return {
      success: false,
      error: summarise(validation.errors),
      fieldErrors: validation.errors,
    };
  }

  const supabase = await createAdminClient();
  const existing = await loadEnquiry(supabase, enquiryId);

  if (!existing) {
    return { success: false, error: "That enquiry could not be found." };
  }

  const { error } = await supabase
    .from("enquiries")
    .update({ admin_notes: validation.value } as never)
    .eq("id", enquiryId);

  if (error) {
    return {
      success: false,
      error: handleAdminError(
        `Saving notes on enquiry ${enquiryId}`,
        error,
        "Could not save those notes. Please try again.",
      ),
    };
  }

  await logAuditEvent({
    action: "updated",
    // The entity is the enquiry; `field` says which part of it changed. A
    // separate `enquiry_notes` entity type would split one record's history
    // across two entity types for no gain.
    entityType: "enquiry",
    entityId: enquiryId,
    // Whether a note now exists, not what it says.
    metadata: { field: "admin_notes", cleared: validation.value === null },
  });

  revalidatePath("/admin/enquiries");

  return { success: true };
}
