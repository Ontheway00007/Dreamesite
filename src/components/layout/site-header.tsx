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

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { duration, easing } from "@/lib/animation/easing";
import { primaryNav, siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils/cn";
import { useSmoothScroll } from "@/providers/smooth-scroll-provider";

/** Visible, focusable elements inside a container, in tab order. */
function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
  ).filter((element) => element.offsetParent !== null);
}

export function SiteHeader() {
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

  // Freeze the page behind the full-screen menu.
  useEffect(() => {
    setPaused(isOpen);

    return () => setPaused(false);
  }, [isOpen, setPaused]);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const panel = panelRef.current;

    if (panel) {
      focusableWithin(panel)[0]?.focus();
    }
  }, [isOpen]);

  // Escape closes the menu; Tab cycles within the header while it is open.
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
    const isSamePage = path === "" || path === "/" ? pathname === "/" : pathname === path;

    if (hashIndex === -1 || !isSamePage) {
      close(false);
      return;
    }

    event.preventDefault();
    close(false);
    scrollTo(href.slice(hashIndex), -96);
  };

  const contactHref = `mailto:${siteConfig.contact.email}`;

  return (
    <header
      ref={headerRef}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-(--duration-base) ease-luxe",
        isScrolled || isOpen
          ? "border-b border-border bg-surface-overlay backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <Container className="flex h-(--header-height) items-center justify-between gap-6">
        <Link
          href="/"
          className="font-display text-xl font-light tracking-[0.28em] uppercase"
          onClick={() => close(false)}
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

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="mobile-navigation"
            id="mobile-navigation"
            ref={panelRef}
            data-lenis-prevent
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: duration.base, ease: easing.entrance }}
            className="border-t border-border bg-background/98 h-[calc(100dvh-var(--header-height))] overflow-y-auto backdrop-blur-xl md:hidden"
          >
            <Container className="flex flex-col gap-2 py-10">
              <nav aria-label="Mobile" className="flex flex-col">
                {primaryNav.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={(event) => handleNavClick(event, link.href)}
                    className="font-display text-heading-2 text-foreground border-b border-border py-4 font-light"
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
