import type { PropertyPreview } from "@/types";

/**
 * Concept façades, not listings.
 *
 * These three entries let the card design and the status system be reviewed
 * before the Supabase property schema exists. They describe plan types rather
 * than real homes, and the section copy tells visitors exactly that. Replace
 * them with real records — the shape is already correct, including the slug used
 * by the future /properties/[slug] route.
 *
 * Add `imagePath` (a path inside the Supabase Storage bucket) to swap the
 * architectural drawing for photography, one property at a time.
 */
export const featuredProperties: readonly PropertyPreview[] = [
  {
    id: "concept-single-storey",
    slug: "single-storey-concept",
    name: "Single storey concept",
    suburb: "Mickleham",
    status: "move-in-ready",
    summary:
      "Single level, north-facing living, courtyard to the rear boundary.",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 448,
    placeholderVariant: "single-storey",
  },
  {
    id: "concept-double-storey",
    slug: "two-storey-concept",
    name: "Two storey concept",
    suburb: "Craigieburn",
    status: "under-construction",
    summary:
      "Two storey, upper level retreat, double garage under the main roofline.",
    bedrooms: 4,
    bathrooms: 3,
    carSpaces: 2,
    landSize: 512,
    placeholderVariant: "double-storey",
  },
  {
    id: "concept-townhouse",
    slug: "townhouse-concept",
    name: "Townhouse concept",
    suburb: "Donnybrook",
    status: "completed",
    summary: "Compact footprint, shared party wall, private upper terrace.",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 1,
    landSize: 262,
    placeholderVariant: "townhouse",
  },
] as const;
