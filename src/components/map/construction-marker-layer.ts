import mapboxgl from "mapbox-gl";
import type { Map as MapboxMap } from "mapbox-gl";

import "@/components/map/construction-markers.css";

import {
  getMaquetteAtlas,
  LOT_CENTRE_IN_CELL,
  type MaquetteAtlas,
} from "@/lib/map/maquette/atlas";
import {
  buildDurationMs,
  cycleDurationMs,
  FINAL_FRAME_FOR_STAGE,
  loopOffsetMs,
  loopPositionAt,
  type LoopPhaseName,
} from "@/lib/map/maquette/phases";
import {
  BUILD_STAGES,
  BUILD_STAGE_LABELS,
  resolveBuildStage,
  type PropertyBuildState,
} from "@/lib/properties/build-stage";
import { propertyStatusTokens } from "@/lib/design/property-status";
import { isMappable } from "@/lib/properties/privacy";
import type { MappableProperty, Property } from "@/types";

/**
 * The animated construction markers.
 *
 * ## Why HTML markers rather than a Mapbox layer
 *
 * Every other marker on this map is a Mapbox symbol layer, and for a static icon
 * that is the right answer — one layer draws any number of properties on the GPU.
 * It cannot draw this, though. A symbol layer picks its icon with a data
 * expression, and layout expressions cannot read feature state or the clock, so
 * every property sharing a status would be locked to the same frame at the same
 * moment. Advancing them independently would mean rewriting the source data
 * several times a second, which re-clusters the whole collection on every write.
 *
 * The requirement is per-property animation state, and the DOM already has that:
 * one element per property, each with its own frame, and a shared clock deciding
 * what that frame is. Clustering keeps the count bounded — beyond the cluster
 * zoom there are never more than a few dozen individual markers on screen — so
 * the usual objection to HTML markers does not apply here.
 *
 * It also makes the markers real controls. A `<button>` is focusable, has an
 * accessible name, responds to Enter and Space, and shows a focus ring, none of
 * which a painted icon on a canvas can do without being reimplemented.
 *
 * ## Cost per frame
 *
 * The clock runs one `requestAnimationFrame` for the whole map and evaluates each
 * marker's position with integer arithmetic. A marker whose frame has not changed
 * is not touched at all. When one has, the write is a single
 * `background-position` — no layout, no paint of new geometry, just a different
 * window onto an image that is already decoded and uploaded.
 */

/** How often the clock re-evaluates. Frames last 100ms or more, so 20 checks a
 * second cannot miss one, and the loop does a fifth of the work of a 60Hz tick. */
const EVALUATE_EVERY_MS = 50;

/** Camera-aware sizing. Below the near zoom the model simplifies by shrinking. */
const SCALE_AT_FAR_ZOOM = 0.66;
const SCALE_AT_NEAR_ZOOM = 1.18;
const FAR_ZOOM = 12;
const NEAR_ZOOM = 16;

/**
 * The logical size of one miniature, matching `--maquette-size` in the
 * stylesheet. Needed here only to convert the lot's position within its cell
 * into a Mapbox marker offset, so the model stands on its coordinate.
 */
const MAQUETTE_SIZE_PX = 54;

export interface ConstructionMarkerLayerOptions {
  readonly map: MapboxMap;
  /** The clustered GeoJSON source the ordinary markers already use. */
  readonly sourceId: string;
  readonly onSelect: (id: string | null) => void;
  readonly onHover: (id: string | null) => void;
  /** Cluster taps are handed back so the camera logic stays in one place. */
  readonly onClusterExpand: (
    clusterId: number,
    coordinates: [number, number],
  ) => void;
}

interface MarkerEntry {
  readonly marker: mapboxgl.Marker;
  readonly root: HTMLButtonElement;
  readonly sprite: HTMLElement;
  readonly state: PropertyBuildState;
  /** Where in the shared cycle this marker sits. Re-based when a pause ends. */
  offsetMs: number;
  /** The last frame written, so unchanged frames cost nothing. */
  frame: number;
  loop: LoopPhaseName | null;
  paused: boolean;
}

interface ClusterEntry {
  readonly marker: mapboxgl.Marker;
  readonly root: HTMLButtonElement;
  count: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The sprite-sheet offset for a cell, as percentages.
 *
 * Percentages rather than pixels because the element is scaled by a transform:
 * a pixel offset would have to be recomputed on every zoom change, and a
 * percentage never does.
 */
function backgroundPositionFor(
  atlas: MaquetteAtlas,
  column: number,
  row: number,
): string {
  const x = atlas.columns > 1 ? (column / (atlas.columns - 1)) * 100 : 0;
  const y = atlas.rows > 1 ? (row / (atlas.rows - 1)) * 100 : 0;

  return `${x}% ${y}%`;
}

export class ConstructionMarkerLayer {
  private readonly map: MapboxMap;
  private readonly options: ConstructionMarkerLayerOptions;

  private atlas: MaquetteAtlas | null = null;
  private properties: readonly MappableProperty[] = [];
  private byId = new Map<string, MappableProperty>();
  private markers = new Map<string, MarkerEntry>();
  private clusters = new Map<number, ClusterEntry>();

  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private reduceMotion = prefersReducedMotion();

  private frameHandle = 0;
  private lastEvaluatedAt = 0;
  private destroyed = false;

  private readonly motionQuery: MediaQueryList | null =
    typeof window === "undefined"
      ? null
      : window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(options: ConstructionMarkerLayerOptions) {
    this.options = options;
    this.map = options.map;

    this.handleViewChange = this.handleViewChange.bind(this);
    this.handleZoom = this.handleZoom.bind(this);
    this.handleMotionPreference = this.handleMotionPreference.bind(this);
    this.tick = this.tick.bind(this);

    this.map.on("moveend", this.handleViewChange);
    this.map.on("idle", this.handleViewChange);
    this.map.on("sourcedata", this.handleViewChange);
    this.map.on("zoom", this.handleZoom);
    this.motionQuery?.addEventListener("change", this.handleMotionPreference);
  }

  /**
   * Renders the sprite sheet and starts the clock. Returns false when no atlas
   * could be produced, which the caller treats as "keep the existing markers".
   */
  async start(): Promise<boolean> {
    const atlas = await getMaquetteAtlas();

    if (this.destroyed || !atlas) {
      return false;
    }

    this.atlas = atlas;
    this.handleZoom();
    this.sync();

    if (!this.reduceMotion) {
      this.frameHandle = requestAnimationFrame(this.tick);
    }

    return true;
  }

  setProperties(properties: readonly Property[]): void {
    this.properties = properties.filter(isMappable);
    this.byId = new Map(this.properties.map((property) => [property.id, property]));
    this.sync();
  }

  setSelected(id: string | null): void {
    if (this.selectedId === id) {
      return;
    }

    this.selectedId = id;
    this.applyEmphasis();
  }

  setHovered(id: string | null): void {
    if (this.hoveredId === id) {
      return;
    }

    this.hoveredId = id;
    this.applyEmphasis();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameHandle);

    this.map.off("moveend", this.handleViewChange);
    this.map.off("idle", this.handleViewChange);
    this.map.off("sourcedata", this.handleViewChange);
    this.map.off("zoom", this.handleZoom);
    this.motionQuery?.removeEventListener("change", this.handleMotionPreference);

    for (const entry of this.markers.values()) {
      entry.marker.remove();
    }
    this.markers.clear();

    for (const entry of this.clusters.values()) {
      entry.marker.remove();
    }
    this.clusters.clear();

    this.map.getContainer().removeAttribute("data-maquette-focus");
    this.atlas?.dispose();
    this.atlas = null;
  }

  /* ---------------------------------------------------------------------- */
  /* Camera                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Sizes every marker from the current zoom with one write.
   *
   * The models must belong to the map, not float over it: at corridor zoom they
   * are small enough to leave the road network legible, and they only grow as a
   * visitor comes close enough for the extra structure to be worth reading.
   */
  private handleZoom(): void {
    const zoom = this.map.getZoom();
    const t = Math.min(
      1,
      Math.max(0, (zoom - FAR_ZOOM) / (NEAR_ZOOM - FAR_ZOOM)),
    );
    const scale =
      SCALE_AT_FAR_ZOOM + (SCALE_AT_NEAR_ZOOM - SCALE_AT_FAR_ZOOM) * t;

    this.map
      .getContainer()
      .style.setProperty("--maquette-scale", scale.toFixed(3));
  }

  private handleViewChange(): void {
    this.sync();
  }

  private handleMotionPreference(): void {
    this.reduceMotion = prefersReducedMotion();
    cancelAnimationFrame(this.frameHandle);

    if (this.reduceMotion) {
      // Settle every marker on its real stage and stop.
      for (const entry of this.markers.values()) {
        this.writeFrame(entry, FINAL_FRAME_FOR_STAGE[entry.state.stage], null);
        entry.root.dataset.static = "true";
      }
      return;
    }

    for (const entry of this.markers.values()) {
      delete entry.root.dataset.static;
    }
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  /* ---------------------------------------------------------------------- */
  /* Reconciling markers with what the source is actually showing            */
  /* ---------------------------------------------------------------------- */

  /**
   * Brings the set of markers into line with the clustered source.
   *
   * The source is the authority on what is a cluster and what is an individual
   * property, so this asks it rather than re-deriving clustering. Features arrive
   * per tile and can repeat across tile boundaries, hence the de-duplication.
   */
  private sync(): void {
    if (!this.atlas || this.destroyed || !this.map.getSource(this.options.sourceId)) {
      return;
    }

    let features;

    try {
      features = this.map.querySourceFeatures(this.options.sourceId);
    } catch {
      // The source exists but has no loaded tiles yet. The next `idle` retries.
      return;
    }



    const wantedProperties = new Set<string>();
    const wantedClusters = new Map<number, { count: number; at: [number, number] }>();

    for (const feature of features) {
      if (feature.geometry.type !== "Point") {
        continue;
      }

      const coordinates = feature.geometry.coordinates as [number, number];
      const count = feature.properties?.point_count;

      if (typeof count === "number") {
        const clusterId = feature.properties?.cluster_id;

        if (typeof clusterId === "number" && !wantedClusters.has(clusterId)) {
          wantedClusters.set(clusterId, { count, at: coordinates });
        }
        continue;
      }

      const id = feature.properties?.id;

      if (typeof id === "string" && this.byId.has(id)) {
        wantedProperties.add(id);
      }
    }

    for (const [id, entry] of this.markers) {
      if (!wantedProperties.has(id)) {
        entry.marker.remove();
        this.markers.delete(id);
      }
    }

    for (const id of wantedProperties) {
      if (!this.markers.has(id)) {
        const property = this.byId.get(id);

        if (property) {
          this.markers.set(id, this.createPropertyMarker(property));
        }
      }
    }

    for (const [clusterId, entry] of this.clusters) {
      if (!wantedClusters.has(clusterId)) {
        entry.marker.remove();
        this.clusters.delete(clusterId);
      }
    }

    for (const [clusterId, { count, at }] of wantedClusters) {
      const existing = this.clusters.get(clusterId);

      if (existing) {
        if (existing.count !== count) {
          existing.count = count;
          this.writeClusterCount(existing);
        }
        continue;
      }

      this.clusters.set(clusterId, this.createClusterMarker(clusterId, count, at));
    }

    this.applyEmphasis();
  }

  /* ---------------------------------------------------------------------- */
  /* Elements                                                               */
  /* ---------------------------------------------------------------------- */

  private createPropertyMarker(property: MappableProperty): MarkerEntry {
    const atlas = this.atlas;

    if (!atlas) {
      throw new Error("createPropertyMarker called before the atlas was ready");
    }

    const state = resolveBuildStage(property);
    const token = propertyStatusTokens[property.status];

    const root = document.createElement("button");
    root.type = "button";
    root.className = "dreame-maquette";
    root.dataset.status = property.status;
    root.dataset.state = "idle";
    root.style.setProperty(
      "--maquette-sheet-size",
      `${atlas.columns * 100}% ${atlas.rows * 100}%`,
    );
    root.style.setProperty(
      "--maquette-progress",
      // The arc shows the real position in the build, not an invented percentage.
      (state.stageIndex / (BUILD_STAGES.length - 1)).toFixed(3),
    );

    const halo = document.createElement("span");
    halo.className = "dreame-maquette__halo";
    halo.setAttribute("aria-hidden", "true");

    const ring = document.createElement("span");
    ring.className = "dreame-maquette__ring";
    ring.setAttribute("aria-hidden", "true");

    const sprite = document.createElement("span");
    sprite.className = "dreame-maquette__sprite";
    sprite.setAttribute("aria-hidden", "true");
    sprite.style.backgroundImage = `url(${atlas.url})`;

    const focusRing = document.createElement("span");
    focusRing.className = "dreame-maquette__focus";
    focusRing.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "sr-only";
    /*
      Only fields the privacy projection publishes. `name` and `suburb` are
      always public; the build stage comes from the canonical resolver, which
      reads nothing private.
    */
    label.textContent = `${property.name}, ${property.suburb}. ${token.label}. Build stage: ${BUILD_STAGE_LABELS[state.stage]}.`;

    root.append(halo, ring, sprite, focusRing, label);

    const entry: MarkerEntry = {
      marker: new mapboxgl.Marker({
        element: root,
        anchor: "center",
        // The coordinate belongs under the lot, which sits below the middle of
        // the cell, so the element is lifted by the difference.
        offset: [0, -(LOT_CENTRE_IN_CELL.y - 0.5) * MAQUETTE_SIZE_PX],
      }).setLngLat([
        property.location.publicLongitude,
        property.location.publicLatitude,
      ]),
      root,
      sprite,
      state,
      offsetMs: loopOffsetMs(property.id, state.stage),
      frame: -1,
      loop: null,
      paused: false,
    };

    // Pointer and keyboard both pause the loop: somebody inspecting a house
    // should not have it rebuild itself underneath them.
    const enter = () => {
      // Applied locally as well as reported, so the pause is immediate rather
      // than waiting for a round trip through React state.
      this.setHovered(property.id);
      this.options.onHover(property.id);
    };
    const leave = () => {
      this.setHovered(null);
      this.options.onHover(null);
    };

    root.addEventListener("pointerenter", enter);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("focus", enter);
    root.addEventListener("blur", leave);
    root.addEventListener("click", (event) => {
      // Otherwise the map's background click handler clears the selection this
      // click just made.
      event.stopPropagation();
      this.options.onSelect(property.id);
    });

    if (this.reduceMotion) {
      root.dataset.static = "true";
      this.writeFrame(entry, FINAL_FRAME_FOR_STAGE[state.stage], null);
    } else {
      this.writeFrame(entry, 0, "building");
    }

    entry.marker.addTo(this.map);

    return entry;
  }

  private createClusterMarker(
    clusterId: number,
    count: number,
    at: [number, number],
  ): ClusterEntry {
    const root = document.createElement("button");
    root.type = "button";
    root.className = "dreame-cluster";

    const plinth = document.createElement("span");
    plinth.className = "dreame-cluster__plinth";
    plinth.setAttribute("aria-hidden", "true");

    const stack = document.createElement("span");
    stack.className = "dreame-cluster__stack";
    stack.setAttribute("aria-hidden", "true");

    const countEl = document.createElement("span");
    countEl.className = "dreame-cluster__count";

    const labelEl = document.createElement("span");
    labelEl.className = "dreame-cluster__label";
    labelEl.setAttribute("aria-hidden", "true");
    labelEl.textContent = "HOMES";

    root.append(plinth, stack, countEl, labelEl);

    const entry: ClusterEntry = {
      marker: new mapboxgl.Marker({ element: root, anchor: "center" }).setLngLat(at),
      root,
      count,
    };

    this.writeClusterCount(entry);

    root.addEventListener("click", (event) => {
      event.stopPropagation();
      this.options.onClusterExpand(clusterId, at);
    });

    entry.marker.addTo(this.map);

    return entry;
  }

  private writeClusterCount(entry: ClusterEntry): void {
    const countEl = entry.root.querySelector(".dreame-cluster__count");

    if (countEl) {
      countEl.textContent = String(entry.count);
    }

    entry.root.setAttribute(
      "aria-label",
      `${entry.count} homes in this area. Activate to zoom in.`,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* The clock                                                              */
  /* ---------------------------------------------------------------------- */

  private tick(now: number): void {
    if (this.destroyed) {
      return;
    }

    if (now - this.lastEvaluatedAt >= EVALUATE_EVERY_MS) {
      this.lastEvaluatedAt = now;

      for (const entry of this.markers.values()) {
        if (entry.paused) {
          continue;
        }

        const position = loopPositionAt(entry.state.stage, now + entry.offsetMs);
        this.writeFrame(entry, position.frame, position.phase);
      }
    }

    this.frameHandle = requestAnimationFrame(this.tick);
  }

  /** The only place a marker's appearance is written. */
  private writeFrame(
    entry: MarkerEntry,
    frame: number,
    loop: LoopPhaseName | null,
  ): void {
    const atlas = this.atlas;

    if (!atlas) {
      return;
    }

    if (entry.frame !== frame) {
      entry.frame = frame;
      entry.sprite.style.backgroundPosition = backgroundPositionFor(
        atlas,
        frame,
        atlas.rowForArchetype[entry.state.archetype],
      );
    }

    if (entry.loop !== loop) {
      entry.loop = loop;

      if (loop === null) {
        delete entry.root.dataset.loop;
      } else {
        entry.root.dataset.loop = loop;
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Emphasis                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Applies hover and selection.
   *
   * Both resolve the marker to the property's real stage and stop the loop
   * there. A selected house does not finish building first: it is already
   * showing a fiction of its own past, and the moment somebody asks about it the
   * honest thing to show is the present.
   */
  private applyEmphasis(): void {
    const focusId = this.selectedId ?? this.hoveredId;
    const container = this.map.getContainer();

    if (focusId === null) {
      container.removeAttribute("data-maquette-focus");
    } else {
      container.setAttribute("data-maquette-focus", "true");
    }

    for (const [id, entry] of this.markers) {
      const isSelected = this.selectedId === id;
      const isActive = !isSelected && this.hoveredId === id;

      entry.root.dataset.state = isSelected
        ? "selected"
        : isActive
          ? "active"
          : "idle";

      const shouldPause = isSelected || isActive || this.reduceMotion;

      if (shouldPause === entry.paused) {
        continue;
      }

      entry.paused = shouldPause;

      if (shouldPause) {
        // Resolve immediately to the real stage and settle there, which is also
        // what lets the availability cue appear.
        this.writeFrame(
          entry,
          FINAL_FRAME_FOR_STAGE[entry.state.stage],
          "holding",
        );
        continue;
      }

      /*
        Resuming re-bases the loop so that it continues from the start of the
        hold rather than from wherever the shared clock happens to be. Without
        this, letting go of a finished house could snap it back to a slab, which
        looks like the marker changed its mind about the property.
      */
      const cycle = cycleDurationMs(entry.state.stage);
      const target = buildDurationMs(entry.state.stage);
      entry.offsetMs =
        ((target - performance.now()) % cycle + cycle) % cycle;
    }
  }
}
