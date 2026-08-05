import {
  ErrorBag,
  invalid,
  isBlank,
  valid,
  type ValidationResult,
} from "@/lib/admin/validation/result";

/**
 * SEO override validation.
 *
 * Every field is optional: null means "fall back", which is what makes the
 * three-level chain in `lib/seo/metadata.ts` work. Mirrors the constraints
 * migration 0010 adds to `properties`.
 */

export const SEO_LIMITS = {
  /** Google truncates a title around here. Longer is not wrong, just unread. */
  metaTitle: 70,
  metaDescription: 200,
} as const;

/** Below these, the field is technically valid but wasting the space. */
export const SEO_RECOMMENDED_MINIMUM = {
  metaTitle: 20,
  metaDescription: 70,
} as const;

const MARKUP_PATTERN = /<[^>]*>/;

export interface SeoInput {
  readonly metaTitle?: string;
  readonly metaDescription?: string;
  readonly ogImageId?: string;
  readonly canonicalUrl?: string;
  readonly noindex: boolean;
}

export interface ValidatedSeo {
  readonly metaTitle?: string;
  readonly metaDescription?: string;
  readonly ogImageId?: string;
  readonly canonicalUrl?: string;
  readonly noindex: boolean;
}

/** Advice that does not prevent saving. */
export interface SeoAdvisory {
  readonly field: string;
  readonly message: string;
}

export interface SeoValidationOutcome {
  readonly value: ValidatedSeo;
  readonly advisories: readonly SeoAdvisory[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateSeo(
  input: SeoInput,
): ValidationResult<SeoValidationOutcome> {
  const errors = new ErrorBag();
  const advisories: SeoAdvisory[] = [];

  const metaTitle = input.metaTitle?.trim();
  const metaDescription = input.metaDescription?.trim();
  const canonicalUrl = input.canonicalUrl?.trim();

  /* --- Meta title ---------------------------------------------------- */

  if (metaTitle !== undefined && metaTitle !== "") {
    if (metaTitle.length > SEO_LIMITS.metaTitle) {
      errors.add(
        "metaTitle",
        `Keep the title to ${SEO_LIMITS.metaTitle} characters or fewer — search results truncate beyond that.`,
      );
    } else if (MARKUP_PATTERN.test(metaTitle)) {
      errors.add("metaTitle", "Remove the HTML tags — this is plain text.");
    } else if (metaTitle.length < SEO_RECOMMENDED_MINIMUM.metaTitle) {
      // Advisory: a short title is valid, just an opportunity missed.
      advisories.push({
        field: "metaTitle",
        message: `This title is short. Around ${SEO_RECOMMENDED_MINIMUM.metaTitle}–${SEO_LIMITS.metaTitle} characters uses the space search results give you.`,
      });
    }
  }

  /* --- Meta description ---------------------------------------------- */

  if (metaDescription !== undefined && metaDescription !== "") {
    if (metaDescription.length > SEO_LIMITS.metaDescription) {
      errors.add(
        "metaDescription",
        `Keep the description to ${SEO_LIMITS.metaDescription} characters or fewer.`,
      );
    } else if (MARKUP_PATTERN.test(metaDescription)) {
      errors.add("metaDescription", "Remove the HTML tags — this is plain text.");
    } else if (metaDescription.length < SEO_RECOMMENDED_MINIMUM.metaDescription) {
      advisories.push({
        field: "metaDescription",
        message: `This description is short. Around ${SEO_RECOMMENDED_MINIMUM.metaDescription}–${SEO_LIMITS.metaDescription} characters reads better in search results.`,
      });
    }
  }

  /* --- Canonical override -------------------------------------------- */

  if (canonicalUrl !== undefined && canonicalUrl !== "") {
    let parsed: URL | null = null;

    try {
      parsed = new URL(canonicalUrl);
    } catch {
      errors.add("canonicalUrl", "That is not a complete web address.");
    }

    if (parsed && parsed.protocol !== "https:") {
      errors.add("canonicalUrl", "A canonical URL must start with https://");
    }

    if (parsed && parsed.protocol === "https:") {
      // Pointing elsewhere tells search engines not to index this page at all,
      // which is occasionally right and usually a mistake.
      advisories.push({
        field: "canonicalUrl",
        message:
          "A canonical override tells search engines the real page is elsewhere. Leave this blank unless this property genuinely duplicates another page.",
      });
    }
  }

  /* --- Open Graph image ---------------------------------------------- */
  //
  // Only the shape is checked here. Whether the image is published and belongs
  // to this property needs the database, and is verified by the action —
  // `checkOgImageEligibility` below describes that contract.

  if (
    input.ogImageId !== undefined &&
    input.ogImageId !== "" &&
    !UUID_PATTERN.test(input.ogImageId)
  ) {
    errors.add("ogImageId", "That image reference is not valid.");
  }

  /* --- Noindex -------------------------------------------------------- */

  if (input.noindex) {
    advisories.push({
      field: "noindex",
      message:
        "This property will be excluded from search results while noindex is on.",
    });
  }

  if (!errors.isEmpty) {
    return invalid(errors.all);
  }

  return valid({
    value: {
      metaTitle: metaTitle === "" ? undefined : metaTitle,
      metaDescription: metaDescription === "" ? undefined : metaDescription,
      ogImageId: input.ogImageId === "" ? undefined : input.ogImageId,
      canonicalUrl: canonicalUrl === "" ? undefined : canonicalUrl,
      noindex: input.noindex,
    },
    advisories,
  });
}

/* ---------------------------------------------------------------------- */
/* Open Graph image eligibility                                           */
/* ---------------------------------------------------------------------- */

export interface OgImageCandidate {
  readonly propertyId: string;
  readonly isPublished: boolean;
  readonly hasSource: boolean;
  readonly imageType: string;
}

/**
 * Whether an image may be used for social previews.
 *
 * A social preview is fetched by third parties — Facebook, Slack, iMessage —
 * from a public URL, with no session. A draft image would be a broken preview
 * everywhere the link is shared, so it is refused rather than warned about.
 *
 * A floor plan is refused for the same reason it cannot be the hero: as the
 * single image representing the property in a shared link, a diagram reads as
 * a fault.
 */
export function checkOgImageEligibility(
  candidate: OgImageCandidate,
  expectedPropertyId: string,
): ValidationResult<true> {
  const errors = new ErrorBag();

  if (candidate.propertyId !== expectedPropertyId) {
    errors.add("ogImageId", "That image belongs to a different property.");
  }

  if (!candidate.hasSource) {
    errors.add("ogImageId", "That image has no file or link attached.");
  }

  if (!candidate.isPublished) {
    errors.add(
      "ogImageId",
      "Publish this image first — a draft image would show as a broken preview wherever the link is shared.",
    );
  }

  if (candidate.imageType === "floor_plan") {
    errors.add(
      "ogImageId",
      "A floor plan makes a poor social preview. Choose a photograph.",
    );
  }

  return errors.isEmpty ? valid(true) : invalid(errors.all);
}

/* ---------------------------------------------------------------------- */
/* Preview                                                                */
/* ---------------------------------------------------------------------- */

/** How a title and description will appear, so the editor can see it. */
export function truncateForSearchPreview(
  value: string,
  limit: number,
): { readonly text: string; readonly truncated: boolean } {
  if (isBlank(value) || value.length <= limit) {
    return { text: value, truncated: false };
  }

  // Break on a word boundary rather than mid-word, as search engines do.
  const clipped = value.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");

  return {
    text: `${lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped}…`,
    truncated: true,
  };
}
