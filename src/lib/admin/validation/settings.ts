import {
  ErrorBag,
  invalid,
  valid,
  type ValidationResult,
} from "@/lib/admin/validation/result";

/**
 * Site settings validation.
 *
 * The settings model is a fixed set of typed fields, not a key/value store.
 * That is the primary defence against secrets ending up in a table the public
 * site reads: there is no column an API key could go in.
 *
 * The heuristic below is the secondary defence, for the case where someone
 * pastes a token into a text field that does have a legitimate purpose.
 *
 * There is deliberately no default map centre or zoom: the explorer fits its
 * viewport to the properties it is showing, so a stored centre would have no
 * reader and would go stale as soon as the business built somewhere new.
 */

export const SETTINGS_LIMITS = {
  companyName: 120,
  companyPhone: 40,
  companyEmail: 254,
  addressDisplay: 200,
  metaTitle: 70,
  metaDescription: 200,
  maintenanceNotice: 500,
  url: 500,
} as const;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_PATTERN = /^[0-9+() \-]{6,40}$/;
const MARKUP_PATTERN = /<[^>]*>/;

/**
 * Shapes that indicate a credential rather than a setting.
 *
 * Not exhaustive, and not meant to be — an exhaustive list of what a secret
 * looks like does not exist. It catches the realistic accident: someone
 * pasting a Supabase key, a JWT, a Stripe key or a PEM block into a field
 * while moving configuration around.
 *
 * The point is to fail loudly at the moment of the mistake, because the
 * settings row is read by the public site and a secret there is published.
 */
const SECRET_PATTERNS: ReadonlyArray<{ pattern: RegExp; what: string }> = [
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}/, what: "a JSON web token" },
  { pattern: /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/i, what: "a Supabase key" },
  { pattern: /\bservice_role\b/i, what: "a service-role reference" },
  { pattern: /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}/, what: "an API key" },
  { pattern: /-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}/, what: "a private key" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, what: "an AWS access key" },
  { pattern: /\bghp_[A-Za-z0-9]{20,}/, what: "a GitHub token" },
  {
    pattern: /\b(password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*\S+/i,
    what: "a credential",
  },
];

/** Returns what the value looks like, or null when nothing matched. */
export function detectSecret(value: string): string | null {
  for (const { pattern, what } of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      return what;
    }
  }

  return null;
}

export interface SettingsInput {
  readonly companyName?: string;
  readonly companyPhone?: string;
  readonly companyEmail?: string;
  readonly companyAddressDisplay?: string;
  readonly defaultMetaTitle?: string;
  readonly defaultMetaDescription?: string;
  readonly defaultOgImageUrl?: string;
  readonly socialFacebook?: string;
  readonly socialInstagram?: string;
  readonly socialLinkedin?: string;
  readonly enquiryRecipientEmail?: string;
  readonly maintenanceNotice?: string;
}

export type ValidatedSettings = SettingsInput;

/** Trims, and turns an empty string into undefined so the column stores null. */
function optional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function checkText(
  errors: ErrorBag,
  field: string,
  label: string,
  value: string | undefined,
  limit: number,
): void {
  if (value === undefined) return;

  if (value.length > limit) {
    errors.add(field, `Keep the ${label} to ${limit} characters or fewer.`);
    return;
  }

  if (MARKUP_PATTERN.test(value)) {
    errors.add(field, `Remove the HTML tags from the ${label}.`);
    return;
  }

  const secret = detectSecret(value);

  if (secret) {
    errors.add(
      field,
      `That looks like ${secret}. Settings are readable by the public site — credentials belong in environment variables.`,
    );
  }
}

function checkHttpsUrl(
  errors: ErrorBag,
  field: string,
  label: string,
  value: string | undefined,
): void {
  if (value === undefined) return;

  if (value.length > SETTINGS_LIMITS.url) {
    errors.add(field, `That ${label} is too long.`);
    return;
  }

  const secret = detectSecret(value);

  if (secret) {
    errors.add(field, `That looks like ${secret} rather than a ${label}.`);
    return;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    errors.add(field, `That is not a complete web address. It should start with https://`);
    return;
  }

  if (parsed.protocol !== "https:") {
    errors.add(field, `The ${label} must start with https://`);
  }
}

export function validateSettings(
  input: SettingsInput,
): ValidationResult<ValidatedSettings> {
  const errors = new ErrorBag();

  const companyName = optional(input.companyName);
  const companyPhone = optional(input.companyPhone);
  const companyEmail = optional(input.companyEmail)?.toLowerCase();
  const companyAddressDisplay = optional(input.companyAddressDisplay);
  const defaultMetaTitle = optional(input.defaultMetaTitle);
  const defaultMetaDescription = optional(input.defaultMetaDescription);
  const defaultOgImageUrl = optional(input.defaultOgImageUrl);
  const socialFacebook = optional(input.socialFacebook);
  const socialInstagram = optional(input.socialInstagram);
  const socialLinkedin = optional(input.socialLinkedin);
  const enquiryRecipientEmail = optional(input.enquiryRecipientEmail)?.toLowerCase();
  const maintenanceNotice = optional(input.maintenanceNotice);

  /* --- Business identity --------------------------------------------- */

  checkText(errors, "companyName", "company name", companyName, SETTINGS_LIMITS.companyName);
  checkText(
    errors,
    "companyAddressDisplay",
    "address",
    companyAddressDisplay,
    SETTINGS_LIMITS.addressDisplay,
  );

  if (companyPhone !== undefined && !PHONE_PATTERN.test(companyPhone)) {
    errors.add(
      "companyPhone",
      "Enter a phone number using digits, spaces and brackets only.",
    );
  }

  if (companyEmail !== undefined) {
    if (companyEmail.length > SETTINGS_LIMITS.companyEmail) {
      errors.add("companyEmail", "That email address is too long.");
    } else if (!EMAIL_PATTERN.test(companyEmail)) {
      errors.add("companyEmail", "That email address does not look right.");
    }
  }

  /* --- SEO defaults --------------------------------------------------- */

  checkText(
    errors,
    "defaultMetaTitle",
    "default title",
    defaultMetaTitle,
    SETTINGS_LIMITS.metaTitle,
  );
  checkText(
    errors,
    "defaultMetaDescription",
    "default description",
    defaultMetaDescription,
    SETTINGS_LIMITS.metaDescription,
  );
  checkHttpsUrl(errors, "defaultOgImageUrl", "image address", defaultOgImageUrl);

  /* --- Social --------------------------------------------------------- */

  checkHttpsUrl(errors, "socialFacebook", "Facebook link", socialFacebook);
  checkHttpsUrl(errors, "socialInstagram", "Instagram link", socialInstagram);
  checkHttpsUrl(errors, "socialLinkedin", "LinkedIn link", socialLinkedin);

  /* --- Operational ---------------------------------------------------- */

  if (enquiryRecipientEmail !== undefined) {
    if (!EMAIL_PATTERN.test(enquiryRecipientEmail)) {
      errors.add("enquiryRecipientEmail", "That email address does not look right.");
    }
  }

  checkText(
    errors,
    "maintenanceNotice",
    "notice",
    maintenanceNotice,
    SETTINGS_LIMITS.maintenanceNotice,
  );

  if (!errors.isEmpty) {
    return invalid(errors.all);
  }

  return valid({
    companyName,
    companyPhone,
    companyEmail,
    companyAddressDisplay,
    defaultMetaTitle,
    defaultMetaDescription,
    defaultOgImageUrl,
    socialFacebook,
    socialInstagram,
    socialLinkedin,
    enquiryRecipientEmail,
    maintenanceNotice,
  });
}
