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
    motion/                Reveal / RevealGroup (Framer), AnimatedText, Parallax (GSAP)
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

Content lives in `src/content/` so it can be edited without touching
components. Two files hold values that are **not** verified:

| File                     | What needs to happen                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `statistics.ts`          | `Homes delivered`, `Years building in the north` and `Typical build duration` are placeholders for layout. Replace with confirmed figures. |
| `featured-properties.ts` | Three invented "facade studies" so the cards can be designed. Replace with real property records once the Supabase schema exists.          |

Everything else — the status definitions, the build stages, the service areas —
describes process or geography and stays accurate as listings change. No claim
about awards, ratings, registrations or customer numbers appears anywhere in the
UI.

## Images

No stock photography is used. Property media resolves in one place,
`lib/images/property-image.ts`:

1. A property with an `imagePath` renders that file from the public
   `property-media` Supabase Storage bucket through `next/image`.
2. A property without one renders an `ArchitecturalFrame` elevation drawing and
   is labelled "Placeholder" in the card.

Adding photography is therefore a per-property data change, not a code change.
`next.config.ts` already allows the Supabase host once the URL is configured.

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

Each library has one job:

| Library           | Used for                                                              |
| ----------------- | --------------------------------------------------------------------- |
| **Lenis**         | Page scrolling, nothing else                                          |
| **GSAP + ScrollTrigger** | Scroll storytelling: the hero intro timeline, parallax, the process timeline, word reveals |
| **Framer Motion** | Interaction and UI state: hover, tabs, the mobile menu, counters, section reveals |

- `SmoothScrollProvider` owns the single Lenis instance and advances it from the
  GSAP ticker instead of its own `requestAnimationFrame`, so the page runs one
  frame loop. That integration is the one place GSAP's global lag smoothing is
  changed, because recovered frames otherwise make Lenis jump; the default is
  restored on cleanup.
- `useSmoothScroll()` exposes `scrollTo` and `setPaused` and falls back to native
  scrolling when Lenis is not running.
- `useGsap()` runs animations inside a scoped `gsap.context` before paint and
  reverts them on unmount, which prevents leaked ScrollTriggers and flashes of
  unanimated content.
- The process timeline uses two ScrollTriggers for the whole section regardless
  of how many stages it holds.
- Animation is used to direct attention, not decorate: the hero sequence, one
  scroll-linked line, and hover feedback on cards. Everything animated moves with
  transforms and opacity only.
- Reduced motion is respected three ways: GSAP and Lenis check the media query
  and do nothing, and `MotionConfig reducedMotion="user"` covers Framer Motion.
  Content is fully visible and interactive either way.

Server Components are the default. `"use client"` appears only where a browser
API or animation runtime requires it: the header, the hero, the status tabs, the
timeline, the counters, the property card, and the providers.

## Deployment

Import the repository into Vercel, add the environment variables, and deploy. No
adapters or custom configuration are needed. `next.config.ts` automatically
allows `next/image` to load from your Supabase Storage public bucket once
`NEXT_PUBLIC_SUPABASE_URL` is set.
