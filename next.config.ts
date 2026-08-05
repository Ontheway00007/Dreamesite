import type { NextConfig } from "next";

import { STATIC_SECURITY_HEADERS } from "./src/lib/security/headers";

/**
 * Allow next/image to serve files from the project's Supabase Storage bucket
 * when the URL is configured. Derived from the same variable the client uses so
 * the two can never disagree.
 */
function supabaseImagePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    return [];
  }

  try {
    return [
      {
        protocol: "https",
        hostname: new URL(url).hostname,
        pathname: "/storage/v1/object/public/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: supabaseImagePatterns(),
  },

  /**
   * Constant security headers, on every route.
   *
   * Only the headers that never vary are here. The Content-Security-Policy
   * carries a per-request nonce and is attached by the proxy instead —
   * `next.config.ts` is evaluated once at build time and cannot produce one.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...STATIC_SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
