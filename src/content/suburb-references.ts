/**
 * Suburb reference positions.
 *
 * Used when a property's location visibility is `suburb`: the marker is derived
 * from the suburb, never from the property, so a suburb-only marker reveals
 * nothing about where the home actually is.
 *
 * These are general locality centres — public geography, not property data.
 */
export interface SuburbReference {
  readonly name: string;
  readonly state: string;
  readonly latitude: number;
  readonly longitude: number;
}

const references: readonly SuburbReference[] = [
  { name: "Mickleham", state: "VIC", latitude: -37.5167, longitude: 144.8833 },
  { name: "Craigieburn", state: "VIC", latitude: -37.6, longitude: 144.94 },
  { name: "Donnybrook", state: "VIC", latitude: -37.5, longitude: 144.95 },
] as const;

const byKey = new Map(
  references.map((reference) => [reference.name.toLowerCase(), reference]),
);

/** Case-insensitive lookup. Returns null for a suburb with no reference yet. */
export function getSuburbReference(name: string): SuburbReference | null {
  return byKey.get(name.trim().toLowerCase()) ?? null;
}

export const suburbReferences = references;
