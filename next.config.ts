import type { NextConfig } from "next";

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
};

export default nextConfig;
