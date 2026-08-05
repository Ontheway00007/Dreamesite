/**
 * Security headers.
 *
 * Split into two groups by whether they need to change per request.
 *
 * `STATIC_SECURITY_HEADERS` are constant, so they are attached in
 * `next.config.ts` and cost nothing at runtime. The Content-Security-Policy
 * carries a per-request nonce, so it is built here and attached by the proxy
 * (`src/proxy.ts`).
 *
 * Kept in one module, free of `server-only`, so the same definitions are used by
 * the config, the proxy and the tests. A header asserted in a test that is
 * not the header the application sends is worse than no test.
 */

/** Hosts the application genuinely talks to, grouped by what needs them. */
const SUPABASE_ORIGIN = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!url) return null;

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
})();

/**
 * Supabase Realtime uses a WebSocket on the same host.
 *
 * Derived rather than written out, so a project change cannot leave the CSP
 * pointing at the previous one.
 */
const SUPABASE_WEBSOCKET = SUPABASE_ORIGIN
  ? SUPABASE_ORIGIN.replace(/^https:/, "wss:")
  : null;

const MAPBOX_ENDPOINTS = [
  "https://api.mapbox.com",
  "https://events.mapbox.com",
];

/** The two video providers `lib/media/embeds.ts` is willing to construct. */
const EMBED_FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
];

/** Poster images and player assets those providers serve. */
const EMBED_IMAGE_HOSTS = ["https://i.ytimg.com", "https://i.vimeocdn.com"];

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com";

function join(directive: string, values: readonly (string | null)[]): string {
  const present = values.filter((value): value is string => Boolean(value));

  return `${directive} ${present.join(" ")}`;
}

/**
 * Builds the Content-Security-Policy for one request.
 *
 * ## Why a nonce
 *
 * Next.js emits inline `<script>` tags in production to stream the RSC payload.
 * Allowing those with `'unsafe-inline'` would allow every other inline script
 * too, which is most of what a CSP is for. Given a nonce in the policy, Next
 * stamps the same nonce onto its own scripts, so they are allowed and injected
 * ones are not.
 *
 * `'strict-dynamic'` is included so scripts loaded *by* an allowed script — the
 * Mapbox worker bundle, a provider's player — inherit trust without every URL
 * being listed. It also means older browsers that ignore it fall back to the
 * host list rather than to nothing.
 *
 * ## Why `style-src` still allows inline
 *
 * `next/font` injects a `<style>` element, and React inlines style attributes.
 * Neither can carry a nonce today. Inline *styles* are a far smaller problem
 * than inline scripts — the realistic attack is defacement rather than code
 * execution — so this is the one concession, and it is deliberate rather than
 * inherited.
 *
 * ## What is deliberately absent
 *
 * No `unsafe-eval`: nothing in the bundle needs it, and Mapbox GL has not
 * required it since v2. If a dependency ever does, the correct response is to
 * question the dependency.
 */
export function buildContentSecurityPolicy(nonce: string | null): string {
  /*
    Two script policies, chosen by whether a nonce exists — which is really a
    question about how the route renders.

    A nonce has to be generated per request and stamped onto the inline scripts
    Next emits. That works only for a dynamically rendered route. The public
    catalogue is deliberately *statically* generated with a five-minute
    revalidation, so its HTML is built once with no request in scope and no nonce
    to stamp. Sending a nonce policy to those pages does not make them safer; it
    stops them working, because every inline script Next already wrote is
    unnonced.

    So the admin — dynamic on every route, and the part with a session worth
    stealing — gets the strict nonce policy. The public pages get the same policy
    with `'unsafe-inline'` in place of the nonce.

    The alternative was making the public site dynamic to earn a nonce. That
    trades a real, measured performance property for a theoretical one: the
    public pages render administrator-authored text through React, which escapes
    it, and the only inline script in the HTML is Next's own. `'unsafe-inline'`
    there is a loss of defence in depth, not an open door — and every other
    directive still applies.

    `'strict-dynamic'` is omitted from the fallback on purpose: when it is
    present, browsers ignore `'unsafe-inline'`, so including both would quietly
    produce the broken policy this exists to avoid.
  */
  const scriptSrc = nonce
    ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", TURNSTILE_SCRIPT]
    : ["'self'", "'unsafe-inline'", TURNSTILE_SCRIPT];

  const directives = [
    join("default-src", ["'self'"]),

    join("script-src", scriptSrc),

    // Mapbox GL compiles its worker at runtime from a blob.
    join("worker-src", ["'self'", "blob:"]),
    join("child-src", ["'self'", "blob:"]),

    join("style-src", ["'self'", "'unsafe-inline'"]),

    join("img-src", [
      "'self'",
      "data:",
      "blob:",
      SUPABASE_ORIGIN,
      ...MAPBOX_ENDPOINTS,
      ...EMBED_IMAGE_HOSTS,
    ]),

    join("font-src", ["'self'", "data:"]),

    join("connect-src", [
      "'self'",
      SUPABASE_ORIGIN,
      SUPABASE_WEBSOCKET,
      ...MAPBOX_ENDPOINTS,
      TURNSTILE_SCRIPT,
    ]),

    // Only the providers whose embed URLs this application constructs.
    join("frame-src", ["'self'", TURNSTILE_SCRIPT, ...EMBED_FRAME_HOSTS]),

    // Nobody may frame this site. Replaces X-Frame-Options for modern browsers;
    // the legacy header is still sent alongside for older ones.
    join("frame-ancestors", ["'none'"]),

    join("base-uri", ["'self'"]),
    join("form-action", ["'self'"]),
    join("object-src", ["'none'"]),
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

/**
 * Headers that never vary, attached by `next.config.ts`.
 *
 * `Strict-Transport-Security` is included unconditionally and that is safe: the
 * header is ignored over plain HTTP, so local development on `http://localhost`
 * is unaffected while a deployed origin gets it from the first response.
 * `preload` is deliberately omitted — submitting to the preload list is a
 * decision with a slow reversal, and it belongs to whoever owns the domain.
 */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{
  readonly key: string;
  readonly value: string;
}> = [
  // Stops a browser second-guessing a declared Content-Type, which is how a
  // text upload becomes executable script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Send the origin cross-site and the full path same-origin. A property URL
  // identifies which home somebody is looking at, so it stays in.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Deny everything the application does not ask for. Geolocation is listed
  // explicitly: the map shows published projections and never asks where the
  // visitor is.
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "display-capture=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      // Allowed for the video players, which are same-origin-framed embeds.
      "fullscreen=(self)",
    ].join(", "),
  },

  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },

  // `same-origin-allow-popups` rather than `same-origin`: the provider "watch
  // on…" links open real tabs, and strict isolation severs `window.opener` in
  // ways that break some OAuth popup flows if one is added later.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },

  // Legacy equivalent of frame-ancestors, for browsers that predate CSP 2.
  { key: "X-Frame-Options", value: "DENY" },

  // Off. It leaked cross-origin information and every current browser has
  // removed it; sending 0 stops any remaining implementation from acting.
  { key: "X-XSS-Protection", value: "0" },
];

/**
 * Whether to send the policy in report-only mode.
 *
 * A CSP is the one header that can break a working page, and the parts most
 * likely to break it — the map and the video players — need a real browser and
 * real credentials to exercise. Setting `CSP_REPORT_ONLY=true` sends
 * `Content-Security-Policy-Report-Only` instead, so a deployment can be watched
 * before it is enforced.
 *
 * Enforcing is the default. An operator who wants the safer rollout has to ask
 * for it, rather than an operator who wants security having to remember to.
 */
export function cspHeaderName(): string {
  return process.env.CSP_REPORT_ONLY === "true"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}
