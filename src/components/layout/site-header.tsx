"use client";

import { useEffect, useState, type MouseEvent } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Menu, X } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { primaryNav, siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils/cn";
import { useSmoothScroll } from "@/providers/smooth-scroll-provider";

export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  const { scrollTo } = useSmoothScroll();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleNavClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    const hashIndex = href.indexOf("#");

    if (hashIndex === -1) {
      setIsOpen(false);
      return;
    }

    const [path] = href.split("#");
    const isSamePage = path === "/" ? pathname === "/" : pathname === path;

    if (!isSamePage) {
      setIsOpen(false);
      return;
    }

    event.preventDefault();
    setIsOpen(false);
    scrollTo(href.slice(hashIndex), -96);
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color] duration-(--duration-base) ease-luxe",
        isScrolled || isOpen
          ? "border-b border-border bg-surface-overlay backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <Container className="flex h-(--header-height) items-center justify-between gap-6">
        <Link
          href="/"
          className="font-display text-xl font-light tracking-[0.28em] uppercase"
          onClick={() => setIsOpen(false)}
        >
          {siteConfig.name}
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-9 md:flex">
          {primaryNav.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={(event) => handleNavClick(event, link.href)}
              className="text-foreground-muted hover:text-foreground text-xs font-medium tracking-[0.2em] uppercase transition-colors duration-(--duration-fast)"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button href={`mailto:${siteConfig.contact.email}`} variant="outline" size="sm">
            Book a viewing
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          className="text-foreground -mr-2 inline-flex size-10 items-center justify-center rounded-full md:hidden"
        >
          {isOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        </button>
      </Container>

      <div
        id="mobile-navigation"
        hidden={!isOpen}
        className="border-t border-border bg-background/95 backdrop-blur-xl md:hidden"
      >
        <Container className="flex flex-col gap-1 py-6">
          {primaryNav.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={(event) => handleNavClick(event, link.href)}
              className="font-display text-heading-3 text-foreground py-2"
            >
              {link.label}
            </Link>
          ))}
          <Button
            href={`mailto:${siteConfig.contact.email}`}
            variant="accent"
            size="md"
            className="mt-4"
            fullWidth
          >
            Book a viewing
          </Button>
        </Container>
      </div>
    </header>
  );
}
