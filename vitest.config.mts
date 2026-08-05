import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest covers the pure logic behind the map and the listing: filtering,
 * GeoJSON generation, the privacy transform and slug lookup. There is no
 * component or browser testing here — that would need a much larger setup than
 * this phase justifies.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),

      /*
        `server-only` throws on import outside a React Server Component, which
        makes any module carrying it untestable. Aliased to an empty module here.

        This weakens nothing in the real build: the guard exists to fail the
        *bundler* when server code is imported into a client component, and the
        bundler still sees the real package. The alias applies only to Vitest,
        which has no client boundary to protect.
      */
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
