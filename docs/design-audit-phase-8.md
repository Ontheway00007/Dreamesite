# Phase 8 design audit

Applies two external agent skills to the public site:

- [emilkowalski/skills](https://github.com/emilkowalski/skills) (`emil-design-eng`, `review-animations/STANDARDS.md`) for the motion and interaction layer.
- [tasteskill](https://github.com/leonxlnx/taste-skill) (`taste-skill`) for layout, typography, colour and its Section 14 pre-flight matrix.

Content from both skills was rephrased for compliance with licensing restrictions.

## Design read

Reading this as: **redesign of an existing premium-consumer property site in Preserve mode**, for buyers browsing homes in Melbourne's northern growth corridor, with a warm editorial language, leaning toward the project's own Tailwind v4 token system rather than any new dependency.

Dial reading of the site as it stands, per taste Section 11.B (`match existing`, not the baseline):

| Dial | Existing | Target | Note |
| --- | --- | --- | --- |
| `DESIGN_VARIANCE` | 8 | 8 | The asymmetric 12-column grid and edge-to-edge lead project already earn this. No change. |
| `MOTION_INTENSITY` | 9 | 6 | The single largest problem. Phase 7A set out to be "intensity 9/10" and shipped six-plus simultaneous hover animations per card. Emil's frequency table puts hover in the "remove or drastically reduce" band. |
| `VISUAL_DENSITY` | 3 | 3 | Section padding and whitespace are correct. No change. |

## Mode: Redesign - Preserve

Per taste Section 11.A this is not greenfield, so Section 11.C preservation rules outrank the skill's generic aesthetic bans. Four bans are **deliberately overridden**, with reasons:

| Skill rule | Verdict | Reason |
| --- | --- | --- |
| 4.2 Premium-consumer palette ban (bans beige + brass + espresso by name) | Overridden | This is the brand across eight phases, expressed as two full token themes. Section 11.C: an existing brand's colours are starting material, not optional input. Recolouring is a brand decision, not a design refinement. |
| 4.1 Serif discipline | Passes | Cormorant Garamond sits in the skill's approved rotation pool and is not one of the two banned display serifs. |
| 3.C `lucide-react` discouraged | Passes on override | The skill permits it when the project already depends on it. Swapping icon families would be a dependency change, not a visual one. |
| 4.11 Page theme lock | Passes on exception | `AvailableNow` inverts to `bg-foreground` exactly once, which is the allowed single colour-block story rather than random alternation. |
| 9.G Em-dash ban | Overridden in one place only | `app/layout.tsx` metadata title templates keep their em-dash. Section 11.F forbids changing SEO output silently. Every em-dash a visitor reads in page copy is gone. |

Modernisation followed the Section 11.D lever order: typography, then spacing and rhythm, then colour correctness, then motion. No information architecture, route slug, anchor id, nav label or form field was touched.

## Motion review

Emil's required review format, one row per class of issue.

| Before | After | Why |
| --- | --- | --- |
| `transition-all` at 15 call sites | `transition-[transform,opacity]`, `transition-colors`, etc. | `all` transitions every animatable property including layout-triggering ones. Name the properties. |
| `duration-[900ms]`, `duration-700`, `duration-500` on hover | `duration-(--duration-hover)` (200ms) and `duration-(--duration-base)` (320ms) | UI animations stay under 300ms. A 900ms image scale is still moving long after the cursor has left. |
| Six-plus simultaneous hover animations per card (four stacked `-translate-y` layers, scale, rotate, two gradient crossfades, gap growth, colour shifts) | One image scale, one overlay crossfade, one title colour, one arrow nudge | Hover is seen tens of times per day. Emil's frequency table says reduce drastically. The four-layer float was the "everything moves" tell. |
| `:active { transition: transform 100ms var(--ease-exit) }` where `--ease-exit` is `cubic-bezier(0.7, 0, 0.84, 0)` | `var(--ease-luxe)` at `--duration-press` (120ms) | `--ease-exit` is an ease-in curve. Ease-in on UI delays the exact moment the user is watching. Press feedback must be ease-out. |
| Press feedback gated inside `@media (max-width: 1023px)` | Applies at every width | Desktop had no press feedback at all. Every pressable element should acknowledge the press. |
| `Button` base carried only `active:translate-y-0` | plus `active:scale-[0.97]` | Cancelling the hover lift is not feedback. `scale(0.97)` is. |
| `motion-safe:animate-[fadeIn_0.6s_..._0.2s_both]` on a below-fold section | `Reveal` / `RevealGroup` (in-view) | A load-time keyframe with a 0.2s delay on a section three screens down finishes before the visitor arrives. The entrance was being spent on an empty viewport. |
| `motion-safe:animate-bounce` on a scroll arrow | Removed | An infinite loop with no state to communicate, on top of a banned pattern (taste 9.F). |
| `rotate-[0.5deg]` on image hover | Removed | Rotating photography of a real house reads as a glitch, not depth. |
| `opacity-0` CTA revealed only by `group-hover` | Always visible | Keyboard and touch visitors could never see "View project". The project's own `property-card.tsx` documents pairing `group-hover:` with `group-focus-within:`; this diverged from it. |
| Hover states with no focus equivalent | Every one paired with `group-focus-visible:` | A card that responds to a cursor and not to keyboard focus is only half-built. |
| `window.addEventListener("scroll", ...)` driving the header border | `IntersectionObserver` on a sentinel | taste 5.D hard ban. A scroll listener runs on every scroll frame to answer a question whose answer changes twice. |
| The `h1` scaling to `0.98` and dimming to 80% whenever a map marker was hovered | Colour-only state change on the third line | Receding the page's primary heading as a side effect of pointing at something else is the wrong trade, and transforming a `clamp()`-sized serif reflows the letterforms. |

Not changed, and why: `--ease-luxe` is `cubic-bezier(0.22, 1, 0.36, 1)`, which is already the strong ease-out Emil's standards recommend, so the easing tokens needed no new curves. Tailwind v4 already compiles `hover:` inside `@media (hover: hover)`, so the hover-gating check passes without the unused `.hover-desktop-only` utility. `use-gsap.ts` already no-ops under reduced motion with `context.revert()` cleanup.

## Correctness bugs the audit surfaced

These are not taste calls. They are broken output.

| Bug | Location | Effect |
| --- | --- | --- |
| `motion-safe:group-hover:text-black` inside a `bg-foreground` section | `available-now.tsx` | In the daylight theme `--foreground` is `#211e1a`, so the section is a dark panel. Hovering a card turned its title black on near-black. The heading disappeared. |
| `shadow-[0_8px_32px_-8px_rgba(194,147,91,0.3)]` | `available-now.tsx` | Literal brass. Ignores the daylight theme, which redefines every shadow with a warm brown base. Replaced with the `shadow-accent` token. |
| `bg-[#5b4635]`, `bg-[#2f2821]`, `rgba(255,255,255,.045)`, `rgba(0,0,0,.28)` | `construction-journey.tsx` | Hard-coded soil and shadow colours in the material studies. Invisible or muddy in the daylight theme. Replaced with tokens. |
| Hover-only CTA | `selected-projects.tsx` | See the motion table. Keyboard and touch users lost the call to action entirely. |

## Layout and hierarchy bugs the audit surfaced

Also not taste calls.

| Bug | Location | Effect |
| --- | --- | --- |
| `lg:col-span-7` / `lg:col-span-5` passed to `SecondaryProject`, which puts them on the anchor *inside* the grid child | `selected-projects.tsx` | The grid children are `RevealItem`s, so the spans were never seen by the `lg:grid-cols-12` grid. Both cards auto-placed into one column each and rendered at a twelfth of the container from `lg` up, wrapping one word per line. The section was visibly collapsed at every desktop width. Pre-existing on this branch, confirmed against `HEAD`. |
| An `h2` set to `text-display` | `service-areas-section.tsx` | `text-display` is the top of the scale; the page's `h1` is `text-heading-1`, one step below. That section heading rendered larger than the title of the page. Every homepage section `h2` is `text-heading-2` now, and item headings are `text-heading-3`, so the three levels match the tags. |
| Caption overlaid on the material study | `construction-journey.tsx` | Its contrast depended on whichever study was underneath. On the ground study it landed on the soil band, close enough in luminance to `--foreground-subtle` to be barely readable in daylight. It is a `figcaption` below the frame now, which also satisfies taste 9.F on captions belonging outside the image. |
| `group-hover:text-accent` proposed as the fix for the `text-black` bug | `available-now.tsx` | Measured before shipping: brass on the dark theme's pale panel is about 2.4:1, and daylight's darker brass on its dark panel about 3.2:1. The first fails outright; the second only passes while the heading counts as large text, which it does not at narrow viewports where the clamp bottoms out at 22px. Shipped as an underline instead, which costs no contrast in either theme. |

## Pre-flight matrix (taste Section 14)

Mechanical checks, with the counts that back them. Every count below was taken by grep against the tree, not estimated.

| Check | Result |
| --- | --- |
| Zero em-dashes in visible copy | Pass. 7 rendered strings fixed. Everything left is inside a code comment, plus the one documented SEO override. |
| Eyebrow count `<= ceil(sections / 3)` | Pass, after a fix. 6 homepage sections, budget 2, actual was **4** (`AvailableNow`, `ConstructionJourney`, `ServiceAreas`, `EnquirySection`) and they ran in four consecutive sections. Dropped the `ConstructionJourney` and `ServiceAreas` labels, leaving 2 at positions 3 and 6. |
| Shape consistency lock | Pass. The two `rounded-lg` anchors in `map-stage.tsx` are now `Button`s, and the panel CTA is `rounded-full`. Stated rule: actions are pills, cards are `rounded-xl` and up, rows inside a list or segmented rail stay `rounded-lg`. |
| Colour consistency lock | Pass. Brass is the only accent, and it is now the only accent in every hover state. `text-black` and a literal brass shadow previously broke it. |
| Scroll cues | Pass. The `Scroll` label and its bouncing arrow are gone. |
| Section-number eyebrows | Pass. Stage numbers are display numerals inside each stage, not `01 / STAGE` labels above headings. |
| `transition-all` | Pass. 15 to 0. |
| `window.addEventListener('scroll')` | Pass. 1 to 0. |
| Hover durations over 300ms | Pass. Roughly 25 to 0. |
| Only `transform` and `opacity` animated | Pass. The empty-state CTA animated `gap`, which is layout and forces reflow every frame; it is a `Button` with a translating arrow now. |
| Hero fits the viewport, no `h-screen` | Pass. `MapStage` already used `h-[100svh]`; no `h-screen` on any public route. |
| Reduced motion honoured | Pass. Global reduce block, `motion-safe:` prefixes and the `useGsap` no-op are all still in place, and the new press rule is inside a `no-preference` block. |
| Dark and light both defined | Pass. Every value added in this pass is a token. Both themes were opened and compared section by section, not just built. |
| Typography on one scale | Pass. 4 hard-coded `clamp()` sizes and 2 raw `text-xl sm:text-2xl` titles migrated onto `text-heading-1` / `-2` / `-3`. Zero `text-[clamp(...)]` left on public components. |
| Tracking values unified | 6 ad-hoc values to 3 tokens (`tracking-wordmark`, `tracking-eyebrow`, `tracking-label`) across 45 call sites. Zero `tracking-[...]` left on public components. |
| Micro font sizes unified | 5 ad-hoc values (`0.58`, `0.625`, `0.68`, `0.6875`, `0.7rem`) to 1 token (`text-label`). Zero `text-[0.…rem]` left on public components. Side effect worth noting: `StatusBadge`'s `sm` and `md` now share a font size and differ only in padding, since 10px uppercase was below comfortable legibility anyway. |
| One layout rhythm | Pass. `Container` gained a `stage` width and a third gutter step at `lg`. Four components no longer hand-roll `mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12`. |

## Dead code found

Unreferenced by any route, and each one a source of drift that the audit kept tripping over:

- `src/components/sections/hero.tsx` (retired by Phase 7A, replaced by `MapStage`)
- `src/components/sections/scroll-cue.tsx` (only consumer was `hero.tsx`; also a taste 9.F banned pattern)
- `src/components/sections/status-section.tsx` and `src/components/sections/status-showcase.tsx` (no page renders `StatusSection`)

Left in place rather than deleted, because deletion is a decision for whoever owns the phase plan and not a design refinement. Flagged here so the next pass can remove them.
