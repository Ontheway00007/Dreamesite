import type { Metadata, Viewport } from "next";

import { Instrument_Serif, Manrope } from "next/font/google";
import Script from "next/script";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteNotice } from "@/components/layout/site-notice";
import { JsonLd } from "@/components/seo/json-ld";
import { organisationSchema } from "@/lib/seo/structured-data";
import { env } from "@/lib/env";
import { getPublicSettings } from "@/lib/settings/public-settings";
import { siteConfig } from "@/lib/site-config";
import {
  ADMIN_SITE_THEME,
  DEFAULT_SITE_THEME,
  THEME_STORAGE_KEY,
  themeColor,
} from "@/lib/theme";
import { AppProviders } from "@/providers/app-providers";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument",
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
  colorScheme: "dark light",
  themeColor: themeColor[DEFAULT_SITE_THEME],
};

const themeBootstrap = `(function(){try{var t=location.pathname.indexOf('/admin')===0?${JSON.stringify(ADMIN_SITE_THEME)}:localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark")t=${JSON.stringify(DEFAULT_SITE_THEME)};var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?${JSON.stringify(themeColor.light)}:${JSON.stringify(themeColor.dark)})}catch(e){}})()`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // One read for the whole tree: `getPublicSettings` is request-cached, so the
  // notice, the header and the footer share it.
  const settings = await getPublicSettings();

  return (
    <html
      lang="en-AU"
      data-theme={DEFAULT_SITE_THEME}
      suppressHydrationWarning
      className={`${manrope.variable} ${instrument.variable}`}
    >
      <body className="grain min-h-dvh antialiased">
        <Script id="dreame-theme" strategy="beforeInteractive">
          {themeBootstrap}
        </Script>
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
