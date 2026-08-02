# Dreame

Premium animated property showcase for a residential building company operating
across northern Melbourne. This repository contains the production foundation:
design system, layout shell, animation infrastructure and configured data
clients. The interactive map and property system are built on top of it in the
next phase.

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
    motion/                Reveal / RevealGroup (Framer Motion), Parallax (GSAP)
    ui/                    Button, typography (Heading, Eyebrow, Text)
  hooks/
    use-gsap.ts            Scoped, auto-reverting GSAP contexts
  lib/
    animation/             Shared easings, durations, Framer variants, GSAP setup
    design/                Property status presentation tokens
    supabase/              Browser and server Supabase clients
    env.ts                 Typed, validated environment access
    site-config.ts         Brand details, navigation, service areas
    utils/cn.ts            Class merging aware of the custom type scale
  providers/
    smooth-scroll-provider.tsx   Lenis + ScrollTrigger integration
  types/                   Shared domain types
```

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

The palette is a dark luxury theme: near-black backgrounds, charcoal surfaces,
off-white text, warm sand neutrals and a brass accent. To change a status colour
or a surface tone, edit the variable in `globals.css` — nothing else.

Property status labels and descriptions live in
`src/lib/design/property-status.ts`, so the badges, filters and map markers added
later all read from one place.

## Animation

- `SmoothScrollProvider` creates the single Lenis instance, advances it from the
  GSAP ticker and calls `ScrollTrigger.update()` on scroll, so Lenis and
  ScrollTrigger never fight over the scroll position.
- `useSmoothScroll()` exposes `scrollTo` and `getLenis` and falls back to native
  scrolling when Lenis is not running.
- `useGsap()` runs animations inside a scoped `gsap.context` and reverts them on
  unmount, which prevents leaked ScrollTriggers during client navigation.
- Reveals use the shared variants in `src/lib/animation/variants.ts` so timing is
  consistent across the site.
- Every animation is skipped when the visitor has
  `prefers-reduced-motion: reduce` set; content remains fully visible.

Server Components are the default. `"use client"` appears only where a browser
API or animation runtime requires it: the header, the motion components, and the
smooth scroll provider.

## Deployment

Import the repository into Vercel, add the environment variables, and deploy. No
adapters or custom configuration are needed. `next.config.ts` automatically
allows `next/image` to load from your Supabase Storage public bucket once
`NEXT_PUBLIC_SUPABASE_URL` is set.
