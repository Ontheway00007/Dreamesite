# Phase 5 — Repository Understanding

Written after a full read of the working tree on `feat/phase-4-property-pages`
(including the Phase 4.1 corrections in commit `4387ea3`). Everything below is
grounded in the actual code, not assumptions.

---

## 1. Current application architecture

Next.js 16 App Router, React 19 Server Components by default. Three route
segments only:

- `src/app/page.tsx` — static marketing homepage. Renders sections including
  `FeaturedProperties` (async server component reading the repository).
- `src/app/properties/page.tsx` — listing + map explorer. Server component
  reads the full published list and hands it to the client-side
  `PropertyExplorer` inside a `<Suspense>` boundary whose fallback is the full
  server-rendered list (works without JavaScript).
- `src/app/properties/[slug]/page.tsx` — static (SSG via
  `generateStaticParams`), per-property detail with `generateMetadata`.

Tailwind CSS v4 design-token system, fonts via `next/font/google`, Lenis +
GSAP + Framer Motion animation, Mapbox GL for the map. No global state
manager; filter state lives in the URL query string.

## 2. Server/client boundaries

Client components (`"use client"`): site header, motion primitives
(`Reveal`, `Parallax`, `AnimatedText`), smooth-scroll provider, all of
`components/map/*` (Mapbox GL), `components/property/property-explorer.tsx`
and its sheet/toggle/preview children (URL-synced filters), and
`components/property/detail/property-gallery.tsx` (the only client component
on the detail page).

Everything data-bearing — cards, detail sections, featured properties, specs,
progress, resources, testimonials, location section — is a server component.
Browser code never fetches property data; it receives finished `Property`
objects as props from server components. There is no client-side data layer
to migrate.

## 3. Existing property types

`src/types/index.ts`:

- `PropertyBase` — public-everything: identity, summary, suburb/state, status,
  measurements (`bedrooms`, `bathrooms`, `carSpaces`, `landSize`, optional
  `houseSize`), `imagePath`, `placeholderVariant`, `completionLabel`,
  `priceDisplay`, `isFeatured`, plus optional detail content (`description`,
  `visuals`, `documents`, `testimonials`, `displayHome`, `currentStageId`).
- `PropertyRecord extends PropertyBase` — the private stored shape:
  adds `privateLatitude`, `privateLongitude`, `address` (parts),
  `privacy: PropertyPrivacySettings`. The file documents that this shape must
  never reach the browser.
- `Property extends PropertyBase` — the published shape: adds
  `location: PublicPropertyLocation`, nothing private.
- `PublicPropertyLocation` — visibility, optional `publicLatitude`/
  `publicLongitude`, `markerMode`, formatted public `address`,
  `allowDirections`, short `label`, fuller `accuracyNote`.
- `PropertyPreview` — the subset cards consume.
- `PropertyVisual` (photo | drone-video | virtual-tour | floorplan),
  `PropertyDocument`, `PropertyTestimonial`, `PropertyDescription`
  (now with the Phase 4.1 `PropertyParagraph` companion type),
  `DisplayHomeDetails`.
- Privacy setting types: `LocationVisibility` (exact | approximate | suburb |
  hidden), `PrivacyRadiusMeters` (100…5000), `PublicMarkerMode`
  (automatic | manual), `AddressVisibility`, `PropertyPrivacySettings`.

## 4. Existing privacy architecture

`src/lib/properties/privacy.ts` is the single transformation point:
`toPublicProperty(record: PropertyRecord): Property` copies public fields
explicitly (no spread-and-delete, deliberate) and derives `location` via
`resolvePublicLocation`:

- `hidden` → no coordinate, `allowDirections: false`.
- `manual` marker mode with valid manual coords → manual public coordinate.
- `suburb` → reference from `src/content/suburb-references.ts`.
- `approximate` → deterministic quantised marker (`approximateCoordinate`),
  with a comment explaining why quantising (not offsetting) is used.
- `exact` → the stored coordinate.

`resolveAllowDirections` + `defaultAllowDirections` decide directions; the
final flag also requires a coordinate to exist. `isValidCoordinate` guards
ranges (|lat| ≤ 90, |lng| ≤ 180, finite). `formatPublicAddress` builds the
address line from permitted parts only.

`src/lib/properties/privacy-validation.ts` reviews configurations and emits
structured warnings (11 codes) for the future admin UI — independent of
status, exactly the cases the Phase 5 brief lists.

`src/lib/properties/privacy-options.ts` is the admin-facing vocabulary:
options, radii, `isPrivacyRadius` / `isLocationVisibility` runtime guards —
the guards are exactly what I need to reconstruct
`PropertyPrivacySettings`/`PropertyAddressRecord` from database rows for the
validator.

## 5. Existing repository functions

`src/lib/properties/repository.ts` (already async, deliberately):

- `getProperties()` — all published, sorted by status showcase order then name.
- `getFeaturedProperties()` — `isFeatured` subset.
- `getPropertyBySlug(slug)` — one or `null`.
- `getPropertySlugs()` — for `generateStaticParams`.
- `getRelatedProperties(slug, limit)` — same suburb first, then others; the
  current property is excluded by slug.
- `descriptionBlocks(description)` — Phase 4.1 keyed content normaliser.

Consumers: homepage `FeaturedProperties`, `/properties` page (+ its Suspense
fallback), `/properties/[slug]` page (metadata + content + related). The map
explorer receives full `Property[]` from the page and filters client-side; it
never queries anything itself.

Suburb options derive from loaded properties (`suburbOptions` in
`filters.ts`) — data-driven already, no new repository call strictly needed.

## 6. Map and property-page dependencies

- Map: `propertiesToGeoJson` filters `isMappable` (valid public coords) and
  promotes `id`; `boundsOfProperties`; `countMappable`. Consumes `Property[]`
  only.
- Detail page: reads `property.location.*` (published shape only), gallery
  via `galleryVisuals(property)` (`src/lib/properties/media.ts`), resources
  via `virtualTour/droneVideo/propertyDocuments`, specs via
  `PropertyDetailSpecs`, progress via `resolveConstructionProgress(property)`.
- Media URLs: `propertyMediaUrl(path)` in `src/lib/images/property-image.ts`
  builds `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/property-media/<path>`
  and returns `null` when Supabase env is unset — this is the seam for
  graceful degradation.

## 7. Existing environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, `NEXT_PUBLIC_MAPBOX_STYLE`,
`NEXT_PUBLIC_SITE_URL`. Centralised in `src/lib/env.ts` with loud failure for
missing required values; `env.siteUrl` and `env.isIndexable` already handle
Vercel preview/production correctly. No service-role key anywhere — correct
for this phase.

The brief asks for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The installed
SDKs are `@supabase/supabase-js@2.111.0` and `@supabase/ssr@0.12.4`, whose
stable key type is the legacy **anon** key (`sb_publishable_*` keys are the
newer format; anon keys remain supported and are what `@supabase/ssr@0.12`
documents). Decision below (§17).

## 8. Testing and CI

Vitest 4 (`vitest run`), 6 suites, 91 tests: `geojson`, `filters`,
`privacy`, `privacy-validation`, `repository`, `construction-progress`.
CI (`.github/workflows/ci.yml`) = install → lint → typecheck → test → build
on Node 22, no secrets required. This must remain true.

## 9. Components that must remain unchanged

All presentational components: cards, detail sections, gallery, map
components, homepage sections, filter UI, explorers. The only layers I may
touch are the repository (swappable data source), one new mapping module, env
handling, and the content/fixture module.

## 10. Data contracts that must remain backward compatible

- `Property` / `PropertyPreview` / `MappableProperty` shapes consumed by UI.
- `getProperties/getFeaturedProperties/getPropertyBySlug/getPropertySlugs/
  getRelatedProperties` signatures (renaming to `getPublishedProperties`
  would force UI churn; the brief says "preserve wherever practical" so I add
  the new names alongside and keep the existing ones as thin aliases — see
  §18).
- `propertyMediaUrl` behaviour (null when unconfigured).
- `toPublicProperty` as the canonical public projection.

## 11. Proposed Supabase schema

Eleven tables (brief-specified), all in the default `public` schema:

`properties` (public-safe core incl. `description_blocks jsonb`,
`is_published`, `display_priority`), `property_private_locations` (1:1,
private), `property_location_settings` (1:1, admin-only), and the *derived*
`property_public_locations` (1:1, public-safe projection generated by the
server-side pipeline), `suburb_references`, `property_images`,
`property_features`, `construction_updates`, `property_resources`,
`property_testimonials`, `enquiries`.

Two deliberate divergences from the suggested field lists, both justified by
the existing pipeline:

1. **`property_public_locations` is generated, not authored.** The TS privacy
   transform is deterministic and pure, so a generator (server-side script,
   run after any settings change) writes the projection; public reads never
   join private tables. This keeps the browser unable to compute public from
   private *by construction*.
2. **The property detail content (`visuals`, `documents`, `testimonials`,
   `currentStageId`)** maps onto `property_images`, `property_resources`,
   `property_testimonials`; the process timeline stays derived from
   `current_stage_id` + `processStages` content (existing model, no schema
   change needed for the homepage). `construction_updates` is created per the
   brief as the future per-property updates feed; seed demonstrates it.

Text + CHECK constraints for statuses/visibility/radius instead of PG enums
(evolvable without migrations, per brief).

## 12. Mapping: TypeScript → tables

- `PropertyRecord` base fields → `properties`.
- `privateLatitude/Longitude`, `address` → `property_private_locations`.
- `privacy` → `property_location_settings` (allowDirections NULLABLE:
  NULL = unset → default applies, matching `allowDirections?: boolean`).
- `toPublicProperty` output's `location` → `property_public_locations`
  columns one-for-one (`visibility`, `public_latitude/longitude`,
  `public_address`, `location_label`, `accuracy_note`, `allow_directions`,
  plus `marker_mode` needed to rebuild the public shape).
- `visuals` (photos/floorplan) + hero `imagePath` → `property_images`.
  `virtual-tour`/`drone-video` visuals → `property_resources` (those kinds
  are links/media players in the UI today; the media.ts seam already treats
  them via `externalUrl`).
- `documents` → `property_resources`.
- `testimonials` → `property_testimonials`.
- `displayHome` → `properties.display_*` columns.
- `description.paragraphs` → `description_blocks jsonb`
  (`[{id, text}]`, the Phase 4.1 `PropertyParagraph` shape).

## 13. Public vs private boundaries

Browser-reachable (anon role): `properties` WHERE published, all child tables
WHERE parent published AND child published, `property_public_locations` WHERE
parent published, active `suburb_references`, INSERT-only on `enquiries`.
Everything else — no anon access at all (RLS enabled, no policies, grants
revoked where appropriate).

## 14. RLS strategy

`ENABLE ROW LEVEL SECURITY` everywhere. Public policies use
`TO anon, authenticated` with `USING (is_published)` on properties and
`EXISTS (SELECT 1 FROM properties p WHERE p.id = <fk> AND p.is_published)`
on children — child rows must not go public merely via their own
`is_published`. Private tables get **no** `anon` policy and **no**
`authenticated` policy in this phase (admin auth is Phase 6; absence of a
policy denies access under RLS). Enquiries: `INSERT` policy with
`WITH CHECK` forcing `status = 'new'`, non-empty name/email/message,
`consent_to_contact` present; no other statement type for anon.

## 15. Storage strategy

Bucket `property-media` (public read). Path convention
`properties/<property-id>/<kind>/<uuid>.<ext>` as briefed. Anonymous uploads,
updates and deletes denied: no INSERT/UPDATE/DELETE policies on
`storage.objects` for anon (only SELECT on the public bucket). The current
client stops generating a URL when env is unset; the bucket is empty in the
seeds, so the UI keeps rendering architectural placeholders — placeholders
are **not** uploaded.

## 16. Migration strategy

CLI unavailable on PATH. Per brief, I write plain SQL migrations following
the standard Supabase CLI convention (`supabase/migrations/<timestamp>_<name>.sql`)
split into five files: schema types+tables, indexes, triggers/updated_at,
RLS policies + grants, storage bucket + policy. Seed goes to
`supabase/seed.sql` (the CLI `db reset` convention). Types are committed as
`src/types/database.ts` (hand-maintained in CLI-unavailable environments,
documented generation command for when the CLI exists).

## 17. Local development and CI strategy

Repository resolves its source per request at module init:
Supabase when `NEXT_PUBLIC_SUPABASE_URL` + key are set (`dataSource = "supabase"`),
otherwise the existing local fixtures (`dataSource = "fixtures"`).

Missing config in **production** (`NODE_ENV=production`, `VERCEL_ENV=prod`):
published repo returns an empty list rather than fictional data, and pages
render the existing polished empty states; the build still succeeds because
repo calls tolerate unreachable Supabase by landing in the empty path after a
short timeout is avoided — instead: a single attempt, catch, log server-side,
return empty/null. Static generation therefore succeeds without secrets.

### Env var naming decision

SDKs here (`@supabase/supabase-js` 2.111.0, `@supabase/ssr` 0.12.4) use the
legacy anon key. I standardise on
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as the primary variable and read
`NEXT_PUBLIC_SUPABASE_ANON_KEY` as a deprecated fallback (code in
`src/lib/env.ts`), so both clear-key formats work without hardcoding the
key shape. `.env.example` documents both and states why.

> Note: the Phase 5 brief lists `enquiries` as a table but forbids building
> the form. The public **insert** policy therefore exists solely to be
> exercised by tests against a local Supabase; the UI keeps the mailto
> workflow untouched.

## 18. Main implementation risks

1. **Static generation against a live DB**: turning `getPropertySlugs` into a
   DB read means builds depend on Supabase uptime. Mitigation: keep
   build-time paths on fixtures when envs are missing; on failure degrade to
   zero slugs + dynamic route rendering is avoided *except* where Next needs
   `dynamicParams`. Property pages stay SSG against whatever source the
   build-time repo resolves to; when Supabase is set, `--` pages revalidate
   via `export const revalidate = 300` (ISR) so admin edits propagate without
   redeploys — a documented, non-experimental Next API.
2. **N+1**: avoided by PostgREST nesting (`select("*, images:property_images(...)"),`)
   executed server-side in a single request per repo call.
3. **Quotation drift in public projection**: solved by generating
   `property_public_locations` from the same TS transform the fixtures use
   (`scripts/generate-public-locations`), never duplicating the algorithm.
4. **Secrets leakage**: guarded by never selecting private tables in the
   repo; tests assert the property->public mapping never includes private
   fields (existing privacy tests carry this).
5. **Next 16 `cookies()` nuance**: server client stays as-is (Phase 4 code
   is already correct for `@supabase/ssr` 0.12 + Next 16's async `cookies()`).

## 19. Exact implementation sequence

1. `docs/phase-5-understanding.md` (this file).
2. `supabase/migrations/0001_schema.sql` … `0005_storage.sql`.
3. `supabase/seed.sql`.
4. `src/types/database.ts`.
5. `src/lib/env.ts` — publishable-key support + `isSupabaseConfigured`.
6. `src/lib/supabase/catalog.ts` — typed row sets / joins.
7. `src/lib/properties/mappers.ts` — rows → `Property` via `property_public_locations`
   (no private tables touched).
8. Repository split: `src/lib/properties/repository.ts` becomes a thin
   dispatcher over `local-repository.ts` (current fixture logic) and
   `supabase-repository.ts`; adds `getPublishedProperties` /
   `getPublishedPropertyBySlug` / `getSuburbOptions` aliases required by the
   brief.
9. Pages: add ISR `revalidate` where data now may change outside deploys.
10. Error/empty handling in the Supabase repository (log server-side, empty
    result set; keep 404 via `null`).
11. Tests: mapper tests, fallback tests, seed-shape tests and RLS/policy
    smoke tests that run against a live local Supabase **only when**
    `SUPABASE_TEST_URL` is present (skipped otherwise so CI stays green).
12. Docs: README update, `docs/database-schema.md`, `docs/privacy-data-flow.md`,
    `.env.example` update.
13. Full verification + diff review, single commit, push.

## 20. Phase 4.1 corrections status

All eight items are already committed at `4387ea3` on the starting branch and
verified in this branch's working tree (gallery buttons with `aria-pressed`,
priority only on the static showcase hero, absolute canonical/OG metadata,
validated coordinates for directions, softened consent copy, no hardcoded
stage counts, `PropertyParagraph` + `descriptionBlocks`, conditional
sections). No further Phase 4.1 work remains.
