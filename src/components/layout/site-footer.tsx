import Link from "next/link";

import { Mail, MapPin, Phone } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Text } from "@/components/ui/typography";
import { getPublicSettings, telHref } from "@/lib/settings/public-settings";
import { primaryNav, siteConfig } from "@/lib/site-config";

/**
 * Site footer.
 *
 * Contact details come from the settings row when the business has set them,
 * and from `siteConfig` when it has not. The legal name, description and region
 * stay in the codebase: they are not values that should change without review.
 *
 * Social links appear only for the profiles that are filled in — an icon
 * linking nowhere is worse than no icon.
 */
export async function SiteFooter() {
  const year = new Date().getFullYear();
  const settings = await getPublicSettings();

  const socials = [
    { label: "Facebook", href: settings.social.facebook },
    { label: "Instagram", href: settings.social.instagram },
    { label: "LinkedIn", href: settings.social.linkedin },
  ].filter((social): social is { label: string; href: string } =>
    Boolean(social.href),
  );

  return (
    <footer className="hairline-top bg-background-alt py-16 md:py-20">
      <Container className="grid gap-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="max-w-sm space-y-4">
          <p className="font-display tracking-wordmark text-2xl font-light uppercase">
            {settings.companyName}
          </p>
          <Text size="small">{siteConfig.description}</Text>

          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-4 pt-2">
              {socials.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-foreground-muted hover:text-foreground text-sm transition-colors duration-(--duration-fast)"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav aria-label="Footer" className="space-y-3">
          <p className="text-eyebrow text-foreground-subtle font-medium uppercase">
            Explore
          </p>
          <ul className="space-y-2">
            {primaryNav.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-foreground-muted hover:text-foreground text-sm transition-colors duration-(--duration-fast)"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3">
          <p className="text-eyebrow text-foreground-subtle font-medium uppercase">
            Contact
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href={`mailto:${settings.contactEmail}`}
                className="text-foreground-muted hover:text-foreground inline-flex items-center gap-2 transition-colors duration-(--duration-fast)"
              >
                <Mail size={15} aria-hidden />
                {settings.contactEmail}
              </a>
            </li>
            <li>
              <a
                href={telHref(settings.contactPhone)}
                className="text-foreground-muted hover:text-foreground inline-flex items-center gap-2 transition-colors duration-(--duration-fast)"
              >
                <Phone size={15} aria-hidden />
                {settings.contactPhone}
              </a>
            </li>
            <li className="text-foreground-subtle inline-flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden />
              {/* The published address when there is one, the region otherwise. */}
              {settings.addressDisplay ?? siteConfig.region}
            </li>
          </ul>
        </div>
      </Container>

      <Container className="mt-14">
        <Text size="small" tone="subtle">
          &copy; {year} {siteConfig.legalName}. {siteConfig.region}.
        </Text>
      </Container>
    </footer>
  );
}
