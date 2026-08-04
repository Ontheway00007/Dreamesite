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
