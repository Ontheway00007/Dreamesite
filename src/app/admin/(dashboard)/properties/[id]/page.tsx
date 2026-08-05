import { notFound } from "next/navigation";
import Link from "next/link";

import { getAdminPropertyById, getPublishBlockers } from "@/lib/admin/repository";
import { getPropertyMedia } from "@/lib/admin/media-repository";
import { getPropertyContent } from "@/lib/admin/content-repository";
import { PropertyEditor } from "@/components/admin/property-editor";

export const metadata = { title: "Edit property" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPropertyPage({ params }: Props) {
  const { id } = await params;

  // Four independent reads, issued together so the page waits one round trip
  // rather than four. Media and content are fetched separately from the
  // property so neither response carries location data, and vice versa.
  const [detail, publishBlockers, media, content] = await Promise.all([
    getAdminPropertyById(id),
    getPublishBlockers(id),
    getPropertyMedia(id),
    getPropertyContent(id),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link
            href="/admin/properties"
            className="text-foreground-subtle hover:text-foreground-muted text-sm transition-colors"
          >
            ← All properties
          </Link>
          <h1 className="text-heading-2 font-display text-foreground mt-1">
            {detail.property.name}
          </h1>
        </div>

        {detail.property.is_published ? (
          <Link
            href={`/properties/${detail.property.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:text-accent-strong text-sm font-medium transition-colors"
          >
            View on site ↗
          </Link>
        ) : (
          <span className="text-foreground-subtle rounded-full bg-zinc-500/20 px-2.5 py-1 text-xs font-medium">
            Draft
          </span>
        )}
      </div>

      <PropertyEditor
        mode="edit"
        propertyId={id}
        initialData={detail.property}
        privateLocation={detail.privateLocation}
        locationSettings={detail.locationSettings}
        projectionStaleSince={detail.projectionStaleSince}
        publishBlockers={publishBlockers}
        media={media}
        content={content}
      />
    </div>
  );
}
