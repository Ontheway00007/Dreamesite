import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NEUTRAL_LOGIN_FAILURE,
  SERVICE_UNAVAILABLE_MESSAGE,
  clientAddressFrom,
  hashClientAddress,
  isTurnstileConfigured,
  isTurnstileEnforced,
  safeRedirectTarget,
  verifyTurnstile,
} from "@/lib/admin/login-security";

/**
 * The login surface is the only part of the admin an unauthenticated stranger
 * can reach, so these tests are about what it refuses to reveal and what it
 * refuses to do.
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("the neutral failure message", () => {
  it("names no field, no account and no reason", () => {
    // Anything specific here is an enumeration oracle. "Invalid password" says
    // the account exists; "not an administrator" says the password was right.
    for (const leak of [
      "password",
      "email address is",
      "not found",
      "does not exist",
      "administrator access",
      "inactive",
      "deactivated",
    ]) {
      expect(NEUTRAL_LOGIN_FAILURE.toLowerCase(), leak).not.toContain(leak);
    }
  });

  it("is distinguishable from the service-failure message", () => {
    // Telling somebody their password is wrong when the database is down sends
    // them to reset a password that was fine.
    expect(NEUTRAL_LOGIN_FAILURE).not.toBe(SERVICE_UNAVAILABLE_MESSAGE);
    expect(SERVICE_UNAVAILABLE_MESSAGE.toLowerCase()).not.toContain("password");
  });
});

describe("safeRedirectTarget", () => {
  it("keeps a legitimate admin path", () => {
    expect(safeRedirectTarget("/admin/properties")).toBe("/admin/properties");
    expect(safeRedirectTarget("/admin/enquiries?status=new")).toBe(
      "/admin/enquiries?status=new",
    );
    expect(safeRedirectTarget("/admin")).toBe("/admin");
  });

  it("refuses an absolute URL", () => {
    // The classic open redirect: a phishing page that looks like the dashboard.
    for (const attempt of [
      "https://evil.example/admin",
      "http://evil.example",
      "//evil.example",
      "//evil.example/admin",
      "https:/evil.example",
    ]) {
      expect(safeRedirectTarget(attempt), attempt).toBe("/admin");
    }
  });

  it("refuses backslashes, which some browsers normalise to slashes", () => {
    for (const attempt of ["\\\\evil.example", "/\\evil.example", "/admin\\..\\x"]) {
      expect(safeRedirectTarget(attempt), attempt).toBe("/admin");
    }
  });

  it("refuses a scheme that executes", () => {
    for (const attempt of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
    ]) {
      expect(safeRedirectTarget(attempt), attempt).toBe("/admin");
    }
  });

  it("refuses a path that only looks like it is under /admin", () => {
    // A naive `startsWith("/admin")` accepts all of these.
    for (const attempt of [
      "/administrator",
      "/admin-evil",
      "/adminsomething/else",
    ]) {
      expect(safeRedirectTarget(attempt), attempt).toBe("/admin");
    }
  });

  it("refuses anything outside /admin", () => {
    expect(safeRedirectTarget("/properties")).toBe("/admin");
    expect(safeRedirectTarget("/")).toBe("/admin");
  });

  it("refuses control characters that could truncate a header", () => {
    expect(safeRedirectTarget("/admin/x\r\nLocation: https://evil.example")).toBe(
      "/admin",
    );
    expect(safeRedirectTarget("/admin/x\u0000")).toBe("/admin");
  });

  it("does not send an administrator back to the login page", () => {
    // Which would loop.
    expect(safeRedirectTarget("/admin/login")).toBe("/admin");
    expect(safeRedirectTarget("/admin/login?next=/admin")).toBe("/admin");
  });

  it("falls back for empty and missing input", () => {
    for (const attempt of [null, undefined, "", "   "]) {
      expect(safeRedirectTarget(attempt)).toBe("/admin");
    }
  });
});

describe("hashClientAddress", () => {
  it("returns a hash, never the address", () => {
    process.env.LOGIN_HASH_SALT = "a-salt";

    const hash = hashClientAddress("203.0.113.7");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
  });

  it("is stable for the same address and salt", () => {
    process.env.LOGIN_HASH_SALT = "a-salt";

    expect(hashClientAddress("203.0.113.7")).toBe(hashClientAddress("203.0.113.7"));
  });

  it("differs between addresses and between salts", () => {
    process.env.LOGIN_HASH_SALT = "a-salt";
    const first = hashClientAddress("203.0.113.7");

    expect(hashClientAddress("203.0.113.8")).not.toBe(first);

    process.env.LOGIN_HASH_SALT = "another-salt";
    // Without a salt, hashing an IPv4 address is reversible by brute force in
    // seconds. Changing the salt must change the output.
    expect(hashClientAddress("203.0.113.7")).not.toBe(first);
  });

  it("returns null rather than an unsalted hash when no salt is configured", () => {
    delete process.env.LOGIN_HASH_SALT;

    // Per-address throttling is skipped; per-email throttling still applies.
    expect(hashClientAddress("203.0.113.7")).toBeNull();
  });

  it("returns null for a missing address", () => {
    process.env.LOGIN_HASH_SALT = "a-salt";

    expect(hashClientAddress(null)).toBeNull();
  });
});

describe("clientAddressFrom", () => {
  it("takes the first entry of x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 198.51.100.1, 10.0.0.1",
    });

    expect(clientAddressFrom(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientAddressFrom(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  it("returns null when no proxy header is present", () => {
    expect(clientAddressFrom(new Headers())).toBeNull();
  });
});

describe("Turnstile configuration", () => {
  it("needs both keys, because a site key alone renders an unverified widget", () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    delete process.env.TURNSTILE_SECRET_KEY;

    expect(isTurnstileConfigured()).toBe(false);

    process.env.TURNSTILE_SECRET_KEY = "secret";
    expect(isTurnstileConfigured()).toBe(true);
  });

  it("is skipped in local development when unconfigured", () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.VERCEL_ENV;
    delete process.env.DEPLOYMENT_ENV;

    // So the login form works without a Cloudflare account.
    expect(isTurnstileEnforced()).toBe(false);
  });

  it("is enforced in production even when unconfigured", () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.VERCEL_ENV = "production";

    // A forgotten variable must not silently disable the challenge. Failing
    // closed makes it a visible startup problem instead.
    expect(isTurnstileEnforced()).toBe(true);
  });

  it("is enforced on a non-Vercel production host", () => {
    delete process.env.VERCEL_ENV;
    process.env.DEPLOYMENT_ENV = "production";

    expect(isTurnstileEnforced()).toBe(true);
  });
});

describe("verifyTurnstile", () => {
  it("fails when no secret is configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;

    const outcome = await verifyTurnstile("token", null);

    expect(outcome.ok).toBe(false);
    expect(outcome.errorCodes).toContain("not-configured");
  });

  it("fails when no token was submitted", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";

    const outcome = await verifyTurnstile(null, null);

    expect(outcome.ok).toBe(false);
    expect(outcome.errorCodes).toContain("missing-input-response");
  });

  it("accepts a token Cloudflare confirms", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ success: true }) }),
    );

    expect((await verifyTurnstile("token", "203.0.113.7")).ok).toBe(true);
  });

  it("rejects a token Cloudflare refuses, and keeps the codes for the log", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
      }),
    );

    const outcome = await verifyTurnstile("token", null);

    expect(outcome.ok).toBe(false);
    expect(outcome.errorCodes).toContain("invalid-input-response");
  });

  it("fails closed when Cloudflare is unreachable", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    // An unreachable verifier during a run of failed logins is exactly when the
    // challenge matters, so "could not check" must mean "not verified".
    const outcome = await verifyTurnstile("token", null);

    expect(outcome.ok).toBe(false);
    expect(outcome.errorCodes).toContain("verification-unreachable");
  });

  it("does not send the secret anywhere but Cloudflare", async () => {
    process.env.TURNSTILE_SECRET_KEY = "top-secret";

    const spy = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", spy);

    await verifyTurnstile("token", null);

    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
  });
});
