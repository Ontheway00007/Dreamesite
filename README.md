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
```

## Project structure

```
src/
  app/                     Routes, root layout, global stylesheet
  components/
    layout/                Container, Section, SiteHeader, SiteFooter
    media/                 ArchitecturalFrame line drawings (image placeholders)
    motion/                Reveal / RevealGroup (Framer), AnimatedText (CSS), Parallax (GSAP)
    property/              PropertyCard, StatusBadge
    sections/              One file per homepage section
    ui/                    Button, SectionHeading, Statistic, Timeline, typography
  content/                 Editable page content, separate from components
  hooks/
    use-gsap.ts            Scoped, auto-reverting GSAP contexts
  lib/
    animation/             Shared easings, durations, Framer variants, GSAP setup
    design/                Property status presentation tokens
    images/                Supabase Storage URL resolution for property media
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

Every component takes typed props and no component reaches into global state.
Sections compose primitives; primitives never know which section they are in.

## Content to confirm before launch

Content lives in `src/content/` and `src/lib/site-config.ts` so copy can be
edited without touching components. Nothing unverified is published: the site
shows no figures for homes delivered, years operating, projects or satisfaction,
and no claims about awards, ratings or registrations.

Two things still need the business to confirm them:

| Where                    | What needs to happen                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site-config.ts`         | The email address and phone number are placeholders, and they are the only contact points on the site. Confirm both before launch.                        |
| `featured-properties.ts` | Three concept façades, presented as concepts in the section copy, so the card design could be reviewed. Replace with real records when the schema exists. |

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
