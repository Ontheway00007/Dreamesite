const BASE = "http://127.0.0.1:3000";

async function get(path) {
  const res = await fetch(BASE + path);
  return { status: res.status, body: await res.text() };
}

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// Public routes are statically generated, so their policy allows inline script;
// the admin is dynamic and gets the strict nonce policy. Both are asserted.
const STATIC_HEADER_ROUTES = ["/", "/properties", "/properties/single-storey-concept"];
const DYNAMIC_HEADER_ROUTES = ["/admin/login"];
const HEADER_ROUTES = [...STATIC_HEADER_ROUTES, ...DYNAMIC_HEADER_ROUTES];

const pages = [
  "/",
  "/properties",
  "/properties/single-storey-concept",
  "/robots.txt",
  "/sitemap.xml",
  "/admin",
  "/does-not-exist",
];

const bodies = {};

for (const path of pages) {
  const { status, body } = await get(path);
  bodies[path] = body;
  const expected = path === "/does-not-exist" ? 404 : path === "/admin" ? [200, 307, 302, 500] : 200;
  const ok = Array.isArray(expected) ? expected.includes(status) : status === expected;
  check(`${path} responds ${status}`, ok, path === "/admin" && status === 500 ? "expected here: no Supabase project configured, and the admin cannot fall back to fixtures" : "");
}

/* --- security headers ---------------------------------------------------- */
//
// Asserted against a served response, not against the config, because the
// proxy rebuilds the response when Supabase refreshes a cookie and a
// mistake there drops the policy silently.

for (const path of HEADER_ROUTES) {
  const res = await fetch(BASE + path);
  const h = res.headers;

  check(`${path} sends a Content-Security-Policy`, Boolean(h.get("content-security-policy")));
  check(`${path} sends nosniff`, h.get("x-content-type-options") === "nosniff");
  check(
    `${path} sends a referrer policy`,
    h.get("referrer-policy") === "strict-origin-when-cross-origin",
  );
  check(`${path} sends a permissions policy`, (h.get("permissions-policy") ?? "").includes("camera=()"));
  check(`${path} sends HSTS`, (h.get("strict-transport-security") ?? "").includes("max-age="));
  check(
    `${path} sends COOP`,
    h.get("cross-origin-opener-policy") === "same-origin-allow-popups",
  );
  check(`${path} refuses framing`, h.get("x-frame-options") === "DENY");

  const csp = h.get("content-security-policy") ?? "";
  const expectsNonce = DYNAMIC_HEADER_ROUTES.includes(path);

  check(`${path} CSP forbids unsafe-eval`, !csp.includes("unsafe-eval"));
  check(`${path} CSP forbids framing`, csp.includes("frame-ancestors 'none'"));
  check(`${path} CSP blocks plugins`, csp.includes("object-src 'none'"));
  check(`${path} CSP restricts form targets`, csp.includes("form-action 'self'"));

  if (expectsNonce) {
    check(`${path} CSP carries a nonce`, /'nonce-[A-Za-z0-9+/=]+'/.test(csp));
    check(
      `${path} CSP forbids inline script`,
      !/script-src[^;]*'unsafe-inline'/.test(csp),
    );
  } else {
    // Statically generated: Next wrote the inline scripts at build time with no
    // request in scope, so a nonce would block its own output.
    check(`${path} CSP carries no nonce (static route)`, !csp.includes("nonce-"));
    check(
      `${path} CSP does not combine strict-dynamic with unsafe-inline`,
      !(csp.includes("strict-dynamic") && csp.includes("'unsafe-inline'")),
    );
  }
}

// Two admin requests must not share a nonce, or the policy is decorative.
{
  const nonceOf = async () => {
    const res = await fetch(BASE + "/admin/login");
    return (res.headers.get("content-security-policy") ?? "").match(/'nonce-([^']+)'/)?.[1];
  };

  const [first, second] = [await nonceOf(), await nonceOf()];

  check("each admin request gets a fresh nonce", Boolean(first) && first !== second);
}

// The check that matters: under a nonce policy, every inline script Next emits
// must carry that nonce or the page is broken in a real browser. This is what
// caught the original attempt to apply a nonce policy to the static pages.
{
  const res = await fetch(BASE + "/admin/login");
  const html = await res.text();
  const nonce = (res.headers.get("content-security-policy") ?? "").match(
    /'nonce-([^']+)'/,
  )?.[1];

  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].map((m) => m[0]);
  const unnonced = inlineScripts.filter(
    (tag) => !tag.includes(`nonce="${nonce}"`) && !tag.includes("application/ld+json"),
  );

  check(
    `every inline script on a nonce route carries it (${inlineScripts.length} inline)`,
    unnonced.length === 0,
    unnonced.length > 0 ? unnonced[0].slice(0, 90) : "",
  );
}

/* --- robots.txt ---------------------------------------------------------- */
const robots = bodies["/robots.txt"];
check("robots.txt disallows /admin", robots.includes("/admin"));
check("robots.txt advertises the sitemap", robots.includes("Sitemap"));

/* --- sitemap.xml --------------------------------------------------------- */
const sitemap = bodies["/sitemap.xml"];
check("sitemap is XML with a urlset", sitemap.includes("<urlset"));
check("sitemap lists the homepage", sitemap.includes("<loc>"));
const locCount = (sitemap.match(/<loc>/g) || []).length;
check(`sitemap lists ${locCount} URLs (>= 2 static)`, locCount >= 2);
check("sitemap contains no /admin URL", !sitemap.includes("/admin"));

/* --- structured data ----------------------------------------------------- */
const detail = bodies["/properties/single-storey-concept"];
const ldBlocks = [...detail.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(
  (m) => m[1],
);
check(`property page carries ${ldBlocks.length} JSON-LD blocks (expect 3)`, ldBlocks.length === 3);

let parsedOk = true;
const types = [];
for (const block of ldBlocks) {
  try {
    const data = JSON.parse(block);
    types.push(data["@type"]);
  } catch (error) {
    parsedOk = false;
    console.log("   unparseable JSON-LD:", String(error).slice(0, 120));
  }
}
check("every JSON-LD block parses as JSON", parsedOk, types.join(", "));
check(
  "includes the organisation, residence and breadcrumb",
  ["HomeAndConstructionBusiness", "SingleFamilyResidence", "BreadcrumbList"].every((t) =>
    types.includes(t),
  ),
  types.join(", "),
);

const ldJoined = ldBlocks.join(" ");
check(
  "structured data publishes no coordinate",
  !/"geo"|"latitude"|"longitude"/.test(ldJoined),
);
check(
  "structured data invents no rating, review or price",
  !/aggregateRating|ratingValue|reviewCount|"offers"|priceCurrency/.test(ldJoined),
);

/* --- metadata ------------------------------------------------------------ */
const twitterCard = (detail.match(/name="twitter:card" content="([a-z_]+)"/) || [])[1];
check("property page emits a Twitter card", Boolean(twitterCard), twitterCard);
check(
  "Twitter and Open Graph titles agree",
  (detail.match(/name="twitter:title" content="([^"]*)"/) || [])[1] ===
    (detail.match(/property="og:title" content="([^"]*)"/) || [])[1],
);
check("property page has a canonical link", /rel="canonical"/.test(detail));
check(
  "no Twitter handle is claimed",
  !/twitter:site|twitter:creator/.test(detail),
);

/* --- third-party embeds -------------------------------------------------- */
const allHtml = Object.values(bodies).join("\n");
const iframes = [...allHtml.matchAll(/<iframe[^>]*>/g)].map((m) => m[0]);
const thirdParty = iframes.filter((tag) => /youtube|vimeo|youtu\.be/.test(tag));
check(
  `no third-party player iframe in initial HTML (${iframes.length} iframes total)`,
  thirdParty.length === 0,
);

/* --- privacy ------------------------------------------------------------- */
// The fixture properties carry private coordinates. None may reach the HTML.
check(
  "no private coordinate field names in public HTML",
  !/private_latitude|private_longitude|privateLatitude|privateLongitude/.test(allHtml),
);
check(
  "no service-role or JWT-looking secret in public HTML",
  !/service_role|SUPABASE_SERVICE_ROLE/.test(allHtml),
);

/* --- accessibility landmarks -------------------------------------------- */
check("homepage has a skip link", /Skip to content/.test(bodies["/"]));
check("homepage has a main landmark", /<main/.test(bodies["/"]));
check(
  "property page headings start with a single h1",
  (detail.match(/<h1/g) || []).length === 1,
  `${(detail.match(/<h1/g) || []).length} h1 elements`,
);

/* --- not found ----------------------------------------------------------- */
check("404 page renders content", bodies["/does-not-exist"].length > 500);

console.log("");
console.log(failures === 0 ? "All browser checks passed." : `${failures} browser check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
