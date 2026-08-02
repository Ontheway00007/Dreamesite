import type { NavLink } from "@/types";

export const siteConfig = {
  name: "Dreame",
  legalName: "Dreame Homes",
  tagline: "Considered homes across northern Melbourne",
  description:
    "Dreame is a residential building company crafting move-in ready, under construction and completed homes across northern Melbourne.",
  locale: "en-AU",
  region: "Northern Melbourne, Victoria, Australia",
  contact: {
    email: "hello@dreamehomes.com.au",
    phone: "+61 3 9000 0000",
  },
} as const;

export const primaryNav: readonly NavLink[] = [
  { label: "Homes", href: "/#homes" },
  { label: "Locations", href: "/#locations" },
  { label: "Approach", href: "/#approach" },
  { label: "Enquire", href: "/#enquire" },
] as const;

/**
 * Suburbs and growth corridors the company builds in. Used for content and,
 * later, for grouping properties on the map.
 */
export const serviceAreas: readonly string[] = [
  "Craigieburn",
  "Mickleham",
  "Kalkallo",
  "Donnybrook",
  "Wollert",
  "Epping",
  "Mernda",
  "Greenvale",
  "Roxburgh Park",
  "Beveridge",
] as const;
