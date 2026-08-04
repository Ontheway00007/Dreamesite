import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Verifies which repository source is chosen for each environment
 * combination, without touching Supabase.
 *
 * Production detection comes from `VERCEL_ENV` (Vercel) or `DEPLOYMENT_ENV`
 * (any other host). `NODE_ENV` is deliberately ignored for this decision
 * because Next.js sets it to "production" during builds including CI.
 */
describe("property source choice", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.VERCEL_ENV;
    delete process.env.DEPLOYMENT_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function freshState() {
    const { resetSupabaseCatalogClientForTests } = await import(
      "@/lib/supabase/catalog"
    );
    resetSupabaseCatalogClientForTests();
    const { getActivePropertySourceName } = await import(
      "@/lib/properties/repository"
    );
    return getActivePropertySourceName;
  }

  it("uses fixtures in development without Supabase config", async () => {
    const getName = await freshState();
    expect(getName()).toBe("local");
  });

  it("uses Supabase when public env values are set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";

    const getName = await freshState();
    expect(getName()).toBe("supabase");
  });

  it("serves an empty catalogue on Vercel production without Supabase", async () => {
    process.env.VERCEL_ENV = "production";

    const getName = await freshState();
    expect(getName()).toBe("empty");
  });

  it("serves an empty catalogue on non-Vercel production without Supabase", async () => {
    process.env.DEPLOYMENT_ENV = "production";

    const getName = await freshState();
    expect(getName()).toBe("empty");
  });

  it("never lets fixtures leak into production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    // Anon key missing — deliberately incomplete configuration

    const getName = await freshState();
    expect(getName()).toBe("empty");
  });
});
