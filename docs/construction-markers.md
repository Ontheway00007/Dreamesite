# Animated construction markers

Every home on the map builds itself out of an empty lot, up to the stage its own
data says it has reached, holds there, resets and repeats.

**On by default** across the public map — the homepage and `/properties`. The
earlier status marker system is kept rather than deleted, as
`markers="status"`: it is what the map falls back to if no sprite sheet can be
produced, and it is still the right choice for a surface that wants a static key.

`/lab/construction-markers` remains as the review surface — three properties with
known construction data, a frame-by-frame contact sheet, and a runtime-cost panel
that measures its own frame rate.

## Known gap

At the corridor view, which is where a visitor arrives, the basemap is very dark
and the homepage lays gradients over it. The miniatures are legible but they are
working against the background rather than with it. Making the geography more
visible — roads, locality structure, the estate grids — is what this feature is
still waiting on, and it is a change to the map style and the homepage overlays
rather than to the markers.

## The one stage mapping

`src/lib/properties/build-stage.ts` — `resolveBuildStage(property)`. Everything
that draws build progress reads this and nothing else. Three vocabularies
already described build position at three resolutions (`PropertyStatus`,
`CONSTRUCTION_STAGES`, `processStages` via `currentStageId`); this collapses them
into one answer plus its provenance.

Five drawable stages: `site`, `slab`, `frame`, `lock-up`, `complete`. Five and
not eight because `fixing` and `final-inspection` happen behind a finished
envelope — a marker cannot show them without inventing a difference.

Resolution order, strongest evidence first:

| Condition | Result | `source` |
| --- | --- | --- |
| Diary has an `in-progress` entry | that entry's stage | `recorded` |
| Status is `move-in-ready`, `completed` or `sold` | `complete` | `status` |
| Diary has `complete` entries | the furthest one | `recorded` |
| Diary has only `planned` entries | `site` | `recorded` |
| Otherwise, from `currentStageId` | see below | `process` |

Two decisions worth knowing about:

- **A diary with work under way outranks a finished status.** A home can be
  `sold` off the plan and still be a frame, and the map has to show the frame.
- **`currentStageId: "construction"` resolves to `slab`, not to a midpoint.**
  The coarse process stage spans site preparation to lock-up, so any single
  answer is a guess. `slab` is the earliest state such a home is certainly past.
  Understating is recoverable; claiming a frame that is not standing is not.
  `source` is `process` in this case, and `buildStageCaption` says so out loud.

Nothing here produces a percentage. `ConstructionStageRail` renders five named
segments for the same reason.

## Rendering: canvas sprite atlas + HTML markers

Evaluated: Mapbox custom layers, a second WebGL context, pre-rendered sprite
sequences, Lottie, Rive, glTF, shader-driven state, canvas sprites.

**Chosen:** one canvas-rendered sprite sheet (3 archetypes × 12 frames) drawn
once at map load, animated by moving `background-position` on one
`mapboxgl.Marker` per property, all driven by a single `requestAnimationFrame`
loop.

Why not a Mapbox symbol layer, which is what every other marker here uses: a
layout expression cannot read the clock or feature state, so every property
sharing a status would be locked to the same frame at the same moment. Advancing
them independently would mean rewriting the source data several times a second,
which re-clusters the whole collection on every write.

Why not Three.js or a glTF scene: the models are read at 40–56 px. A perspective
camera buys nothing a parallel projection does not, and the flat-shaded look of a
parallel projection *is* the reference — a physical massing model. Plain 2D
canvas paths get there with no runtime dependency.

Why the sheet is generated in the browser rather than shipped as a PNG: the
colours come from the same CSS custom properties as the rest of the interface, so
there is no second copy of the palette and the daylight theme gets a correctly
lit model without a second asset. It also ships no bytes. Cost is ~5 ms of canvas
work, once per theme, memoised for the life of the page.

Measured: **159 KB** sheet in memory, **0 bytes** shipped, **~5 ms** to render,
**no change** to the Mapbox bundle (no new dependency; `mapboxgl.Marker` was
already in it).

### Files

| File | Role |
| --- | --- |
| `lib/properties/build-stage.ts` | The stage mapping. One place. |
| `lib/map/maquette/archetypes.ts` | Massing of the three building types |
| `lib/map/maquette/geometry.ts` | Axonometric projection and solids |
| `lib/map/maquette/phases.ts` | Frame table, loop timing, per-id stagger |
| `lib/map/maquette/atlas.ts` | Renders the sheet; memoised per palette |
| `lib/map/maquette/colour.ts` | The colour arithmetic canvas needs |
| `components/map/construction-marker-layer.ts` | Markers, clock, interaction, clusters |
| `components/map/construction-markers.css` | Status cues, emphasis, reduced motion |
| `components/map/construction-stage-rail.tsx` | The stage read-out in the preview |

## Timing

Build 0.3–0.7 s per stage, then a **3.4 s hold**, then a 0.3 s dissolve. A
finished house is a 6.3 s cycle of which 3.4 s is rest, so the state a visitor is
most likely to see is the property's real one. Each property's offset into the
cycle is hashed from its id, so markers build at different moments and the result
is identical on every load and every device.

## Interaction

Hover, focus or tap resolves the marker to its real stage, stops the loop there,
enlarges it, sharpens its shadow and drops the other markers to 48% opacity.
Releasing re-bases the loop to the start of its hold rather than snapping to
wherever the shared clock is — otherwise letting go of a finished house could
drop it back to a slab.

Each marker is a real `<button>` with an accessible name (`name`, `suburb`,
status, stage — all fields the privacy projection publishes), so it is reachable
by keyboard and announced by a screen reader. A painted canvas icon cannot be.

## Reduced motion

No loop. Each marker renders directly at the property's real stage and stays
there. Everything remains interactive.

## Clusters

Overlapping homes are one architectural plinth with a count, never a pile of
miniatures. The neighbourhood is drawn into the same sprite sheet as the
buildings, on its own row, in three densities — so a cluster is lit and coloured
like the miniatures it stands in for. Its count is a caption *under* the plinth,
not a number over the roofs, where it collided with the massing and was
unreadable at every size.

Clustering itself is unchanged — the miniatures ask the existing clustered source
what it grouped, via `querySourceFeatures`.

`mapLayers.anchor` exists because of this: Mapbox only tiles a source that a
visible layer consumes, and this mode hides every layer that draws it. A
zero-radius circle keeps the source live without rasterising anything.

## Local verification without a Mapbox token

`public/dev/basemap-dark.json` is a CARTO dark raster style. Point
`NEXT_PUBLIC_MAPBOX_STYLE` at `/dev/basemap-dark.json` in `.env.local`, with any
`pk.` placeholder token, to review the markers against a real dark basemap with
real roads. Nothing in the application references the file. It has no `glyphs`,
so the cluster-count layer logs one error locally; that is the substitute style,
not the map.
