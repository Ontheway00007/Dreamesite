/**
 * Image resolution for property media.
 *
 * Photography will live in a public Supabase Storage bucket. A property record
 * stores only the path inside that bucket, so nothing in the UI has to know
 * where the files are hosted. Until a property has a path — or until Supabase is
 * configured — the card falls back to the architectural placeholder.
 */

/** Public Supabase Storage bucket that holds property media. */
export const PROPERTY_MEDIA_BUCKET = "property-media";

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Builds the public URL for a stored image, or returns null when there is
 * nothing to show yet.
 */
export function propertyImageUrl(path: string | undefined): string | null {
  if (!path) {
    return null;
  }

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!projectUrl) {
    return null;
  }

  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  return `${stripTrailingSlash(projectUrl)}/storage/v1/object/public/${PROPERTY_MEDIA_BUCKET}/${encodedPath}`;
}
