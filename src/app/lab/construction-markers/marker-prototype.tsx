"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MapPropertyPanel } from "@/components/home/map-property-panel";
import { ConstructionStageRail } from "@/components/map/construction-stage-rail";
import { PropertyMapFallback } from "@/components/map/property-map-fallback";
import { PropertyMapLoader } from "@/components/map/property-map-loader";
import { getMaquetteAtlas, renderMaquetteFrame } from "@/lib/map/maquette/atlas";
import {
  ARCHETYPE_ORDER,
} from "@/lib/map/maquette/archetypes";
import {
  cycleDurationMs,
  FINAL_FRAME_FOR_STAGE,
  FRAMES,
  HOLD_MS,
} from "@/lib/map/maquette/phases";
import {
  BUILD_STAGE_LABELS,
  buildStageCaption,
  resolveBuildStage,
} from "@/lib/properties/build-stage";
import { propertyStatusTokens } from "@/lib/design/property-status";
import { cn } from "@/lib/utils/cn";
import type { ArchitecturalVariant, Property } from "@/types";

import { prototypeCases } from "@/app/lab/construction-markers/prototype-properties";

export interface MarkerPrototypeProps {
  properties: readonly Property[];
  token: string | null;
}

/**
 * The review surface for the animated construction markers.
 *
 * Deliberately not a designed page. It exists so that the three cases can be
 * judged against the data that produced them, on the real dark basemap, at real
 * marker size, before the system is allowed anywhere near the homepage.
 */
export function MarkerPrototype({ properties, token }: MarkerPrototypeProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showContactSheet, setShowContactSheet] = useState(false);

  const selected = useMemo(
    () => properties.find((property) => property.id === selectedId) ?? null,
    [properties, selectedId],
  );

  const handleClose = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border mx-auto max-w-[100rem] border-b px-5 pt-[calc(var(--header-height)+2rem)] pb-8 sm:px-8">
        <p className="text-accent text-eyebrow font-medium uppercase">
          Prototype · not a public page
        </p>
        <h1 className="font-display text-heading-1 mt-4 max-w-3xl font-light">
          Three markers, three real construction states.
        </h1>
        <p className="text-foreground-muted mt-5 max-w-2xl leading-relaxed">
          Each miniature starts from an empty lot and builds itself up to the
          stage the property&apos;s own data says it has reached — then holds,
          resets and repeats. Nothing below states a stage directly: every
          stopping point is worked out from the status and the build diary by one
          resolver.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* The map                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-label="Animated construction markers on the map"
        className="relative isolate h-[68svh] min-h-[30rem] w-full overflow-hidden"
      >
        {token === null ? (
          <PropertyMapFallback reason="no-token" className="rounded-none" />
        ) : (
          <PropertyMapLoader
            properties={properties}
            token={token}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            markers="construction"
            showLegend={false}
            controlPosition="bottom-right"
            className="h-full w-full"
          />
        )}

        {/*
          A gradient only where type sits. The brief for this phase is explicit
          that the geography must stay visible, so there is no full-surface
          scrim: roads, locality structure and the marker positions all read
          through.
        */}
        <div
          aria-hidden="true"
          className="from-background/70 pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent"
        />

        {selected ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden items-center px-8 lg:flex">
            <MapPropertyPanel
              key={selected.id}
              property={selected}
              onClose={handleClose}
              variant="panel"
              className="pointer-events-auto w-[24rem] motion-safe:animate-[map-panel-in_420ms_var(--ease-entrance)_both]"
            />
          </div>
        ) : null}

        {selected ? (
          <div className="absolute inset-x-0 bottom-0 lg:hidden">
            <MapPropertyPanel
              key={selected.id}
              property={selected}
              onClose={handleClose}
              variant="sheet"
              className="motion-safe:animate-[map-sheet-in_360ms_var(--ease-entrance)_both]"
            />
          </div>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* What each marker should be doing                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-[100rem] px-5 py-14 sm:px-8">
        <h2 className="font-display text-heading-3 font-light">
          The three cases
        </h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {properties.map((property) => {
            const detail = prototypeCases.find(
              (item) => item.id === property.id,
            );
            const state = resolveBuildStage(property);
            const token_ = propertyStatusTokens[property.status];
            const finalFrame = FINAL_FRAME_FOR_STAGE[state.stage];

            return (
              <article
                key={property.id}
                className="border-border bg-surface rounded-xl border p-5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg font-light">
                    {detail?.heading ?? property.name}
                  </h3>
                  <span
                    className={cn(
                      "text-[0.625rem] font-medium tracking-[0.16em] uppercase",
                      token_.textClassName,
                    )}
                  >
                    {token_.label}
                  </span>
                </div>

                <dl className="text-foreground-muted mt-4 space-y-2 text-sm">
                  <div>
                    <dt className="text-foreground-subtle text-[0.625rem] tracking-[0.18em] uppercase">
                      Data
                    </dt>
                    <dd>{detail?.data}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground-subtle text-[0.625rem] tracking-[0.18em] uppercase">
                      Expected loop
                    </dt>
                    <dd>{detail?.expected}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground-subtle text-[0.625rem] tracking-[0.18em] uppercase">
                      Resolved
                    </dt>
                    <dd className="text-foreground">
                      {BUILD_STAGE_LABELS[state.stage]} · {state.archetype} ·
                      frames 0–{finalFrame} ·{" "}
                      {(cycleDurationMs(state.stage) / 1000).toFixed(2)}s loop
                    </dd>
                  </div>
                </dl>

                <p className="text-foreground-subtle mt-3 text-xs">
                  {buildStageCaption(state)}
                </p>

                <ConstructionStageRail state={state} className="mt-5" />
              </article>
            );
          })}
        </div>
      </section>

      <PerformanceReadout markerCount={properties.length} />

      {/* ---------------------------------------------------------------- */}
      {/* Frame-by-frame review                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-[100rem] px-5 pb-20 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-heading-3 font-light">
            Every frame, every archetype
          </h2>
          <button
            type="button"
            onClick={() => setShowContactSheet((value) => !value)}
            className="border-border-strong text-foreground hover:border-foreground rounded-lg border px-4 py-2 text-sm"
            aria-expanded={showContactSheet}
          >
            {showContactSheet ? "Hide" : "Show"} contact sheet
          </button>
        </div>

        {showContactSheet ? <ContactSheet /> : null}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The measurements the review needs: how big the sprite sheet actually is, and
 * whether a map full of building houses holds its frame rate.
 */
function PerformanceReadout({ markerCount }: { markerCount: number }) {
  const [atlas, setAtlas] = useState<{ bytes: number; renderMs: number } | null>(
    null,
  );
  const [fps, setFps] = useState<number | null>(null);
  const [worstFrameMs, setWorstFrameMs] = useState<number | null>(null);
  const measuring = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void getMaquetteAtlas().then((value) => {
      if (!cancelled && value) {
        setAtlas({ bytes: value.byteLength, renderMs: value.renderMs });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const measure = useCallback(() => {
    if (measuring.current) {
      return;
    }

    measuring.current = true;
    setFps(null);

    const intervals: number[] = [];
    let previous = performance.now();
    const startedAt = previous;

    const step = (now: number) => {
      intervals.push(now - previous);
      previous = now;

      if (now - startedAt < 3000) {
        requestAnimationFrame(step);
        return;
      }

      // The first interval includes the click, so it is dropped.
      const samples = intervals.slice(1);
      const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      setFps(Math.round(1000 / mean));
      setWorstFrameMs(Math.round(Math.max(...samples)));
      measuring.current = false;
    };

    requestAnimationFrame(step);
  }, []);

  const rows = [
    { label: "Individual markers on screen", value: String(markerCount) },
    { label: "Sprite sheet frames", value: `${FRAMES.length} × ${ARCHETYPE_ORDER.length} archetypes` },
    {
      label: "Sprite sheet size",
      value:
        atlas === null
          ? "measuring…"
          : `${(atlas.bytes / 1024).toFixed(1)} KB PNG, generated at runtime`,
    },
    {
      label: "Sheet render time",
      value:
        atlas === null
          ? "measuring…"
          : `${atlas.renderMs.toFixed(1)} ms, once per theme`,
    },
    { label: "Shipped asset bytes", value: "0 — the sheet is drawn on a canvas" },
    { label: "Hold at real stage", value: `${(HOLD_MS / 1000).toFixed(1)}s per loop` },
    {
      label: "Measured frame rate",
      value:
        fps === null
          ? "not measured"
          : `${fps} fps average, worst frame ${worstFrameMs} ms`,
    },
  ];

  return (
    <section className="mx-auto max-w-[100rem] px-5 pb-14 sm:px-8">
      <div className="border-border bg-surface rounded-xl border p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-heading-3 font-light">
            Runtime cost
          </h2>
          <button
            type="button"
            onClick={measure}
            className="border-border-strong text-foreground hover:border-foreground rounded-lg border px-4 py-2 text-sm"
          >
            Measure 3s of frames
          </button>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="border-border border-t pt-3">
              <dt className="text-foreground-subtle text-[0.625rem] tracking-[0.18em] uppercase">
                {row.label}
              </dt>
              <dd className="text-foreground mt-1 text-sm tabular-nums">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Every frame of every archetype, drawn at review size and again at map size.
 *
 * The second row is the one that matters: a frame that reads beautifully at
 * 120 pixels and turns to mush at 54 is not usable, and the only way to know is
 * to look at it at 54.
 */
function ContactSheet() {
  return (
    <div className="mt-8 space-y-10">
      {ARCHETYPE_ORDER.map((archetype) => (
        <div key={archetype}>
          <h3 className="text-foreground-subtle text-[0.625rem] font-medium tracking-[0.2em] uppercase">
            {archetype}
          </h3>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {FRAMES.map((frame, index) => (
              <figure key={index} className="shrink-0">
                <div className="border-border bg-background-alt rounded-lg border p-1">
                  <FrameCanvas
                    archetype={archetype}
                    frameIndex={index}
                    displaySize={104}
                  />
                </div>
                <div className="mt-2 grid place-items-center">
                  <FrameCanvas
                    archetype={archetype}
                    frameIndex={index}
                    displaySize={54}
                  />
                </div>
                <figcaption className="text-foreground-subtle mt-1 text-center text-[0.5625rem] tracking-[0.1em] uppercase">
                  {index}
                  <br />
                  {frame.stage}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FrameCanvas({
  archetype,
  frameIndex,
  displaySize,
}: {
  archetype: ArchitecturalVariant;
  frameIndex: number;
  displaySize: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const ratio = 2;
    canvas.width = displaySize * ratio;
    canvas.height = displaySize * ratio;
    context.clearRect(0, 0, canvas.width, canvas.height);
    renderMaquetteFrame(context, archetype, frameIndex, displaySize, ratio);
  }, [archetype, frameIndex, displaySize]);

  return (
    <canvas
      ref={ref}
      style={{ width: displaySize, height: displaySize }}
      aria-hidden="true"
    />
  );
}
