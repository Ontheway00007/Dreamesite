import Link from "next/link";

import { Mail, MapPin, Phone } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Text } from "@/components/ui/typography";
import { primaryNav, siteConfig } from "@/lib/site-config";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="hairline-top bg-background-alt py-16 md:py-20">
      <Container className="grid gap-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="max-w-sm space-y-4">
          <p className="font-display text-2xl font-light tracking-[0.28em] uppercase">
            {siteConfig.name}
          </p>
          <Text size="small">{siteConfig.description}</Text>
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
                href={`mailto:${siteConfig.contact.email}`}
                className="text-foreground-muted hover:text-foreground inline-flex items-center gap-2 transition-colors duration-(--duration-fast)"
              >
                <Mail size={15} aria-hidden />
                {siteConfig.contact.email}
              </a>
            </li>
            <li>
              <a
                href={`tel:${siteConfig.contact.phone.replace(/\s/g, "")}`}
                className="text-foreground-muted hover:text-foreground inline-flex items-center gap-2 transition-colors duration-(--duration-fast)"
              >
                <Phone size={15} aria-hidden />
                {siteConfig.contact.phone}
              </a>
            </li>
            <li className="text-foreground-subtle inline-flex items-center gap-2">
              <MapPin size={15} aria-hidden />
              {siteConfig.region}
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
