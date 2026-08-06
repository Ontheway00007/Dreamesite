import type { Metadata, Viewport } from "next";

import { Cormorant_Garamond, Inter } from "next/font/google";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteNotice } from "@/components/layout/site-notice";
import { ScrollProgress } from "@/components/motion/scroll-progress";
import { JsonLd } from "@/components/seo/json-ld";
import { organisationSchema } from "@/lib/seo/structured-data";
import { env } from "@/lib/env";
import { getPublicSettings } from "@/lib/settings/public-settings";
import { siteConfig } from "@/lib/site-config";
import { AppProviders } from "@/providers/app-providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Only the two weights the type scale actually uses are downloaded.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400"],
  display: "swap",
  variable: "--font-cormorant",
});

/**
 * Site-wide metadata.
 *
 * Generated rather than static so the defaults an administrator sets in Settings
 * are used. The chain matches the per-property one: the stored default first,
 * then the values in the codebase. Property pages override all of this from
 * their own `generateMetadata`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();

  const title =
    settings.defaultMetaTitle ??
    `${settings.companyName} — ${siteConfig.tagline}`;
  const description = settings.defaultMetaDescription ?? siteConfig.description;

  return {
    metadataBase: new URL(env.siteUrl),
    title: {
      default: title,
      template: `%s — ${settings.companyName}`,
    },
    description,
    openGraph: {
      type: "website",
      locale: "en_AU",
      url: env.siteUrl,
      siteName: settings.companyName,
      title,
      description,
      ...(settings.defaultOgImageUrl
        ? { images: [{ url: settings.defaultOgImageUrl }] }
        : {}),
    },
    // Kept in step with Open Graph above. Property pages set their own, built
    // from the same resolved values, so the two never disagree. No handle is
    // configured, so none is claimed.
    twitter: {
      card: settings.defaultOgImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(settings.defaultOgImageUrl
        ? { images: [settings.defaultOgImageUrl] }
        : {}),
    },
    alternates: { canonical: "/" },
    // Preview and local builds are never indexed.
    robots: env.isIndexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#050506",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // One read for the whole tree: `getPublicSettings` is request-cached, so the
  // notice, the header and the footer share it.
  const settings = await getPublicSettings();

  return (
    <html lang="en-AU" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="grain min-h-dvh antialiased">
        {/*
          The business, once, on every page. Search engines resolve the `@id`
          reference each property page makes to it, so a property does not have
          to repeat the company details.
        */}
        <JsonLd
          data={organisationSchema({
            companyName: settings.companyName,
            contactEmail: settings.contactEmail,
            contactPhone: settings.contactPhone,
            addressDisplay: settings.addressDisplay,
            social: settings.social,
          })}
        />
        <AppProviders>
          {/* Cinematic scroll progress indicator */}
          <ScrollProgress />
          
          <a
            href="#main"
            className="bg-foreground text-foreground-inverse sr-only rounded-full px-4 py-2 text-sm focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100"
          >
            Skip to content
          </a>
          {/* Above the header, so a closure notice is the first thing read. */}
          <SiteNotice />
          <SiteHeader companyName={settings.companyName} />
          <main id="main">{children}</main>
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
