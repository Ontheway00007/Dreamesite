"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Menu, X } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { ENQUIRY_ANCHOR } from "@/lib/routes";
import { primaryNav } from "@/lib/site-config";
import { cn } from "@/lib/utils/cn";
import { useSmoothScroll } from "@/providers/smooth-scroll-provider";

/** Visible, focusable elements inside a container, in tab order. */
function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
  ).filter((element) => element.offsetParent !== null);
}

/**
 * Site navigation.
 *
 * The mobile panel stays mounted and is switched with `inert` plus a CSS
 * transition, rather than being added and removed from the tree. That keeps two
 * things simple: focus can move into the panel the moment it opens, because the
 * element always exists, and `inert` guarantees nothing inside it is focusable
 * or announced while it is closed.
 */
export function SiteHeader({
  /**
   * The trading name to show as the wordmark. Passed in rather than imported so
   * the business can change it in Settings — this is a Client Component and
   * cannot read the database itself.
   */
  companyName,
}: {
  companyName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { scrollTo, setPaused } = useSmoothScroll();

  const close = useCallback((returnFocus: boolean) => {
    setIsOpen(false);

    if (returnFocus) {
      toggleRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Freeze the page behind the menu, and always release it on unmount.
  useEffect(() => {
    setPaused(isOpen);

    return () => setPaused(false);
  }, [isOpen, setPaused]);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const panel = panelRef.current;

    if (panel) {
      focusableWithin(panel)[0]?.focus();
    }
  }, [isOpen]);

  // Escape closes the menu; Tab stays inside the header while it is open.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }

      if (event.key !== "Tab" || !headerRef.current) {
        return;
      }

      const focusable = focusableWithin(headerRef.current);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  const handleNavClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    const hashIndex = href.indexOf("#");
    const [path] = href.split("#");
    const isSamePage =
      path === "" || path === "/" ? pathname === "/" : pathname === path;

    // Navigating away: let the router handle it, just close the menu.
    if (hashIndex === -1 || !isSamePage) {
      close(false);
      return;
    }

    event.preventDefault();
    close(false);
    scrollTo(href.slice(hashIndex), -96);
  };

  // The contact anchor, not a mailto. The page it scrolls to carries the real
  // enquiry form; a mailto depends on the visitor having a mail client set up
  // and leaves the business with no record of the enquiry.
  const contactHref = ENQUIRY_ANCHOR;

  return (
    <header
      ref={headerRef}
      className={cn(
        "fixed inset-x-0 top-0 z-50 bg-[#070708]/95 backdrop-blur-xl transition-[background-color,border-color] duration-(--duration-base) ease-luxe",
        isScrolled || isOpen
          ? "border-border border-b shadow-soft"
          : "border-b border-transparent",
      )}
    >
      <Container className="flex h-(--header-height) items-center justify-between gap-6">
        <Link
          href="/"
          className="font-display text-xl font-light tracking-[0.28em] uppercase"
          onClick={() => close(false)}
        >
          {companyName}
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
          <Button href={contactHref} variant="outline" size="sm">
            Contact us
          </Button>
        </div>

        <button
          ref={toggleRef}
          type="button"
          onClick={() => (isOpen ? close(true) : setIsOpen(true))}
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          className="text-foreground -mr-2 inline-flex size-10 items-center justify-center rounded-full md:hidden"
        >
          {isOpen ? (
            <X size={20} aria-hidden />
          ) : (
            <Menu size={20} aria-hidden />
          )}
        </button>
      </Container>

      <div
        id="mobile-navigation"
        ref={panelRef}
        inert={!isOpen}
        data-lenis-prevent
        className={cn(
          "border-border bg-background/98 absolute inset-x-0 top-full h-[calc(100dvh-var(--header-height))] overflow-y-auto border-t backdrop-blur-xl transition-[opacity,transform] duration-(--duration-base) ease-luxe md:hidden",
          isOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-3 opacity-0",
        )}
      >
        <Container className="flex flex-col py-10">
          <nav aria-label="Mobile" className="flex flex-col">
            {primaryNav.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={(event) => handleNavClick(event, link.href)}
                className="font-display text-heading-2 text-foreground border-border border-b py-4 font-light"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <Button
            href={contactHref}
            variant="accent"
            size="md"
            className="mt-8"
            fullWidth
            onClick={() => close(false)}
          >
            Contact us
          </Button>
        </Container>
      </div>
    </header>
  );
}
