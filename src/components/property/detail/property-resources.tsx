import { Download, Play, Video } from "lucide-react";

import { Text } from "@/components/ui/typography";
import {
  droneVideo,
  propertyDocuments,
  virtualTour,
} from "@/lib/properties/media";
import type { Property } from "@/types";

export interface PropertyResourcesProps {
  property: Property;
}

/**
 * Tour, footage and downloads.
 *
 * Returns null when a property has none of them, so the page never shows an
 * empty shelf or a "coming soon" placeholder. Adding a tour, a drone video, a
 * brochure or a floor plan to a property record is enough to make this section
 * appear — no code change, no new section type.
 */
export function PropertyResources({ property }: PropertyResourcesProps) {
  const tour = virtualTour(property);
  const drone = droneVideo(property);
  const documents = propertyDocuments(property);

  const tourHref = tour?.externalUrl ?? tour?.url ?? null;
  const droneHref = drone?.externalUrl ?? drone?.url ?? null;

  if (!tourHref && !droneHref && documents.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tourHref ? (
        <a
          href={tourHref}
          target="_blank"
          rel="noopener noreferrer"
          className="group border-border bg-surface hover:border-accent rounded-xl border p-6 transition-colors duration-(--duration-base)"
        >
          <Play size={18} className="text-accent" aria-hidden />
          <p className="font-display mt-5 text-lg font-normal">Virtual tour</p>
          <Text size="small" className="mt-2">
            {tour?.caption ?? "Walk through this home from anywhere."}
          </Text>
        </a>
      ) : null}

      {droneHref ? (
        <a
          href={droneHref}
          target="_blank"
          rel="noopener noreferrer"
          className="group border-border bg-surface hover:border-accent rounded-xl border p-6 transition-colors duration-(--duration-base)"
        >
          <Video size={18} className="text-accent" aria-hidden />
          <p className="font-display mt-5 text-lg font-normal">Drone footage</p>
          <Text size="small" className="mt-2">
            {drone?.caption ?? "See the home and its street from above."}
          </Text>
        </a>
      ) : null}

      {documents.map((document) => (
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
            {document.fileSizeLabel ?? "Download"}
          </Text>
        </a>
      ))}
    </div>
  );
}
