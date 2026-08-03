# Dreame

Premium animated property showcase for a residential building company operating
across northern Melbourne. The site reads property data from Supabase when it is
configured, and falls back to committed demonstration fixtures when it is not.

## Stack

| Concern          | Choice                                              |
| ---------------- | --------------------------------------------------- |
| Framework        | Next.js 16 (App Router, Turbopack, Server Components) |
| Language         | TypeScript (strict)                                 |
| Styling          | Tailwind CSS v4 with a CSS-variable design system    |
| Data             | Supabase (`@supabase/ssr` browser + server clients)  |
| Maps             | Mapbox GL JS                                        |
| Animation        | Framer Motion, GSAP + ScrollTrigger                 |
| Smooth scrolling | Lenis, driven by the GSAP ticker                    |
| Icons            | Lucide                                              |
| Hosting          | Vercel (free tier compatible end to end)            |

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

The homepage renders without any environment variables. Supabase and Mapbox
values are only read when a feature that needs them is used, and a missing
variable throws a named error rather than failing silently.

## Environment variables

Set these in `.env.local` for development and in Vercel project settings for
deployments.

| Variable                          | Required     | Where to find it                                        |
| --------------------------------- | ------------ | ------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | for data     | Supabase → Project Settings → Data API → Project URL     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | for data     | Supabase → Project Settings → API Keys → anon / public   |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | for the map  | account.mapbox.com → Tokens → public token (`pk.…`)      |
| `NEXT_PUBLIC_MAPBOX_STYLE`        | optional     | A Mapbox Studio style URL. Defaults to `mapbox://styles/mapbox/dark-v11` |
| `NEXT_PUBLIC_SITE_URL`            | recommended  | Your canonical origin, e.g. `https://dreame.com.au`      |

The anon key is designed to be public — RLS is what limits what it can see.
Restrict the Mapbox token to your domains before launch.

## Data sources

The property repository is a dispatcher over two sources implementing the same
contract (`src/lib/properties/source.ts`):

- **Supabase** whenever both `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. Public catalogue reads go through
  the anon key plus row-level security; server-only flows never use the
  service key for user-facing reads.
- **Local fixtures** (`src/content/properties.ts`) for development, tests and
  CI when Supabase is not configured.

Production with Supabase configured but unreachable degrades to the empty
catalogue rather than silently shipping demonstration data; detailed errors
stay in server logs.

## Database setup

The CLI is the supported path. On a machine with the Supabase CLI installed:

```bash
# authenticate and link
supabase login
supabase link --project-ref <your-project-ref>

# apply the schema, policies and storage setup in one go
supabase db push

# generated TypeScript row types, dropped into src/types/database.ts
supabase gen types typescript --linked > src/types/database.ts

# against a local stack instead:
supabase start
supabase db reset         # re-applies migrations and runs supabase/seed.sql
```

When the CLI is unavailable, run the files in `supabase/migrations/` in order
against the SQL editor, then `supabase/seed.sql` to load the demonstration
records. Never edit an applied migration — add a new one.

## Storage

A public bucket `property-media` is created by migration `0004`. Files follow
`properties/<property-id>/<kind>/<uuid>.<ext>` and anonymous uploads are
denied: only `SELECT` policies exist for `anon`/`authenticated` until admin
uploads arrive in Phase 6. Architectural placeholders are not moved into the
bucket — they remain drawn locally.

## Caching

The three catalogue routes — `/`, `/properties` and `/properties/[slug]` —
are statically generated with a five-minute revalidation
(`revalidate = 300`). This means:

- Every response serves from the Next.js Data Cache until it expires; the
  Supabase reads behind them do not run per request.
- A lot of editing activity in a five-minute window refreshes at most one
  request per route, so the database is shielded from browse traffic spikes.
- Admin edits become visible no more than five minutes after they save, and
  no webhook is needed for the current traffic level. When richer tag-based
  invalidation is warranted, `revalidatePath("/properties")` /
  `revalidatePath("/properties/[slug]")` from a future Supabase webhook
  replaces the time-based rule.

## Scripts

```bash
npm run dev        # development server (Turbopack)
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run lint:fix   # ESLint with autofix
npm run typecheck  # tsc --noEmit
npm test           # Vitest, run once
```

CI runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` and
`npm run build` on every push and pull request. See
`.github/workflows/ci.yml`. The build needs no secrets.

## Routes

| Route                | What it is                                     |
| -------------------- | ---------------------------------------------- |
| `/`                  | Marketing homepage                             |
| `/properties`        | The map and listing experience                 |
| `/properties/[slug]` | Property page                                  |

`lib/routes.ts` builds every internal path. A property page can link back to the
map with `?property=<slug>`, which opens that home's preview on arrival.

## Property pages

Server-rendered end to end, except the gallery, which only mounts once a home has
more than one image. Every section is driven by the property's own data and a
section with nothing to show renders nothing — no "coming soon" placeholders.

| Section          | Appears when                                            |
| ---------------- | ------------------------------------------------------- |
| Hero             | always — status, address, summary, actions               |
| Showcase         | always — photography, or the architectural drawing       |
| Overview         | the record has a `description`                           |
| Specifications   | always — measured figures only, nothing estimated        |
| Build progress   | always — derived from the four documented build stages   |
| Location         | always — published location and privacy statement        |
| Tour, footage, downloads | the record has a tour, drone video or documents   |
| Testimonials     | the record has testimonials                              |
| Enquiry          | always                                                   |
| More homes       | other properties exist                                   |

The future-ready fields are already in the model, so each of these becomes
available by adding data rather than by changing code:

- **Virtual tours and drone video** — `visuals` entries with a `kind`, hosted in
  Supabase Storage or linked externally.
- **Brochures and floor plan PDFs** — `documents` entries; only those that
  resolve to a file are rendered.
- **Construction timeline** — derived from `currentStageId` against the published
  process, so a home cannot claim a stage that does not exist.
- **AI-generated descriptions** — `description.source: "ai-assisted"` renders a
  disclosure line; nothing is passed off as human writing.
- **Testimonials** — published only with a customer's permission, which is why the
  demonstration data has none.
- **Display homes** — `displayHome` adds a badge and an optional opening note.

## The property map

`/properties` is a Server Component that loads properties and renders the page
shell plus a full server-rendered listing. The interactive explorer hydrates on
top of it.

- **One filtering pipeline.** `lib/properties/filters.ts` is pure and is called
  once in `PropertyExplorer`. The list, the result count and the map all read
  that single result, so they cannot disagree. The selected property is derived
  from the filtered list, which means filtering something out deselects it
  automatically.
- **Clustering through Mapbox, not React.** One clustered GeoJSON source drives
  the cluster circles, counts, markers and the hover and selected rings. Hover
  and selection are layer filters on the promoted feature id, so they never
  trigger a React render. Adding hundreds of properties adds no components.
- **Marker shapes, not just colours.** Each status has its own silhouette —
  circle, triangle, diamond, ring — drawn on a canvas at runtime using the same
  CSS variables as the rest of the UI. A legend on the map decodes them.
- **Dynamic import.** Mapbox GL and its stylesheet load only when the map
  renders, and never on the server. The homepage ships none of it: its map
  section is a schematic with a link, not a live map.
- **URL state.** `status`, `suburb` and `beds` plus `view` live in the query
  string, so a filtered view can be shared. Values are validated on read.
- **Camera policy.** Fit to results on load and whenever the result set changes;
  ease to a selected property only when its pin is not already usable where it
  is; zoom to the expansion level on a cluster click; never move the camera while
  someone is simply reading. Durations drop to zero under reduced motion.
- **No token, no crash.** `getMapboxToken()` returns null instead of throwing,
  and the page renders a polished "map unavailable" panel beside a fully working
  list. Environment hints appear only in development.

## Property data and location privacy

`lib/properties/repository.ts` is the only way to read properties. It is already
asynchronous so Supabase can replace the local file in
`content/properties.ts` without touching a single component.

Every record passes through `lib/properties/privacy.ts` on the way out. That
module is the only place a stored position is read, and `toPublicProperty` is the
only way a property leaves the data layer, so the rules are enforceable rather
than aspirational.

### Location visibility

Each property chooses its own visibility. **Status has no influence on it** — a
sold home can be shown exactly, and a home for sale can be hidden.

| Visibility    | Published marker                                                            | Public label                    |
| ------------- | --------------------------------------------------------------------------- | ------------------------------- |
| `exact`       | The stored position                                                         | none                            |
| `approximate` | A fixed position within `privacyRadiusMeters` (100 m – 5 km)                | "Approximate location"          |
| `suburb`      | The suburb's reference position, derived from the suburb, not the property   | "Suburb only"                   |
| `hidden`      | No marker. The home stays in every list                                     | "Location available on enquiry" |

**How approximation works, and why it is safe.** The position is quantised to a
grid whose cell is the privacy radius, and the cell centre is published. Every
position inside a cell produces the same output, so the original cannot be
recovered — unlike a reversible offset, which anyone reading this repository
could undo. A small displacement derived from the *cell* is then applied so the
result does not sit on an obvious grid; because it depends only on the cell, it
adds no information about the home. The result is deterministic, so a marker
never moves between page loads.

**The radius is never published.** Public copy says the location "is
approximate" and "has been generalised on purpose", and nothing more. Quoting a
distance would invite a visitor to draw a circle and search inside it, and would
state a guarantee that depends on which grid cell a home happens to fall in. The
radius stays in the record; it does not appear in the public property object.

### Marker resolution, in precedence order

| Visibility  | Marker mode | Published marker                      |
| ----------- | ----------- | ------------------------------------- |
| `hidden`    | either      | none — hidden always wins              |
| any other   | `manual`    | the administrator's chosen coordinate  |
| `exact`     | `automatic` | the stored coordinate                  |
| `approximate` | `automatic` | the generalised coordinate           |
| `suburb`    | `automatic` | the suburb reference coordinate        |

A manual marker is a separate pair of fields, read but never written. The stored
private coordinate is never modified, and `lib/properties/privacy.ts` remains the
only module that transforms private location data.

### Directions policy

Directions default to allowed for `exact` and off for everything else, because
sending someone to a generalised marker either misleads them or narrows down the
home. `hidden` never offers them. An administrator can override any property, and
`lib/properties/privacy-validation.ts` flags an override that undermines the
marker.

### Configuration review

`validatePropertyPrivacy()` returns structured warnings — code, severity, field
and a message written for an administrator — for combinations that contradict each
other: a street address published with a hidden marker, directions enabled for a
generalised one, a manual marker with no position placed, a suburb with no
reference. It never throws and never changes a setting; a deliberate choice is
still applied. A test asserts the shipped data produces no warnings at all.

### Other per-property controls

- **Manual marker.** `publicMarkerMode: "manual"` publishes coordinates an
  administrator placed by hand. The stored position is never modified, and
  `hidden` still wins over a manual marker.
- **Address visibility.** House number, street, suburb and postcode are toggled
  independently, so "27 Example Street, Craigieburn VIC 3064", "Example Street",
  "Craigieburn VIC" and no address are all expressible. A house number is never
  published without its street.
- **Directions.** `allowDirections` gates the "Open in Maps" action, and it is
  withheld automatically when there is no marker to navigate to.

### Public and private data

`PropertyRecord` holds the private position, the address parts and the privacy
settings. `Property` holds neither: `toPublicProperty` copies public fields across
**explicitly** rather than spreading and deleting, so a field added to the record
later — an owner's phone number, an internal note — stays private until someone
deliberately publishes it.

The demonstration data is fictional: plan-type names, no street names or house
numbers, no invented prices or dates, and general coordinates chosen so no
position corresponds to a real private residence. It spans all four visibility
modes, and deliberately includes a sold home shown exactly and a completed home
hidden, to prove status never drives visibility. Replace the data and review
every `privacy` block before launch.

### Ready for the admin dashboard

`lib/properties/privacy-options.ts` holds the option metadata — labels,
descriptions, radii, address presets and runtime guards — that a future admin
form will render. No dashboard exists yet; the vocabulary lives beside the rules
so the dashboard and the public site can never describe a setting differently.

The demonstration data is fictional: plan-type names, no street addresses, no
invented prices or dates, and general coordinates chosen so no pin lands on a
real private residence. It must be replaced before launch.

## Project structure

```
src/
  app/
    properties/            Map and listing route, plus the temporary detail route
  components/
    layout/                Container, Section, SiteHeader, SiteFooter
    map/                   PropertyMap (dynamic), loader, fallback, legend
    media/                 ArchitecturalFrame line drawings (image placeholders)
    motion/                Reveal / RevealGroup (Framer), AnimatedText (CSS), Parallax (GSAP)
    property/              Card, list, filters, preview, sheets, explorer
    sections/              One file per homepage section
    ui/                    Button, SectionHeading, Statistic, Timeline, typography
  content/                 Editable content: properties, process, statistics
  hooks/
    use-gsap.ts            Scoped, auto-reverting GSAP contexts
    use-property-filters.ts  Filter and view state, synced to the URL
  lib/
    animation/             Shared easings, durations, Framer variants, GSAP setup
    design/                Property status presentation tokens
    images/                Supabase Storage URL resolution for property media
    map/                   Map config, GeoJSON building, marker artwork
    properties/            Data sources + repository + row mappers + filters + privacy (+ tests)
    supabase/              Browser, server and catalogue clients
    env.ts                 Typed, validated environment access
    routes.ts              Internal path construction
    site-config.ts         Brand details, navigation, service areas
    utils/cn.ts            Class merging aware of the custom type scale
  providers/
    app-providers.tsx            Client boundary: MotionConfig + smooth scroll
    smooth-scroll-provider.tsx   Lenis + ScrollTrigger integration
  types/                   Shared domain types
```

## Tests

`npm test` covers the pure logic the map and listing depend on: filtering and
URL round-tripping, GeoJSON generation, the location-privacy transform and slug
lookup. Tests live beside the code as `*.test.ts`. There is no component or
browser test setup — that would be a much heavier commitment than the current
surface justifies.

Every component takes typed props and no component reaches into global state.
Sections compose primitives; primitives never know which section they are in.

## Content to confirm before launch

Content lives in `src/content/` and `src/lib/site-config.ts` so copy can be
edited without touching components. Nothing unverified is published: the site
shows no figures for homes delivered, years operating, projects or satisfaction,
and no claims about awards, ratings or registrations.

Three things still need the business to confirm them:

| Where                    | What needs to happen                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site-config.ts`         | The email address and phone number are placeholders, and they are the only contact points on the site. Confirm both before launch.                        |
| `content/properties.ts`  | Ten fictional concept façades with demonstration coordinates, used only when Supabase is not configured. The live source is the database; replace this file with documentation once it is retired. |
| `supabase/seed.sql`      | The same concept content in database form. Replace with real records (and review every privacy setting) before public launch.                          |

The statistics section only publishes figures derived from data in this
repository — the number of core suburbs, statuses and build stages — so it cannot
drift out of date. Once a real figure is confirmed, add it to
`content/statistics.ts` and it appears automatically.

Service areas are the confirmed core suburbs: **Mickleham, Craigieburn and
Donnybrook**. Add another suburb only when the business supplies it; the list
feeds both the locations section and the statistics count.

## Images

No stock photography is used. Property media resolves in one place,
`lib/images/property-image.ts`:

1. A property with an `imagePath` renders that file from the public
   `property-media` Supabase Storage bucket through `next/image`.
2. A property without one renders an `ArchitecturalFrame` elevation drawing,
   captioned "Architectural preview" so a visitor knows it is a drawing rather
   than photography.

Adding photography is therefore a per-property data change, not a code change.
`next.config.ts` already allows the Supabase host once the URL is configured.

## Routes

`lib/routes.ts` builds every internal path. Property cards already link using
their real `slug`; because `/properties/[slug]` arrives with the property system,
`propertyHref()` currently resolves to the enquiry section instead of a dead URL.
Flip `PROPERTY_DETAIL_ROUTES_LIVE` when that route ships — no component changes.

## Design system

All colour, type, spacing, elevation and motion values are declared as CSS
variables in `src/app/globals.css`, then bridged into Tailwind utilities through
`@theme inline`. Components only ever use the semantic layer.

- **Surfaces**: `bg-background`, `bg-background-alt`, `bg-surface`,
  `bg-surface-raised`, `bg-surface-overlay`
- **Content**: `text-foreground`, `text-foreground-muted`,
  `text-foreground-subtle`, `text-foreground-inverse`
- **Accent**: `text-accent`, `bg-accent`, `bg-accent-strong`, `bg-accent-soft`
- **Type scale**: `text-display`, `text-heading-1` … `text-heading-3`,
  `text-lead`, `text-eyebrow`; `font-display` (Cormorant Garamond) and
  `font-sans` (Inter)
- **Status colours**: `bg-status-move-in-ready`, `bg-status-under-construction`,
  `bg-status-completed`, `bg-status-sold`
- **Motion**: `ease-luxe`, `ease-entrance`, `ease-exit`,
  `duration-(--duration-base)`

- **Textures**: `grain` (fine film grain) and `blueprint-grid` (architectural
  set-out grid), both defined as Tailwind utilities

The palette is a dark luxury theme: near-black backgrounds, charcoal surfaces,
off-white text, warm sand neutrals and a brass accent. To change a status colour
or a surface tone, edit the variable in `globals.css` — nothing else.

Property status labels and descriptions live in
`src/lib/design/property-status.ts`, so the badges, filters and map markers added
later all read from one place.

## Animation

Each layer has exactly one job, and each effect has exactly one owner:

| Layer                    | Owns                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| **CSS**                  | Load-time entrances (the hero sequence, word reveals, the scroll cue) and hover/focus states |
| **GSAP + ScrollTrigger** | Scroll-linked work only: the hero parallax layer and the process timeline                    |
| **Framer Motion**        | Stateful UI: status tabs, section reveals, the animated counters                             |
| **Lenis**                | Page scrolling, nothing else                                                                 |

- The hero entrance is one CSS choreography, staged with `--enter-delay` in
  `globals.css`. CSS was chosen over a JavaScript timeline deliberately: it starts
  with the first paint so nothing flashes, it survives with JavaScript disabled,
  it costs no bundle, and it removes any question of two systems fighting over
  the same sequence.
- `SmoothScrollProvider` owns the single Lenis instance, lets Lenis run its own
  frame loop, and forwards every scroll to `ScrollTrigger.update()`. It changes
  nothing global. `lib/animation/gsap.ts` is the only module permitted to touch
  GSAP's global configuration, and today it needs to touch none of it.
- `useSmoothScroll()` exposes `scrollTo` and `setPaused` and falls back to native
  scrolling — with an explicit `behavior: "auto"` — when Lenis is not running.
- `useGsap()` runs animations inside a scoped `gsap.context` and reverts them on
  unmount, which prevents leaked ScrollTriggers. It is for scroll-linked work
  only: server-rendered markup is already painted before React hydrates, so a
  JavaScript hook cannot hide content ahead of the first paint.
- The process timeline uses two ScrollTriggers for the whole section regardless
  of how many stages it holds.
- Animation directs attention rather than decorating: one entrance, one
  scroll-linked line, one parallax layer, and hover/focus feedback. Everything
  animated moves with transforms and opacity only.
- Reduced motion is handled at every layer: the entire CSS entrance block sits
  behind `prefers-reduced-motion: no-preference`, a reduce-motion rule collapses
  any remaining animation or transition to a single frame and forces instant
  anchor scrolling, GSAP and Lenis check the query and do nothing, and
  `MotionConfig reducedMotion="user"` covers Framer Motion.

Server Components are the default. `"use client"` appears only where a browser
API or React state is genuinely needed: the header, the status tabs, the
timeline, the counters, the parallax layer, the scroll cue, and the providers.
The hero, the property cards and every section wrapper render on the server.

## Deployment

Import the repository into Vercel, add the environment variables, and deploy. No
adapters or custom configuration are needed. `next.config.ts` automatically
allows `next/image` to load from your Supabase Storage public bucket once
`NEXT_PUBLIC_SUPABASE_URL` is set.
