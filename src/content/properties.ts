import { defaultPropertyPrivacy } from "@/lib/properties/privacy";
import type { PropertyRecord } from "@/types";

/**
 * DEMONSTRATION PROPERTY DATA — REPLACE BEFORE LAUNCH.
 *
 * These records exist so the map, filters and listing can be built and reviewed
 * before Supabase is connected. Every entry is fictional:
 *
 * - The names describe plan types, not homes that exist.
 * - No street names or house numbers are stored, because concept façades have no
 *   address. Postcodes are the real suburb postcodes.
 * - No price figures or completion dates are invented.
 * - Coordinates are general points inside the three confirmed suburbs, chosen
 *   near arterial roads and undeveloped land so that no position corresponds to
 *   a real private residence. Replace them with surveyed positions, and review
 *   every `privacy` block, before this data goes public.
 *
 * Privacy is per property and independent of status: the spread of settings
 * below is deliberate, and includes a sold home shown exactly and a completed
 * home hidden entirely, to prove that status never drives visibility. For real
 * homes those choices belong to whoever has the owner's permission.
 *
 * Only the three confirmed build areas appear: Mickleham, Craigieburn and
 * Donnybrook. Adding a suburb here adds it to the filters automatically, and it
 * needs a matching entry in `content/suburb-references.ts`.
 */
export const propertyRecords: readonly PropertyRecord[] = [
  {
    id: "concept-single-storey",
    slug: "single-storey-concept",
    name: "Single storey concept",
    summary:
      "Single level, north-facing living, courtyard to the rear boundary.",
    suburb: "Mickleham",
    state: "VIC",
    status: "move-in-ready",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 448,
    houseSize: 212,
    placeholderVariant: "single-storey",
    priceDisplay: "Price on application",
    isFeatured: true,
    privateLatitude: -37.5312,
    privateLongitude: 144.8861,
    address: { postcode: "3064" },
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "exact",
      allowDirections: true,
    },
  },
  {
    id: "concept-double-storey",
    slug: "two-storey-concept",
    name: "Two storey concept",
    summary:
      "Two storey, upper level retreat, double garage under the main roofline.",
    suburb: "Craigieburn",
    state: "VIC",
    status: "under-construction",
    bedrooms: 4,
    bathrooms: 3,
    carSpaces: 2,
    landSize: 512,
    houseSize: 268,
    placeholderVariant: "double-storey",
    completionLabel: "Completion window to be confirmed",
    priceDisplay: "Price on application",
    isFeatured: true,
    privateLatitude: -37.5974,
    privateLongitude: 144.9412,
    address: { postcode: "3064" },
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "approximate",
      privacyRadiusMeters: 500,
      allowDirections: true,
    },
  },
  {
    id: "concept-townhouse",
    slug: "townhouse-concept",
    name: "Townhouse concept",
    summary: "Compact footprint, shared party wall, private upper terrace.",
    suburb: "Donnybrook",
    state: "VIC",
    status: "completed",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 1,
    landSize: 262,
    houseSize: 168,
    placeholderVariant: "townhouse",
    isFeatured: true,
    privateLatitude: -37.5071,
    privateLongitude: 144.9536,
    address: { postcode: "3064" },
    // A completed home hidden entirely: status did not decide this.
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "hidden",
    },
  },
  {
    id: "concept-wide-frontage",
    slug: "wide-frontage-concept",
    name: "Wide frontage concept",
    summary:
      "Single level across a wide lot, separate living and dining, double garage.",
    suburb: "Mickleham",
    state: "VIC",
    status: "move-in-ready",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 512,
    houseSize: 231,
    placeholderVariant: "single-storey",
    priceDisplay: "Price on application",
    isFeatured: false,
    privateLatitude: -37.5389,
    privateLongitude: 144.8924,
    address: { postcode: "3064" },
    // Available, but published at suburb level only.
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "suburb",
    },
  },
  {
    id: "concept-courtyard",
    slug: "courtyard-concept",
    name: "Courtyard concept",
    summary:
      "Three bedrooms wrapped around a sheltered courtyard, single garage.",
    suburb: "Craigieburn",
    state: "VIC",
    status: "move-in-ready",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 1,
    landSize: 336,
    houseSize: 164,
    placeholderVariant: "townhouse",
    priceDisplay: "Price on application",
    isFeatured: false,
    privateLatitude: -37.6042,
    privateLongitude: 144.9331,
    address: { postcode: "3064" },
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "approximate",
      privacyRadiusMeters: 250,
      allowDirections: true,
    },
  },
  {
    id: "concept-corner-block",
    slug: "corner-block-concept",
    name: "Corner block concept",
    summary:
      "Two storey on a corner lot, dual street presentation, upper level living.",
    suburb: "Donnybrook",
    state: "VIC",
    status: "under-construction",
    bedrooms: 5,
    bathrooms: 3,
    carSpaces: 2,
    landSize: 604,
    houseSize: 302,
    placeholderVariant: "double-storey",
    completionLabel: "Completion window to be confirmed",
    priceDisplay: "Price on application",
    isFeatured: false,
    privateLatitude: -37.5008,
    privateLongitude: 144.9601,
    address: { postcode: "3064" },
    // Marker positioned by hand, for example at an estate entrance. The stored
    // position above is untouched.
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "approximate",
      privacyRadiusMeters: 1000,
      publicMarkerMode: "manual",
      manualLatitude: -37.4995,
      manualLongitude: 144.9563,
      allowDirections: true,
    },
  },
  {
    id: "concept-dual-living",
    slug: "dual-living-concept",
    name: "Dual living concept",
    summary:
      "Two storey with a ground floor guest suite and separate second living area.",
    suburb: "Craigieburn",
    state: "VIC",
    status: "under-construction",
    bedrooms: 5,
    bathrooms: 3,
    carSpaces: 2,
    landSize: 578,
    houseSize: 288,
    placeholderVariant: "double-storey",
    completionLabel: "Completion window to be confirmed",
    isFeatured: false,
    privateLatitude: -37.5906,
    privateLongitude: 144.9487,
    address: { postcode: "3064" },
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "approximate",
      privacyRadiusMeters: 1000,
    },
  },
  {
    id: "concept-rear-terrace",
    slug: "rear-terrace-concept",
    name: "Rear terrace concept",
    summary: "Townhouse plan with a north-facing rear terrace and study nook.",
    suburb: "Mickleham",
    state: "VIC",
    status: "sold",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 1,
    landSize: 248,
    houseSize: 158,
    placeholderVariant: "townhouse",
    isFeatured: false,
    privateLatitude: -37.5265,
    privateLongitude: 144.8802,
    address: { postcode: "3064" },
    // Sold and still shown exactly: only ever appropriate as a display home or
    // with the owner's written permission.
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "exact",
      allowDirections: false,
    },
  },
  {
    id: "concept-compact-single",
    slug: "compact-single-storey-concept",
    name: "Compact single storey concept",
    summary:
      "Three bedrooms on a compact lot, open plan living, single garage.",
    suburb: "Donnybrook",
    state: "VIC",
    status: "sold",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 1,
    landSize: 294,
    houseSize: 152,
    placeholderVariant: "single-storey",
    isFeatured: false,
    privateLatitude: -37.5124,
    privateLongitude: 144.9498,
    address: { postcode: "3064" },
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "hidden",
      addressVisibility: {
        houseNumber: false,
        street: false,
        suburb: true,
        postcode: false,
      },
    },
  },
  {
    id: "concept-garden-outlook",
    slug: "garden-outlook-concept",
    name: "Garden outlook concept",
    summary:
      "Single level with living opening to a landscaped garden, double garage.",
    suburb: "Craigieburn",
    state: "VIC",
    status: "completed",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 465,
    houseSize: 224,
    placeholderVariant: "single-storey",
    isFeatured: false,
    privateLatitude: -37.6088,
    privateLongitude: 144.9452,
    address: { postcode: "3064" },
    privacy: {
      ...defaultPropertyPrivacy,
      locationVisibility: "suburb",
    },
  },
] as const;
