import type { Property, PublicPropertyLocation } from "@/types";

/**
 * The three cases the animated marker prototype has to prove, as published
 * properties.
 *
 * ## Why these are defined here and not in `content/properties.ts`
 *
 * They are not properties. They are a test bench: three sets of construction data
 * chosen so that the marker's stopping point is unambiguous, sitting close enough
 * together to be photographed in one frame. Putting them in the fixture file would
 * put them on the homepage and in the sitemap.
 *
 * ## Why the stage is never stated directly
 *
 * Each record carries only real construction data — a status and, where the home
 * is being built, a diary. Which stage the marker stops at is worked out by
 * `resolveBuildStage`, exactly as it is for a real property. If this file said
 * "stop at frame" the prototype would be proving that a hardcoded value can be
 * drawn, which is not the question.
 */

function locationAt(latitude: number, longitude: number): PublicPropertyLocation {
  return {
    visibility: "exact",
    publicLatitude: latitude,
    publicLongitude: longitude,
    markerMode: "automatic",
    address: null,
    allowDirections: false,
    label: null,
    accuracyNote: null,
  };
}

/**
 * Case 1 — a finished home.
 *
 * `completed` is one of the statuses whose build work is over, so the resolver
 * answers `complete` from the status alone. Expected loop: empty lot, slab, frame,
 * lock-up, completed house, hold, reset, repeat.
 */
const completed: Property = {
  id: "proto-completed",
  slug: "prototype-completed",
  name: "Reference home",
  summary: "Single level, finished and handed over.",
  suburb: "Craigieburn",
  state: "VIC",
  status: "completed",
  bedrooms: 4,
  bathrooms: 2,
  carSpaces: 2,
  landSize: 448,
  placeholderVariant: "single-storey",
  isFeatured: false,
  location: locationAt(-37.5768, 144.9385),
};

/**
 * Case 2 — a home standing as a frame.
 *
 * The diary records the slab as finished and the frame as under way. Because an
 * entry is `in-progress`, the diary describes the present and the resolver stops
 * at `frame`. Expected loop: empty lot, slab, frame, hold, reset, repeat — and
 * never a roof.
 */
const atFrame: Property = {
  id: "proto-frame",
  slug: "prototype-frame",
  name: "Two storey in frame",
  summary: "Two storey, structure standing, roof trusses set.",
  suburb: "Craigieburn",
  state: "VIC",
  status: "under-construction",
  bedrooms: 4,
  bathrooms: 3,
  carSpaces: 2,
  landSize: 512,
  placeholderVariant: "double-storey",
  isFeatured: false,
  location: locationAt(-37.5822, 144.9481),
  constructionUpdates: [
    {
      id: "proto-frame-1",
      stage: "site-preparation",
      title: "Site cleared and set out",
      status: "complete",
    },
    {
      id: "proto-frame-2",
      stage: "slab",
      title: "Slab poured",
      status: "complete",
    },
    {
      id: "proto-frame-3",
      stage: "frame",
      title: "Frame standing",
      status: "in-progress",
    },
    {
      id: "proto-frame-4",
      stage: "lock-up",
      title: "Lock-up",
      // Planned, so it describes the future. The marker must not draw it.
      status: "planned",
    },
  ],
};

/**
 * Case 3 — a home at slab.
 *
 * The slab is the only work under way. Expected loop: empty lot, slab, hold,
 * reset, repeat — no frame, no roof.
 */
const atSlab: Property = {
  id: "proto-slab",
  slug: "prototype-slab",
  name: "Townhouse at slab",
  summary: "Compact footprint, slab down.",
  suburb: "Craigieburn",
  state: "VIC",
  status: "under-construction",
  bedrooms: 3,
  bathrooms: 2,
  carSpaces: 1,
  landSize: 262,
  placeholderVariant: "townhouse",
  isFeatured: false,
  location: locationAt(-37.5731, 144.9556),
  constructionUpdates: [
    {
      id: "proto-slab-1",
      stage: "site-preparation",
      title: "Site cleared and set out",
      status: "complete",
    },
    {
      id: "proto-slab-2",
      stage: "slab",
      title: "Slab pour under way",
      status: "in-progress",
    },
    {
      id: "proto-slab-3",
      stage: "frame",
      title: "Frame",
      status: "planned",
    },
  ],
};

export const prototypeProperties: readonly Property[] = [
  completed,
  atFrame,
  atSlab,
];

/** What each case is testing, for the review panel beside the map. */
export const prototypeCases: readonly {
  readonly id: string;
  readonly heading: string;
  readonly data: string;
  readonly expected: string;
}[] = [
  {
    id: "proto-completed",
    heading: "Completed",
    data: "Status: completed. No build diary.",
    expected:
      "Empty lot, slab, frame, lock-up, finished house. Holds, resets, repeats.",
  },
  {
    id: "proto-frame",
    heading: "Stopped at frame",
    data: "Status: under construction. Diary: slab complete, frame in progress, lock-up planned.",
    expected:
      "Empty lot, slab, frame, then holds. Never shows lock-up or a finished house.",
  },
  {
    id: "proto-slab",
    heading: "Stopped at slab",
    data: "Status: under construction. Diary: slab in progress, frame planned.",
    expected: "Empty lot, slab, then holds. Never shows a frame.",
  },
];
