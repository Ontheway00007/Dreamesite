import { activePropertySource, getActivePropertySourceName } from "@/lib/properties/repository";
import type { Property } from "@/types";

/**
 * Rich read result for the public catalogue.
 *
 * UI code checks exactly one field; the `discriminated-union` shape means a
 * caller cannot accidentally read `data` when the read reported `unavailable`,
 * and trivially renders a polished empty state in both `empty` and
 * `unavailable` cases.
 */

export type CatalogueState =
  | { readonly kind: "ok"; readonly properties: readonly Property[] }
  | { readonly kind: "empty" }
  | { readonly kind: "unavailable" };

/** The full public catalogue, or a typed non-OK state. */
export async function getCatalogue(): Promise<CatalogueState> {
  const source = activePropertySource();

  if (source === null) {
    // Production deployment without Supabase configuration: deliberately no
    // fictional data.
    return { kind: "empty" };
  }

  if (getActivePropertySourceName() === "supabase") {
    const properties = await source.getProperties();

    if (properties.length === 0) {
      // An unreachable Supabase read surfaces as an empty list today (the
      // module logs on the server); this is the point where a future health
      // probe can turn "empty because offline" into "unavailable".
      return { kind: "empty" };
    }

    return { kind: "ok", properties };
  }

  const properties = await source.getProperties();

  return properties.length === 0
    ? { kind: "empty" }
    : { kind: "ok", properties };
}
