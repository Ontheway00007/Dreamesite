# Dreame

Premium animated property showcase for a residential building company operating
across northern Melbourne. This repository contains the design system, the app
shell, the animation infrastructure and the marketing homepage. The interactive
map and the Supabase-backed property system are built on top of it next.

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

The anon key is designed to be public, so keep row level security enabled on
every Supabase table. Restrict the Mapbox token to your domains before launch.

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

| Route                | What it is                                                        |
| -------------------- | ----------------------------------------------------------------- |
| `/`                  | Marketing homepage                                                |
| `/properties`        | The map and listing experience                                    |
| `/properties/[slug]` | Temporary property page, replaced by the full detail page in Phase 4 |

`lib/routes.ts` builds every internal path.

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

Every record passes through `lib/properties/privacy.ts` on the way out, which is
what makes the privacy rules enforceable rather than aspirational:

| Precision     | Published position                                  |
| ------------- | --------------------------------------------------- |
| `exact`       | Passed through — only for homes on the market        |
| `approximate` | Rounded to ~110 m, enough for the right neighbourhood |
| `private`     | No coordinates at all; the home stays in the list    |

Sold and completed homes are forced down to `approximate` even if the record
says `exact`, because they are someone's residence. Unusable coordinates are
dropped rather than published as a broken pin. The UI labels any reduced pin as
"Approximate location" so it never implies street-level accuracy.

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
    properties/            Repository, filters, location privacy (+ tests)
    supabase/              Browser and server Supabase clients
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
| `content/properties.ts`  | Ten fictional concept façades with demonstration coordinates, so the map and cards could be built. Replace with real records, and review each `locationPrecision`, before launch. |
| `/properties/[slug]`     | A deliberately minimal placeholder page so card links never 404. Phase 4 replaces it with the full detail page.                                                                 |

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
