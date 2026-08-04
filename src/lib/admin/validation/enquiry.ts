import {
  ErrorBag,
  invalid,
  isBlank,
  valid,
  type ValidationResult,
} from "@/lib/admin/validation/result";

/**
 * Enquiry validation.
 *
 * The only validator in this codebase that runs against input from the open
 * internet, so it is the one place where the caller is assumed hostile rather
 * than merely mistaken.
 *
 * Mirrors the constraints on `enquiries` from migrations 0001 and 0005:
 * non-empty name and message, an email shape, name ≤ 120, email ≤ 254,
 * message ≤ 4000, source ≤ 50, and a phone pattern.
 */

export const ENQUIRY_LIMITS = {
  name: 120,
  email: 254,
  phone: 25,
  message: 4000,
  source: 50,
  /** Matches `enquiries_admin_notes_length` from migration 0010. */
  notes: 4000,
} as const;

/* ---------------------------------------------------------------------- */
/* Workflow                                                               */
/* ---------------------------------------------------------------------- */

/**
 * The states an enquiry moves through. Mirrors the `status` column's check.
 *
 * `archived` is the end of the line, and there is no `deleted`: an enquiry is a
 * record of someone asking the business a question, and destroying it on a
 * whim is not something the admin interface offers. See the README for the
 * retention position.
 */
export const ENQUIRY_STATUSES = ["new", "read", "replied", "archived"] as const;

export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABELS: Readonly<Record<EnquiryStatus, string>> = {
  new: "New",
  read: "Read",
  replied: "Replied",
  archived: "Archived",
};

export function isEnquiryStatus(value: unknown): value is EnquiryStatus {
  return (
    typeof value === "string" &&
    (ENQUIRY_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Validates a staff note.
 *
 * Notes are free text — they are read by colleagues, not rendered on the public
 * site — so the only rules are the length the column enforces, and that
 * clearing a note is allowed.
 */
export function validateAdminNotes(
  raw: string,
): ValidationResult<string | null> {
  const errors = new ErrorBag();
  const notes = normaliseText(raw ?? "");

  if (notes.length > ENQUIRY_LIMITS.notes) {
    errors.add(
      "notes",
      `Keep notes to ${ENQUIRY_LIMITS.notes} characters or fewer.`,
    );
  }

  if (!errors.isEmpty) {
    return invalid(errors.all);
  }

  // Empty means "no note", which is null rather than an empty string, so a
  // cleared note reads the same as one never written.
  return valid(notes === "" ? null : notes);
}

/** Long enough to be a real question, short enough to reject a single word. */
const MINIMUM_MESSAGE_LENGTH = 10;

/**
 * Matches the `email` CHECK on the table.
 *
 * Deliberately loose. Email addresses are far stranger than most patterns
 * allow, and the only authoritative test is whether a message arrives. This
 * catches a missing `@` or a typo, and nothing more.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Matches the `phone_format` CHECK: digits and the usual punctuation. */
const PHONE_PATTERN = /^[0-9+() \-]{6,25}$/;

const MARKUP_PATTERN = /<[^>]*>/;

/**
 * Links in a message body.
 *
 * Almost every enquiry containing a URL is spam — a genuine buyer asks about
 * the home. This is used as a *signal*, not a rejection: a legitimate sender
 * might link the block they are asking about.
 */
const URL_PATTERN = /\bhttps?:\/\/|\bwww\./i;

/**
 * Whether a message body carries the spam signal.
 *
 * Exported so the admin list can derive the flag when it reads an enquiry,
 * rather than the submission path storing it. Derived means the heuristic can
 * be improved without a migration or a backfill, and means a submitter — who
 * inserts as `anon` and could set any column the policy permits — has no say
 * in how their own message is classified.
 */
export function looksLikeSpam(message: string): boolean {
  return URL_PATTERN.test(message);
}

export interface EnquiryInput {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly message: string;
  readonly propertyId?: string;
  readonly consentToContact: boolean;
  readonly source?: string;
}

export interface ValidatedEnquiry {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly message: string;
  readonly propertyId?: string;
  readonly consentToContact: boolean;
  readonly source: string;
  /** True when the message looks like spam. Recorded, not rejected. */
  readonly suspectedSpam: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Collapses whitespace and strips control characters.
 *
 * A pasted message often arrives with runs of newlines and the occasional
 * zero-width character. Normalising here means the stored value is what a
 * member of staff will actually read.
 */
function normaliseText(value: string): string {
  return value
    // Control characters except tab and newline.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // Zero-width and bidirectional marks, which can disguise text.
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    // Three or more blank lines become one.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normaliseSingleLine(value: string): string {
  return normaliseText(value).replace(/\s+/g, " ");
}

export function validateEnquiry(
  input: EnquiryInput,
): ValidationResult<ValidatedEnquiry> {
  const errors = new ErrorBag();

  const name = normaliseSingleLine(input.name ?? "");
  const email = normaliseSingleLine(input.email ?? "").toLowerCase();
  const phone = normaliseSingleLine(input.phone ?? "");
  const message = normaliseText(input.message ?? "");

  /* --- Name ---------------------------------------------------------- */

  if (isBlank(name)) {
    errors.add("name", "Please tell us your name.");
  } else if (name.length > ENQUIRY_LIMITS.name) {
    errors.add("name", `Please keep your name under ${ENQUIRY_LIMITS.name} characters.`);
  } else if (MARKUP_PATTERN.test(name)) {
    errors.add("name", "Please enter your name without any HTML tags.");
  }

  /* --- Email --------------------------------------------------------- */

  if (isBlank(email)) {
    errors.add("email", "Please give us an email address so we can reply.");
  } else if (email.length > ENQUIRY_LIMITS.email) {
    errors.add("email", "That email address is too long.");
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.add("email", "That email address does not look right. Please check it.");
  }

  /* --- Phone (optional) ---------------------------------------------- */

  if (phone !== "" && !PHONE_PATTERN.test(phone)) {
    errors.add(
      "phone",
      "Please enter a phone number using digits, spaces and brackets only.",
    );
  }

  /* --- Message ------------------------------------------------------- */

  if (isBlank(message)) {
    errors.add("message", "Please tell us what you would like to know.");
  } else if (message.length < MINIMUM_MESSAGE_LENGTH) {
    errors.add("message", "Please add a little more detail to your message.");
  } else if (message.length > ENQUIRY_LIMITS.message) {
    errors.add(
      "message",
      `Please keep your message under ${ENQUIRY_LIMITS.message} characters.`,
    );
  } else if (MARKUP_PATTERN.test(message)) {
    errors.add("message", "Please write your message without any HTML tags.");
  }

  /* --- Property ------------------------------------------------------ */

  if (
    input.propertyId !== undefined &&
    input.propertyId !== "" &&
    !UUID_PATTERN.test(input.propertyId)
  ) {
    // Not shown against a field: the property is set by the page, not typed,
    // so an invalid value means the request was assembled by hand.
    errors.add("form", "Something went wrong with this form. Please reload the page.");
  }

  /* --- Consent ------------------------------------------------------- */

  if (!input.consentToContact) {
    errors.add(
      "consentToContact",
      "Please confirm you are happy for us to reply to your enquiry.",
    );
  }

  if (!errors.isEmpty) {
    return invalid(errors.all);
  }

  const source =
    input.source && input.source.length <= ENQUIRY_LIMITS.source
      ? input.source
      : "website";

  return valid({
    name,
    email,
    phone: phone === "" ? undefined : phone,
    message,
    propertyId:
      input.propertyId === undefined || input.propertyId === ""
        ? undefined
        : input.propertyId,
    consentToContact: input.consentToContact,
    source,
    suspectedSpam: looksLikeSpam(message),
  });
}

/* ---------------------------------------------------------------------- */
/* Anti-abuse                                                             */
/* ---------------------------------------------------------------------- */

/** Field name for the honeypot. Plausible enough that a bot will fill it. */
export const HONEYPOT_FIELD = "company_website";

/** Hidden field carrying when the form was rendered. */
export const TIMESTAMP_FIELD = "form_rendered_at";

/**
 * Shortest plausible time to complete the form, in milliseconds.
 *
 * Reading the fields and typing a message takes a person several seconds. A
 * submission arriving in under three is automated.
 */
export const MINIMUM_FILL_MS = 3_000;

/**
 * Longest a rendered form is accepted, in milliseconds.
 *
 * Bounded so a timestamp harvested once cannot be replayed indefinitely. Two
 * hours is generous for someone who opened the page and came back to it.
 */
export const MAXIMUM_FILL_MS = 2 * 60 * 60 * 1000;

export type AbuseSignal =
  | "honeypot-filled"
  | "submitted-too-fast"
  | "form-expired";

/**
 * Why a missing timestamp is not itself a signal.
 *
 * The field is populated by an effect when the form mounts, not by the server:
 * the pages carrying this form are cached, so a server-rendered timestamp would
 * arrive minutes or hours old and read as expired.
 *
 * That makes absence ambiguous. A visitor with JavaScript disabled submits
 * without it, and so does a script that strips hidden fields. Rejecting on
 * absence would block the visitor while costing the script one line — it would
 * simply send a plausible value instead. The honeypot remains the hard check,
 * and timing refines it when a timestamp is present.
 */

export interface AbuseCheckInput {
  readonly honeypot: string | null;
  readonly renderedAt: string | null;
  readonly now?: number;
}

/**
 * Cheap automated-submission checks.
 *
 * **These are friction, not security.** Both signals are client-supplied: a
 * determined script can leave the honeypot empty and send a timestamp three
 * seconds old, or omit it altogether. They stop the indiscriminate
 * form-filling that makes up most spam, and nothing more.
 *
 * What would raise the bar — a signed nonce, or per-IP counting in shared
 * storage — is deliberately not claimed here. See the README for what this
 * does and does not defend against.
 *
 * Returns null when nothing looks wrong.
 */
export function checkForAbuse(input: AbuseCheckInput): AbuseSignal | null {
  // A real visitor never sees this field, so anything in it came from a script
  // filling every input it found.
  if (input.honeypot !== null && input.honeypot.trim() !== "") {
    return "honeypot-filled";
  }

  if (input.renderedAt === null || input.renderedAt.trim() === "") {
    // No timing information. See the note above: ambiguous, so not a signal.
    return null;
  }

  const renderedAt = Number(input.renderedAt);

  // A value that is present but not a usable timestamp was assembled by
  // something other than our form.
  if (!Number.isFinite(renderedAt) || renderedAt <= 0) {
    return "submitted-too-fast";
  }

  const elapsed = (input.now ?? Date.now()) - renderedAt;

  // A negative elapsed time means a forged or clock-skewed timestamp.
  if (elapsed < MINIMUM_FILL_MS) {
    return "submitted-too-fast";
  }

  if (elapsed > MAXIMUM_FILL_MS) {
    return "form-expired";
  }

  return null;
}

/**
 * What to tell the sender when a signal fires.
 *
 * A honeypot hit gets the generic failure: naming the trap teaches whoever
 * tripped it how to avoid it next time. An expired form gets a real
 * explanation, because that happens to genuine visitors who left the tab open.
 */
export function describeAbuseSignal(signal: AbuseSignal): string {
  switch (signal) {
    case "form-expired":
      return "This form has been open a while. Please reload the page and send it again.";
    case "honeypot-filled":
    case "submitted-too-fast":
      return "We could not send your enquiry. Please reload the page and try again.";
  }
}
