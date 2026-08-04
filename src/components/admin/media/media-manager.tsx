"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { clearHeroImage } from "@/lib/admin/actions/media-actions";
import type {
  AdminMediaItem,
  AdminResourceItem,
} from "@/lib/admin/media-repository";
import {
  RECOMMENDED_HERO_WIDTH,
  type ImageType,
  type ResourceType,
} from "@/lib/media/config";
import { AdminAlert } from "@/components/admin/admin-alert";
import { MediaItemCard } from "@/components/admin/media/media-item-card";
import { MediaUploadForm } from "@/components/admin/media/media-upload-form";

/**
 * The property media manager.
 *
 * Organised by where the media appears on the public site rather than by how
 * it is stored, because that is the question an administrator is answering:
 * "what will the card show?", not "which table is this in?".
 *
 * Each section is independent. Uploading a gallery photograph does not touch
 * the floor plans, and nothing here is a single form that saves everything at
 * once — an accidental save should not be able to rewrite media the
 * administrator was not looking at.
 */

interface Props {
  readonly propertyId: string;
  readonly images: readonly AdminMediaItem[];
  readonly resources: readonly AdminResourceItem[];
  readonly failed: boolean;
}

interface ImageSection {
  readonly imageType: ImageType;
  readonly heading: string;
  readonly description: string;
}

/** Sections in the order they appear on the public property page. */
const IMAGE_SECTIONS: readonly ImageSection[] = [
  {
    imageType: "gallery",
    heading: "Gallery",
    description:
      "Photography shown in the property showcase, in the order set here.",
  },
  {
    imageType: "facade",
    heading: "Façade",
    description: "Street-facing photography.",
  },
  {
    imageType: "construction",
    heading: "Construction",
    description: "Progress photography from the build.",
  },
  {
    imageType: "drone",
    heading: "Drone photography",
    description: "Aerial stills. Drone video belongs under Tours and video.",
  },
  {
    imageType: "floor_plan",
    heading: "Floor plan images",
    description:
      "Shown separately from the photography, so a diagram never appears among the photographs.",
  },
];

const DOCUMENT_SECTIONS: ReadonlyArray<{
  resourceType: ResourceType;
  heading: string;
  description: string;
}> = [
  {
    resourceType: "floor-plan",
    heading: "Floor plan documents",
    description: "PDF floor plans offered as downloads.",
  },
  {
    resourceType: "brochure",
    heading: "Brochures",
    description: "PDF brochures offered as downloads.",
  },
  {
    resourceType: "document",
    heading: "Other documents",
    description: "Specifications and other approved PDFs.",
  },
];

const LINK_SECTIONS: ReadonlyArray<{
  resourceType: ResourceType;
  heading: string;
  description: string;
}> = [
  {
    resourceType: "virtual-tour",
    heading: "Virtual tour",
    description: "A link to a walkthrough hosted elsewhere.",
  },
  {
    resourceType: "video",
    heading: "Video",
    description: "A link to video hosted on YouTube, Vimeo or similar.",
  },
  {
    resourceType: "drone-footage",
    heading: "Drone footage",
    description: "A link to aerial video.",
  },
];

export function MediaManager({
  propertyId,
  images,
  resources,
  failed,
}: Props) {
  const router = useRouter();
  const [heroError, setHeroError] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const hero = useMemo(
    () => images.find((image) => image.imageType === "hero") ?? null,
    [images],
  );

  const imagesByType = useMemo(() => {
    const grouped = new Map<ImageType, AdminMediaItem[]>();

    for (const image of images) {
      if (image.imageType === "hero") {
        continue;
      }

      const existing = grouped.get(image.imageType);

      if (existing) {
        existing.push(image);
      } else {
        grouped.set(image.imageType, [image]);
      }
    }

    return grouped;
  }, [images]);

  const resourcesByType = useMemo(() => {
    const grouped = new Map<ResourceType, AdminResourceItem[]>();

    for (const resource of resources) {
      const existing = grouped.get(resource.resourceType);

      if (existing) {
        existing.push(resource);
      } else {
        grouped.set(resource.resourceType, [resource]);
      }
    }

    return grouped;
  }, [resources]);

  if (failed) {
    return (
      <AdminAlert tone="error" title="Could not load this property's media">
        <p className="mt-1">
          The database did not respond. Reload the page to try again — the
          details are in the server logs.
        </p>
      </AdminAlert>
    );
  }

  async function handleClearHero() {
    if (
      !window.confirm(
        "Remove the main image? The property will show the architectural drawing on cards until another is chosen. The file itself is kept.",
      )
    ) {
      return;
    }

    const result = await clearHeroImage(propertyId);

    if (result.success) {
      setHeroError(null);
      refresh();
    } else {
      setHeroError(result.error ?? "Could not clear the main image.");
    }
  }

  return (
    <div className="space-y-10">
      {/* --- Hero ------------------------------------------------------- */}
      <section aria-labelledby="media-hero" className="space-y-3">
        <header>
          <h3
            id="media-hero"
            className="text-foreground text-sm font-semibold uppercase tracking-wider"
          >
            Main image
          </h3>
          <p className="text-foreground-subtle mt-1 text-xs">
            Used on cards, the map preview and social shares. Choose one with
            “Make main image” in any photography section below.
          </p>
        </header>

        {heroError && <AdminAlert tone="error" title={heroError} />}

        {hero ? (
          <>
            <ul className="space-y-3">
              <MediaItemCard
                kind="image"
                item={hero}
                propertyId={propertyId}
                siblingIds={[hero.id]}
                canBeHero={false}
                isHero
                onChanged={refresh}
              />
            </ul>

            {/* Advisory, not enforced: a narrow hero is visibly soft on a
                wide screen, but the administrator may have nothing better. */}
            {hero.width !== null && hero.width < RECOMMENDED_HERO_WIDTH && (
              <AdminAlert
                tone="warning"
                title={`This image is ${hero.width}px wide`}
              >
                <p className="mt-1">
                  The main image is displayed up to {RECOMMENDED_HERO_WIDTH}px
                  across, so this one may look soft. A larger file would render
                  more crisply.
                </p>
              </AdminAlert>
            )}

            <button
              type="button"
              onClick={() => void handleClearHero()}
              className="border-border text-foreground-muted hover:bg-surface-raised rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Remove as main image
            </button>
          </>
        ) : (
          <AdminAlert tone="info" title="No main image chosen">
            <p className="mt-1">
              Cards and social previews will show the architectural drawing.
              That is a valid presentation — a photograph is not required to
              publish.
            </p>
          </AdminAlert>
        )}
      </section>

      {/* --- Photography ------------------------------------------------ */}
      {IMAGE_SECTIONS.map((section) => {
        const items = imagesByType.get(section.imageType) ?? [];
        const siblingIds = items.map((item) => item.id);

        return (
          <MediaSection
            key={section.imageType}
            id={`media-${section.imageType}`}
            heading={section.heading}
            description={section.description}
            count={items.length}
          >
            {items.length > 0 && (
              <ul className="space-y-3">
                {items.map((item) => (
                  <MediaItemCard
                    key={item.id}
                    kind="image"
                    item={item}
                    propertyId={propertyId}
                    siblingIds={siblingIds}
                    // A floor plan makes a poor card image, so it is not
                    // offered as a hero candidate.
                    canBeHero={section.imageType !== "floor_plan"}
                    isHero={false}
                    onChanged={refresh}
                  />
                ))}
              </ul>
            )}

            <MediaUploadForm
              propertyId={propertyId}
              imageType={section.imageType}
              allowUpload
              allowLink
              onAdded={refresh}
            />
          </MediaSection>
        );
      })}

      {/* --- Documents -------------------------------------------------- */}
      {DOCUMENT_SECTIONS.map((section) => {
        const items = resourcesByType.get(section.resourceType) ?? [];
        const siblingIds = items.map((item) => item.id);

        return (
          <MediaSection
            key={section.resourceType}
            id={`media-${section.resourceType}`}
            heading={section.heading}
            description={section.description}
            count={items.length}
          >
            {items.length > 0 && (
              <ul className="space-y-3">
                {items.map((item) => (
                  <MediaItemCard
                    key={item.id}
                    kind="resource"
                    item={item}
                    propertyId={propertyId}
                    siblingIds={siblingIds}
                    onChanged={refresh}
                  />
                ))}
              </ul>
            )}

            <MediaUploadForm
              propertyId={propertyId}
              resourceType={section.resourceType}
              allowUpload
              allowLink={false}
              onAdded={refresh}
            />
          </MediaSection>
        );
      })}

      {/* --- Tours and video ------------------------------------------- */}
      <div className="space-y-6">
        <h3 className="text-foreground text-sm font-semibold uppercase tracking-wider">
          Tours and video
        </h3>

        {LINK_SECTIONS.map((section) => {
          const items = resourcesByType.get(section.resourceType) ?? [];
          const siblingIds = items.map((item) => item.id);

          return (
            <MediaSection
              key={section.resourceType}
              id={`media-${section.resourceType}`}
              heading={section.heading}
              description={section.description}
              count={items.length}
            >
              {items.length > 0 && (
                <ul className="space-y-3">
                  {items.map((item) => (
                    <MediaItemCard
                      key={item.id}
                      kind="resource"
                      item={item}
                      propertyId={propertyId}
                      siblingIds={siblingIds}
                      onChanged={refresh}
                    />
                  ))}
                </ul>
              )}

              <MediaUploadForm
                propertyId={propertyId}
                resourceType={section.resourceType}
                allowUpload={false}
                allowLink
                onAdded={refresh}
              />
            </MediaSection>
          );
        })}
      </div>
    </div>
  );
}

function MediaSection({
  id,
  heading,
  description,
  count,
  children,
}: {
  id: string;
  heading: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <header>
        <h4
          id={id}
          className="text-foreground flex items-center gap-2 text-sm font-semibold"
        >
          {heading}
          <span className="text-foreground-subtle text-xs font-normal">
            {count === 0 ? "none yet" : count === 1 ? "1 item" : `${count} items`}
          </span>
        </h4>
        <p className="text-foreground-subtle mt-1 text-xs">{description}</p>
      </header>
      {children}
    </section>
  );
}
