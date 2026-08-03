import type { Property } from "@/types";

/**
 * The contract every property data source fulfils.
 *
 * The local fixture source and the Supabase source both implement this exact
 * shape, so the rest of the app never has to know where the `Property[]
 * ` came from. Adding a new read (search by suburb, sitemap dump, RSS) means
 * adding it here once and implementing it in both places.
 */
export interface PropertySource {
  /** Every published property, unsorted — the repository owns ordering. */
  getProperties(): Promise<Property[]>;

  /** One published property by slug, or null. */
  getPropertyBySlug(slug: string): Promise<Property | null>;

  /** Slugs of published properties, for `generateStaticParams`. */
  getPropertySlugs(): Promise<string[]>;
}
