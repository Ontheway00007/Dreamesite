import { env } from "@/lib/env";
import { propertyStatusTokens } from "@/lib/design/property-status";
import { heroImageUrl } from "@/lib/properties/media";
import { PROPERTIES_ROUTE, propertyHref } from "@/lib/routes";
import { resolvePropertyMetadata, type SiteMetadataDefaults } from "@/lib/seo/metadata";
import { serviceAreas, siteConfig } from "@/lib/site-config";
import type { Property } from "@/types";

/**
 * JSON-LD builders.
 *
 * ## The rule everything here follows
 *
 * **Every claim must be visible on the page it describes.** Structured data is
 * read by machines, which is exactly why it is tempting to put things in it that
 * are not on the page — a rating, a price, an availability date. That is
 * misrepresentation whether or not a human ever sees it, and search engines
 * treat it as spam.
 *
 * So, deliberately absent:
 *
 * - **No `aggregateRating` or `review`.** There are no reviews. A rating with no
 *   reviews behind it is the single most common structured-data abuse.
 * - **No `offers` or `price`.** `price_display` is free text — "From $780,000",
 *   "Contact agent" — and `offers` requires a number and a currency. Parsing a
 *   figure out of marketing copy to satisfy a schema would be inventing a
 *   commitment the business has not made.
 * - **No `datePosted` or `availabilityStarts`.** Nothing records them.
 * - **No `geo` coordinates.** This is a privacy decision, not a data gap: see
 *   `residenceSchema` below.
 * - **No `numberOfRooms` beyond bedrooms and bathrooms**, because "rooms" in
 *   schema.org includes spaces this data does not describe.
 *
 * ## Type choice
 *
 * `SingleFamilyResidence` rather than `Product` or `RealEstateListing`. These are
 * homes a builder is showing, and `Product` invites the price and rating fields
 * that must not be filled in. `Residence` describes the building itself, which
 * is what the page actually documents.
 */

/** JSON-LD is arbitrarily shaped, so this is the honest type for it. */
export type JsonLd = Record<string, unknown>;

/**
 * The building company.
 *
 * `areaServed` comes from `serviceAreas`, the same list the locations section
 * publishes, so the schema cannot claim a suburb the page does not.
 *
 * No `foundingDate`, `numberOfEmployees` or `award`: none is recorded anywhere,
 * and a builder's credibility markers are exactly the fields that must not be
 * guessed at.
 */
export function organisationSchema(contact: {
  readonly companyName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly addressDisplay?: string;
  readonly social: {
    readonly facebook?: string;
    readonly instagram?: string;
    readonly linkedin?: string;
  };
}): JsonLd {
  const sameAs = [
    contact.social.facebook,
    contact.social.instagram,
    contact.social.linkedin,
  ].filter((url): url is string => Boolean(url));

  return {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${env.siteUrl}/#organisation`,
    name: contact.companyName,
    legalName: siteConfig.legalName,
    description: siteConfig.description,
    url: env.siteUrl,
    email: contact.contactEmail,
    telephone: contact.contactPhone,
    areaServed: serviceAreas.map((suburb) => ({
      "@type": "Place",
      name: `${suburb}, Victoria, Australia`,
    })),
    ...(contact.addressDisplay
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: contact.addressDisplay,
            addressRegion: "VIC",
            addressCountry: "AU",
          },
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/**
 * One property.
 *
 * ## No coordinates, ever
 *
 * A `geo` block would be the obvious thing to add, and it is the one thing this
 * must not contain. The public projection deliberately blurs, relocates or omits
 * a home's position according to the privacy setting the administrator chose.
 * Publishing a coordinate in JSON-LD would republish that decision in a form
 * that is trivially scraped, and for a `hidden` property there is no coordinate
 * to publish at all.
 *
 * The suburb is included because the suburb is always public — the listing is
 * organised by it. That is the level of precision the site commits to, and the
 * schema matches it exactly.
 *
 * ## Only measurements that exist
 *
 * Land and floor area are emitted when recorded, with units. Every other field
 * is omitted rather than defaulted, because `0` in a schema means zero, not
 * unknown.
 */
export function residenceSchema(
  property: Property,
  siteDefaults: SiteMetadataDefaults = {},
): JsonLd {
  const resolved = resolvePropertyMetadata(property, siteDefaults);
  const url = `${env.siteUrl}${propertyHref(property.slug)}`;

  // The hero only. `imageUrl` may be the site-wide default banner, which
  // describes the business rather than this home — correct for a social card,
  // wrong for a schema that claims to depict the building.
  const image = heroImageUrl(property);

  return {
    "@context": "https://schema.org",
    "@type": "SingleFamilyResidence",
    "@id": `${url}#residence`,
    name: property.name,
    description: resolved.description,
    url,
    // Suburb-level only. See the note above.
    address: {
      "@type": "PostalAddress",
      addressLocality: property.suburb,
      addressRegion: property.state,
      addressCountry: "AU",
    },
    ...(image ? { image: [image] } : {}),
    ...(property.bedrooms > 0 ? { numberOfBedrooms: property.bedrooms } : {}),
    ...(property.bathrooms > 0
      ? { numberOfBathroomsTotal: property.bathrooms }
      : {}),
    ...(property.landSize
      ? {
          lotSize: {
            "@type": "QuantitativeValue",
            value: property.landSize,
            unitCode: "MTK", // square metres
          },
        }
      : {}),
    ...(property.houseSize
      ? {
          floorSize: {
            "@type": "QuantitativeValue",
            value: property.houseSize,
            unitCode: "MTK",
          },
        }
      : {}),
    // The status the page shows, in words, using the same label the badge uses.
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Build status",
        value: propertyStatusTokens[property.status].label,
      },
    ],
    // Attribution rather than a sales claim: this business built it.
    provider: { "@id": `${env.siteUrl}/#organisation` },
  };
}

/**
 * The trail a visitor actually sees.
 *
 * Home → Homes → this property, matching the page's own navigation. A breadcrumb
 * describing a hierarchy the site does not have is a claim about structure, and
 * search engines render it verbatim beneath the result.
 */
export function breadcrumbSchema(property: Property): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: env.siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Homes",
        item: `${env.siteUrl}${PROPERTIES_ROUTE}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: property.name,
        item: `${env.siteUrl}${propertyHref(property.slug)}`,
      },
    ],
  };
}

/**
 * Serialises JSON-LD for a `<script>` tag.
 *
 * `<` is escaped so a stray `</script>` inside any string — a property
 * description is administrator input — cannot close the tag early and turn the
 * rest of the payload into markup. `JSON.stringify` alone does not do this.
 */
export function serialiseJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
