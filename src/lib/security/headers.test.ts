import { describe, expect, it } from "vitest";

import {
  STATIC_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  cspHeaderName,
} from "@/lib/security/headers";

/**
 * Unit-level assertions about the policy string.
 *
 * These test what the policy *says*. Whether a real browser can still load the
 * page under it is a different question, answered by
 * `scripts/check-public-pages.mjs` against a served response.
 */

const NONCE = "dGVzdC1ub25jZQ==";

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split(";").map((part) => {
      const trimmed = part.trim();
      const space = trimmed.indexOf(" ");

      return space === -1
        ? [trimmed, ""]
        : [trimmed.slice(0, space), trimmed.slice(space + 1)];
    }),
  );
}

describe("buildContentSecurityPolicy — static routes, no nonce", () => {
  const csp = buildContentSecurityPolicy(null);
  const parsed = directives(csp);

  it("allows inline script, because a prerendered page cannot carry a nonce", () => {
    // Next writes its inline scripts at build time with no request in scope.
    // A nonce policy would block its own output — verified by
    // scripts/check-public-pages.mjs against served HTML.
    expect(parsed.get("script-src")).toContain("'unsafe-inline'");
  });

  it("omits strict-dynamic, which would make browsers ignore unsafe-inline", () => {
    // Including both is how a policy silently becomes the broken one.
    expect(parsed.get("script-src")).not.toContain("'strict-dynamic'");
  });

  it("carries no nonce at all", () => {
    expect(csp).not.toContain("nonce-");
  });

  it("still refuses eval, framing, plugins and foreign form targets", () => {
    // The concession is inline script and nothing else.
    expect(csp).not.toContain("'unsafe-eval'");
    expect(parsed.get("frame-ancestors")).toBe("'none'");
    expect(parsed.get("object-src")).toBe("'none'");
    expect(parsed.get("form-action")).toBe("'self'");
  });
});

describe("buildContentSecurityPolicy — dynamic routes, with a nonce", () => {
  const csp = buildContentSecurityPolicy(NONCE);
  const parsed = directives(csp);

  it("carries the request's nonce in script-src", () => {
    expect(parsed.get("script-src")).toContain(`'nonce-${NONCE}'`);
  });

  it("does not allow inline or eval'd script", () => {
    // The whole point of the nonce. `'unsafe-inline'` here would allow every
    // injected script as well as Next's own.
    expect(parsed.get("script-src")).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("uses strict-dynamic so allowed scripts can load their own chunks", () => {
    expect(parsed.get("script-src")).toContain("'strict-dynamic'");
  });

  it("allows inline styles, and only styles", () => {
    // next/font injects a <style> element and React inlines style attributes;
    // neither can carry a nonce. Defacement rather than code execution.
    expect(parsed.get("style-src")).toContain("'unsafe-inline'");
  });

  it("refuses framing by anyone", () => {
    expect(parsed.get("frame-ancestors")).toBe("'none'");
  });

  it("blocks plugins and restricts base and form targets", () => {
    expect(parsed.get("object-src")).toBe("'none'");
    expect(parsed.get("base-uri")).toBe("'self'");
    expect(parsed.get("form-action")).toBe("'self'");
  });

  it("allows blob workers, which Mapbox GL compiles at runtime", () => {
    expect(parsed.get("worker-src")).toContain("blob:");
  });

  it("allows Mapbox for tiles and telemetry", () => {
    expect(parsed.get("connect-src")).toContain("https://api.mapbox.com");
    expect(parsed.get("img-src")).toContain("https://api.mapbox.com");
  });

  it("frames only the two providers the embed resolver constructs URLs for", () => {
    const frameSrc = parsed.get("frame-src") ?? "";

    expect(frameSrc).toContain("https://www.youtube-nocookie.com");
    expect(frameSrc).toContain("https://player.vimeo.com");

    // The tracking hosts must not be framed — `resolveEmbed` never produces
    // them, and allowing them here would undo that.
    expect(frameSrc).not.toContain("https://www.youtube.com");
    expect(frameSrc).not.toContain("https://vimeo.com ");
  });

  it("allows Turnstile, which needs a script, a frame and a callback", () => {
    for (const directive of ["script-src", "frame-src", "connect-src"]) {
      expect(parsed.get(directive), directive).toContain(
        "https://challenges.cloudflare.com",
      );
    }
  });

  it("upgrades insecure subresource requests", () => {
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("gives every fetch directive an explicit default", () => {
    expect(parsed.get("default-src")).toBe("'self'");
  });

  it("produces a different policy for a different nonce", () => {
    expect(buildContentSecurityPolicy("other")).not.toBe(csp);
  });

  it("never emits an empty directive when an optional host is absent", () => {
    // Supabase and Mapbox hosts are derived from env vars that may be unset;
    // a dangling directive name would be a parse error in some browsers.
    for (const [name, value] of directives(buildContentSecurityPolicy(NONCE))) {
      if (name === "upgrade-insecure-requests" || name === "") continue;
      expect(value.trim(), name).not.toBe("");
    }
  });
});

describe("STATIC_SECURITY_HEADERS", () => {
  const headers = new Map(
    STATIC_SECURITY_HEADERS.map((header) => [header.key, header.value]),
  );

  it("stops content-type sniffing", () => {
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("keeps the full path same-origin and sends only the origin cross-site", () => {
    // A property URL says which home somebody is viewing.
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("denies the powerful features the application never uses", () => {
    const policy = headers.get("Permissions-Policy") ?? "";

    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(policy, feature).toContain(`${feature}=()`);
    }
  });

  it("allows fullscreen for the video players", () => {
    expect(headers.get("Permissions-Policy")).toContain("fullscreen=(self)");
  });

  it("sets HSTS for two years across subdomains, without preload", () => {
    const hsts = headers.get("Strict-Transport-Security") ?? "";

    expect(hsts).toContain("max-age=63072000");
    expect(hsts).toContain("includeSubDomains");
    // Preload is a slow decision to reverse and belongs to the domain owner.
    expect(hsts).not.toContain("preload");
  });

  it("isolates the browsing context while still allowing popups", () => {
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin-allow-popups",
    );
  });

  it("sends the legacy framing header alongside frame-ancestors", () => {
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("disables the legacy XSS auditor rather than enabling it", () => {
    // The old filter introduced cross-origin leaks of its own.
    expect(headers.get("X-XSS-Protection")).toBe("0");
  });
});

describe("cspHeaderName", () => {
  it("enforces by default", () => {
    const previous = process.env.CSP_REPORT_ONLY;
    delete process.env.CSP_REPORT_ONLY;

    expect(cspHeaderName()).toBe("Content-Security-Policy");

    process.env.CSP_REPORT_ONLY = previous;
  });

  it("reports only when explicitly asked", () => {
    const previous = process.env.CSP_REPORT_ONLY;
    process.env.CSP_REPORT_ONLY = "true";

    expect(cspHeaderName()).toBe("Content-Security-Policy-Report-Only");

    process.env.CSP_REPORT_ONLY = previous;
  });

  it("enforces for any value other than the exact opt-in", () => {
    const previous = process.env.CSP_REPORT_ONLY;

    for (const value of ["false", "1", "yes", ""]) {
      process.env.CSP_REPORT_ONLY = value;
      expect(cspHeaderName(), value).toBe("Content-Security-Policy");
    }

    process.env.CSP_REPORT_ONLY = previous;
  });
});
