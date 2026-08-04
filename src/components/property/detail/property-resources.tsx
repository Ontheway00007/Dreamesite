import { Download, ExternalLink } from "lucide-react";

import { LazyEmbed } from "@/components/property/detail/lazy-embed";
import { Text } from "@/components/ui/typography";
import { isSafeExternalUrl, resolveEmbed } from "@/lib/media/embeds";
import {
  droneVideo,
  propertyDocuments,
  virtualTour,
} from "@/lib/properties/media";
import type { Property } from "@/types";

export interface PropertyResourcesProps {
  property: Property;
}

/** Best guess at a file type from the URL, for labelling a download. */
function fileKindFrom(url: string | null): string | null {
  if (!url) return null;

  const match = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(url);

  if (!match) return null;

  const extension = match[1].toUpperCase();

  // Only extensions worth announcing. An unrecognised one is not guessed at.
  return ["PDF", "JPG", "JPEG", "PNG", "DWG", "ZIP", "DOC", "DOCX"].includes(
    extension,
  )
    ? extension
    : null;
}

/**
 * Tour, footage and downloads.
 *
 * Returns null when a property has none of them, so the page never shows an
 * empty shelf or a "coming soon" placeholder.
 *
 * ## Embeds versus links
 *
 * A YouTube or Vimeo URL becomes a player that loads on click. Anything else —
 * Matterport, Kuula, a builder's own viewer — becomes a link, because embedding
 * a provider means constructing its embed URL from parts we recognise, and we
 * only know how to do that for two. A link is not a degraded outcome; it is the
 * correct presentation for a provider whose framing behaviour we cannot vouch
 * for.
 *
 * Every `href` here passes `isSafeExternalUrl` first. The stored URL is
 * administrator input, and an `href` is the one place a `javascript:` scheme
 * would still execute.
 */
export function PropertyResources({ property }: PropertyResourcesProps) {
  const tour = virtualTour(property);
  const drone = droneVideo(property);
  const documents = propertyDocuments(property);

  const tourHref = isSafeExternalUrl(tour?.url) ? (tour?.url ?? null) : null;
  const droneHref = isSafeExternalUrl(drone?.url) ? (drone?.url ?? null) : null;

  const tourEmbed = resolveEmbed(tourHref);
  const droneEmbed = resolveEmbed(droneHref);

  const safeDocuments = documents.filter((document) =>
    isSafeExternalUrl(document.url),
  );

  if (!tourHref && !droneHref && safeDocuments.length === 0) {
    return null;
  }

  const embeds = [
    tourEmbed
      ? { key: "tour", embed: tourEmbed, title: "Virtual tour", caption: tour?.caption }
      : null,
    droneEmbed
      ? { key: "drone", embed: droneEmbed, title: "Drone footage", caption: drone?.caption }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  // Only the resources that could not be embedded need a link card.
  const links = [
    tourHref && !tourEmbed
      ? {
          key: "tour",
          href: tourHref,
          label: "Virtual tour",
          detail: tour?.caption ?? "Walk through this home from anywhere.",
        }
      : null,
    droneHref && !droneEmbed
      ? {
          key: "drone",
          href: droneHref,
          label: "Drone footage",
          detail: drone?.caption ?? "See the home and its street from above.",
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return (
    <div className="space-y-8">
      {embeds.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {embeds.map((entry) => (
            <LazyEmbed
              key={entry.key}
              embed={entry.embed}
              title={entry.title}
              caption={entry.caption}
            />
          ))}
        </div>
      )}

      {(links.length > 0 || safeDocuments.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <a
              key={link.key}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group border-border bg-surface hover:border-accent rounded-xl border p-6 transition-colors duration-(--duration-base)"
            >
              <ExternalLink size={18} className="text-accent" aria-hidden />
              <p className="font-display mt-5 text-lg font-normal">
                {link.label}
              </p>
              <Text size="small" className="mt-2">
                {link.detail}
              </Text>
              <span className="sr-only">Opens in a new tab</span>
            </a>
          ))}

          {safeDocuments.map((document) => {
            const kind = fileKindFrom(document.url);

            return (
              <a
                key={document.id}
                href={document.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="group border-border bg-surface hover:border-accent rounded-xl border p-6 transition-colors duration-(--duration-base)"
              >
                <Download size={18} className="text-accent" aria-hidden />
                <p className="font-display mt-5 text-lg font-normal">
                  {document.label}
                </p>
                <Text size="small" className="mt-2">
                  {/* The file type is stated in text, not left to an icon, and
                      the size follows it when known. */}
                  {[kind, document.fileSizeLabel].filter(Boolean).join(" · ") ||
                    "Download"}
                </Text>
                <span className="sr-only">
                  {kind ? `${kind} file, ` : ""}opens in a new tab
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
