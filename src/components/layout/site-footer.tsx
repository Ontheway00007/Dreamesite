import Link from "next/link";

import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Text } from "@/components/ui/typography";
import { getPublicSettings, telHref } from "@/lib/settings/public-settings";
import { ENQUIRY_ANCHOR } from "@/lib/routes";
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
    <footer className="relative overflow-hidden bg-[#172017] py-16 text-[#f7f1e6] md:py-24">
      <div
        aria-hidden="true"
        className="absolute -right-24 -bottom-56 size-[34rem] rounded-full border border-[#f7f1e6]/10"
      />
      <div
        aria-hidden="true"
        className="absolute -right-8 -bottom-40 size-[24rem] rounded-full border border-[#ca4d31]/55"
      />

      <Container>
        <div className="grid gap-12 border-b border-[#f7f1e6]/15 pb-16 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-9">
            <p className="text-[0.68rem] font-semibold tracking-[0.2em] text-[#9db495] uppercase">
              A home starts with a conversation
            </p>
            <a
              href={ENQUIRY_ANCHOR}
              className="group mt-5 flex max-w-5xl items-end justify-between gap-6"
            >
              <span className="font-display text-[clamp(3.2rem,8vw,8.5rem)] leading-[0.82] tracking-[-0.045em] text-balance">
                Let&apos;s build something grounded.
              </span>
              <span className="mb-2 grid size-14 shrink-0 place-items-center rounded-full bg-[#ca4d31] text-white transition-transform duration-(--duration-base) ease-luxe motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:translate-x-1 lg:size-18">
                <ArrowUpRight aria-hidden className="size-6 lg:size-8" />
              </span>
            </a>
          </div>
        </div>

        <div className="grid gap-12 py-14 md:grid-cols-[1.35fr_0.8fr_1fr]">
          <div className="max-w-md space-y-5">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase">
              {settings.companyName}
            </p>
            <Text size="small" className="!text-[#f7f1e6]/62">
              {siteConfig.description}
            </Text>

          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-4 pt-2">
              {socials.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm text-[#f7f1e6]/62 transition-colors duration-(--duration-fast) hover:text-[#f7f1e6]"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          </div>

          <nav aria-label="Footer" className="space-y-4">
          <p className="text-[0.62rem] font-semibold tracking-[0.2em] text-[#9db495] uppercase">
            Explore
          </p>
          <ul className="space-y-3">
            {primaryNav.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-[#f7f1e6]/66 transition-colors duration-(--duration-fast) hover:text-[#f7f1e6]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          </nav>

          <div className="space-y-4">
          <p className="text-[0.62rem] font-semibold tracking-[0.2em] text-[#9db495] uppercase">
            Contact
          </p>
          <ul className="space-y-3 text-sm">
            <li>
              <a
                href={`mailto:${settings.contactEmail}`}
                className="inline-flex items-center gap-2 text-[#f7f1e6]/66 transition-colors duration-(--duration-fast) hover:text-[#f7f1e6]"
              >
                <Mail size={15} aria-hidden />
                {settings.contactEmail}
              </a>
            </li>
            <li>
              <a
                href={telHref(settings.contactPhone)}
                className="inline-flex items-center gap-2 text-[#f7f1e6]/66 transition-colors duration-(--duration-fast) hover:text-[#f7f1e6]"
              >
                <Phone size={15} aria-hidden />
                {settings.contactPhone}
              </a>
            </li>
            <li className="inline-flex items-start gap-2 text-[#f7f1e6]/45">
              <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden />
              {/* The published address when there is one, the region otherwise. */}
              {settings.addressDisplay ?? siteConfig.region}
            </li>
          </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#f7f1e6]/15 pt-7 text-[0.66rem] tracking-[0.12em] text-[#f7f1e6]/42 uppercase">
          <p>&copy; {year} {siteConfig.legalName}</p>
          <p>{siteConfig.region}</p>
        </div>
      </Container>
    </footer>
  );
}
