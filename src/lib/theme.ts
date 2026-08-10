export type SiteTheme = "dark" | "light";

export const DEFAULT_SITE_THEME: SiteTheme = "dark";
export const THEME_STORAGE_KEY = "dreame-site-theme";
export const THEME_CHANGE_EVENT = "dreame:theme-change";

export const themeColor: Readonly<Record<SiteTheme, string>> = {
  dark: "#050506",
  light: "#f3efe7",
};

export function isSiteTheme(value: unknown): value is SiteTheme {
  return value === "dark" || value === "light";
}
