import type { PropertyPreview } from "@/types";

/**
 * PLACEHOLDER SHOWCASE CONTENT.
 *
 * These three homes exist so the homepage can be designed and reviewed before
 * the Supabase property schema lands. Names, specifications and suburbs must be
 * replaced with real records; none of them describe an actual property.
 *
 * Add `imagePath` (a path inside the Supabase Storage bucket) to swap the
 * architectural placeholder for photography, one property at a time.
 */
export const featuredProperties: readonly PropertyPreview[] = [
  {
    id: "placeholder-kalkallo",
    name: "Facade study A",
    suburb: "Kalkallo",
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
    id: "placeholder-wollert",
    name: "Facade study B",
    suburb: "Wollert",
    status: "under-construction",
    summary: "Two storey, upper level retreat, double garage under roofline.",
    bedrooms: 4,
    bathrooms: 3,
    carSpaces: 2,
    landSize: 512,
    placeholderVariant: "double-storey",
  },
  {
    id: "placeholder-mernda",
    name: "Facade study C",
    suburb: "Mernda",
    status: "completed",
    summary: "Compact footprint, shared party wall, private upper terrace.",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 1,
    landSize: 262,
    placeholderVariant: "townhouse",
  },
] as const;
