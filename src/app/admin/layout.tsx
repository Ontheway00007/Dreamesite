import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s — Dreame Admin",
    default: "Dreame Admin",
  },
  robots: { index: false, follow: false },
};

/**
 * Root admin layout. This wraps everything under /admin including login
 * and unauthorized pages. The dashboard layout (with sidebar) is nested
 * inside the (dashboard) route group.
 */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
