"use client";

import { useEffect, useLayoutEffect } from "react";

import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  ADMIN_SITE_THEME,
  DEFAULT_SITE_THEME,
  isSiteTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  themeColor,
  type SiteTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils/cn";

function storedTheme(): SiteTheme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isSiteTheme(stored) ? stored : DEFAULT_SITE_THEME;
  } catch {
    return DEFAULT_SITE_THEME;
  }
}

function applyTheme(theme: SiteTheme, persist: boolean): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", themeColor[theme]);

  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The theme still changes for this visit when storage is unavailable.
    }
  }

  window.dispatchEvent(
    new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }),
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  // React remounts the document once in development. Reapply the value that
  // the pre-paint script set, and keep the admin surface on its existing theme.
  useLayoutEffect(() => {
    applyTheme(isAdmin ? ADMIN_SITE_THEME : storedTheme(), false);

    return () => {
      if (isAdmin) {
        applyTheme(storedTheme(), false);
      }
    };
  }, [isAdmin]);

  // A choice made in another tab should update this tab too.
  useEffect(() => {
    if (isAdmin) {
      return;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY && isSiteTheme(event.newValue)) {
        applyTheme(event.newValue, false);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isAdmin]);

  if (isAdmin) {
    return null;
  }

  const toggle = () => {
    const current = isSiteTheme(document.documentElement.dataset.theme)
      ? document.documentElement.dataset.theme
      : DEFAULT_SITE_THEME;
    const next: SiteTheme = current === "dark" ? "light" : "dark";
    applyTheme(next, true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark colour theme"
      title="Toggle light and dark colour theme"
      className={cn(
        "theme-toggle border-border bg-surface/70 text-foreground hover:border-border-strong hover:bg-surface relative inline-grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border shadow-soft backdrop-blur-xl transition-[background-color,border-color,transform] duration-(--duration-base) ease-luxe motion-safe:hover:-translate-y-0.5",
        className,
      )}
    >
      <Sun className="theme-toggle__sun absolute size-[1.05rem]" aria-hidden />
      <Moon className="theme-toggle__moon absolute size-4" aria-hidden />
    </button>
  );
}
