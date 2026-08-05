/**
 * The contract between the enquiry form and its Server Action.
 *
 * Kept out of `submit.ts` because a `"use server"` module may only export
 * async functions — a plain constant there is a build error. Types are erased
 * and would be fine, but the initial state is a value, so the whole contract
 * lives here and both sides import it.
 */

/** What the form renders after a submission attempt. */
export interface EnquiryFormState {
  readonly status: "idle" | "success" | "error";
  /** Sentence shown above the form. */
  readonly message?: string;
  /** Messages keyed by field name, for the inputs to display. */
  readonly fieldErrors?: Readonly<Record<string, string>>;
  /**
   * What the sender typed, echoed back so a validation failure does not empty
   * the form. Never populated on success, and never includes the honeypot.
   */
  readonly values?: Readonly<Record<string, string>>;
}

export const initialEnquiryState: EnquiryFormState = { status: "idle" };
