"use server";

import {
  HONEYPOT_FIELD,
  TIMESTAMP_FIELD,
  checkForAbuse,
  describeAbuseSignal,
  validateEnquiry,
} from "@/lib/admin/validation/enquiry";
import type { EnquiryFormState } from "@/lib/enquiries/form-state";
import { env } from "@/lib/env";
import { createSupabaseCatalogClient } from "@/lib/supabase/catalog";

/**
 * Public enquiry submission.
 *
 * The only write path in this codebase open to the internet, so three
 * deliberate choices shape it:
 *
 * 1. **It inserts as `anon`.** Not with the service role. The row is written
 *    through the same anonymous policy a browser would use, so the database
 *    enforces `status = 'new'`, refuses `admin_notes`, and refuses a property
 *    that is not published. A mistake in this file cannot produce a row the
 *    policy would have rejected.
 * 2. **Nothing is written to the audit log.** The audit trail answers "which
 *    administrator did this", and there is no administrator here. It also runs
 *    with the administrator's own client, which an anonymous submission does
 *    not have.
 * 3. **Nothing sensitive is logged.** Server logs record that a submission
 *    failed and why, never the sender's name, address, phone or message.
 *
 * Takes `FormData` and is used as the `action` of a real `<form>`, so the form
 * submits and reports errors with JavaScript unavailable.
 */

/**
 * Where the enquiry came from, as a closed vocabulary.
 *
 * The field is a hidden input, so its value is whatever the caller sends.
 * Constraining it here means the admin list shows one of three known origins
 * rather than arbitrary text a script chose.
 */
const ENQUIRY_SOURCES = ["homepage", "property-page", "contact"] as const;

const DEFAULT_SOURCE = "website";

function resolveSource(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") {
    return DEFAULT_SOURCE;
  }

  return (ENQUIRY_SOURCES as readonly string[]).includes(value)
    ? value
    : DEFAULT_SOURCE;
}

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value : "";
}

/** The fields worth returning after a failure. The honeypot is not one. */
function echo(data: FormData): Record<string, string> {
  return {
    name: text(data, "name"),
    email: text(data, "email"),
    phone: text(data, "phone"),
    message: text(data, "message"),
  };
}

const GENERIC_FAILURE =
  "We could not send your enquiry just now. Please try again, or email us directly.";

export async function submitEnquiry(
  _previous: EnquiryFormState,
  data: FormData,
): Promise<EnquiryFormState> {
  /* --- Automated submissions ------------------------------------------ */

  // Checked before validation: a script that filled every field should not be
  // told which of its values were malformed.
  const abuse = checkForAbuse({
    honeypot: text(data, HONEYPOT_FIELD),
    renderedAt: text(data, TIMESTAMP_FIELD),
  });

  if (abuse) {
    // An expired form is a real visitor whose tab was open too long, so their
    // text is returned. The other signals are automated; there is nothing to
    // preserve.
    return {
      status: "error",
      message: describeAbuseSignal(abuse),
      ...(abuse === "form-expired" ? { values: echo(data) } : {}),
    };
  }

  /* --- Validation ------------------------------------------------------ */

  const validation = validateEnquiry({
    name: text(data, "name"),
    email: text(data, "email"),
    phone: text(data, "phone"),
    message: text(data, "message"),
    propertyId: text(data, "propertyId"),
    consentToContact: data.get("consentToContact") !== null,
    source: resolveSource(data.get("source")),
  });

  if (!validation.ok) {
    const fieldErrors: Record<string, string> = {};

    for (const error of validation.errors) {
      if (!fieldErrors[error.field]) {
        fieldErrors[error.field] = error.message;
      }
    }

    return {
      status: "error",
      message: "Please check the highlighted fields and send it again.",
      fieldErrors,
      values: echo(data),
    };
  }

  const enquiry = validation.value;

  /* --- Configuration --------------------------------------------------- */

  if (!env.isSupabaseConfigured) {
    // Local development without Supabase. Saying so beats a silent success
    // that stores nothing.
    console.warn(
      "[enquiry] Supabase is not configured; the submission was not stored.",
    );

    return {
      status: "error",
      message: GENERIC_FAILURE,
      values: echo(data),
    };
  }

  /* --- Insert ---------------------------------------------------------- */

  const supabase = createSupabaseCatalogClient();

  // `status` is left to the column default and `admin_notes` is not sent at
  // all — both are conditions of the anonymous insert policy.
  const { error } = await supabase.from("enquiries").insert({
    property_id: enquiry.propertyId ?? null,
    name: enquiry.name,
    email: enquiry.email,
    phone: enquiry.phone ?? null,
    message: enquiry.message,
    source: enquiry.source,
    consent_to_contact: enquiry.consentToContact,
  } as never);

  if (error) {
    // Codes and messages only. The row contents are the sender's personal
    // information and do not belong in a log.
    console.error("[enquiry] Insert failed", {
      code: error.code,
      message: error.message,
      hasProperty: enquiry.propertyId !== undefined,
    });

    return {
      status: "error",
      message: GENERIC_FAILURE,
      values: echo(data),
    };
  }

  return {
    status: "success",
    message:
      "Thank you — your enquiry has been sent. Our team will be in touch shortly.",
  };
}
