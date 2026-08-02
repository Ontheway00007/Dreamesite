import type { NavLink } from "@/types";

/**
 * Single source of truth for business facts shown on the site. Nothing in a
 * component should hard-code a suburb, an email address or a claim.
 */
export const siteConfig = {
  name: "Dreame",
  legalName: "Dreame Homes",
  tagline: "Considered homes across northern Melbourne",
  description:
    "Dreame is a residential building company building homes in Mickleham, Craigieburn and Donnybrook, in Melbourne's northern growth corridor.",
  locale: "en-AU",
  region: "Northern Melbourne, Victoria",
  /**
   * PLACEHOLDER contact details — these are the only contact points shown to
   * visitors, so both must be confirmed by the business before launch.
   */
  contact: {
    email: "hello@dreamehomes.com.au",
    phone: "+61 3 9000 0000",
  },
} as const;

export const primaryNav: readonly NavLink[] = [
  { label: "Homes", href: "/#homes" },
  { label: "Process", href: "/#process" },
  { label: "Locations", href: "/#locations" },
  { label: "Contact", href: "/#contact" },
] as const;

/**
 * Confirmed core build areas. Add a suburb only when the business supplies it —
 * this list is published as fact and is also used to derive the service area
 * count shown on the homepage.
 */
export const serviceAreas: readonly string[] = [
  "Mickleham",
  "Craigieburn",
  "Donnybrook",
] as const;
