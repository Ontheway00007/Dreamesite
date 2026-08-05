/**
 * Media resolution for property assets.
 *
 * Photography, videos, brochures and floor plans all live in one public Supabase
 * Storage bucket. A property record stores only the path inside that bucket, so
 * nothing in the UI has to know where files are hosted, and swapping the host is
 * a change to this module alone.
 */

/** Public Supabase Storage bucket that holds property media. */
export const PROPERTY_MEDIA_BUCKET = "property-media";

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Builds the public URL for a stored asset, or returns null when there is
 * nothing to link to yet — either the property has no asset, or Supabase is not
 * configured.
 */
export function propertyMediaUrl(path: string | undefined): string | null {
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
