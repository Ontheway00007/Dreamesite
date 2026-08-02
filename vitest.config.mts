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
    },
  },
});
