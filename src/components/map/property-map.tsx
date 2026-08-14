"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import mapboxgl from "mapbox-gl";
import type { GeoJSONSource, MapMouseEvent } from "mapbox-gl";

import "mapbox-gl/dist/mapbox-gl.css";

import { MapLegend } from "@/components/map/map-legend";
import { PropertyMapFallback } from "@/components/map/property-map-fallback";
import { propertyStatusOrder } from "@/lib/design/property-status";
import {
  boundsOfProperties,
  emptyFeatureCollection,
  propertiesToGeoJson,
} from "@/lib/map/geojson";
import {
  clusterConfig,
  getMapStyle,
  mapLayers,
  mapLimits,
  mapSource,
  NORTHERN_CORRIDOR_BOUNDS,
} from "@/lib/map/map-config";
import {
  createMarkerImages,
  markerImageId,
  markerImagePixelRatio,
  readCssColor,
  readMapPalette,
} from "@/lib/map/marker-images";
import { isMappable } from "@/lib/properties/privacy";
import { cn } from "@/lib/utils/cn";
import { isSiteTheme } from "@/lib/theme";
import type { Property } from "@/types";

/** Camera easing, skipped entirely for visitors who prefer reduced motion. */
function cameraDuration(base: number): number {
  if (typeof window === "undefined") {
    return 0;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : base;
}

export interface PropertyMapProps {
  /** Already-filtered properties. The map never filters again. */
  properties: readonly Property[];
  token: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Callback for hover state changes (three-way reaction system) */
  onHover?: (id: string | null) => void;
  /** Bumping this value re-fits the camera to the current results. */
  resetToken?: number;
  /**
   * The built-in status legend. Off where the surrounding interface already
   * explains status — the homepage status rail does, and drawing both put the
   * legend underneath the brand overlay where it was unreadable.
   */
  showLegend?: boolean;
  /**
   * Where the zoom controls sit. `top-right` collides with the site header on a
   * full-viewport map, so the homepage moves them to the bottom.
   */
  controlPosition?: "top-right" | "bottom-right";
  className?: string;
}

/**
 * The Mapbox surface.
 *
 * Loaded only through a dynamic import, so Mapbox GL and its stylesheet never
 * run on the server or reach a route without a map.
 *
 * Properties are drawn from one clustered GeoJSON source using Mapbox layers
 * rather than a React component per marker, so the same code handles ten
 * properties or a thousand. Hover and selection are layer filters keyed on the
 * promoted feature id, which keeps them off the React render path.
 */
export default function PropertyMap({
  properties,
  token,
  selectedId,
  onSelect,
  onHover,
  resetToken = 0,
  showLegend = true,
  controlPosition = "top-right",
  className,
}: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const selectRef = useRef(onSelect);
  const hoverRef = useRef(onHover);
  /*
    Read once, during map construction. A ref rather than a dependency so
    changing the prop cannot tear down and rebuild the whole map — the control
    position is a mount-time decision.
  */
  const controlPositionRef = useRef(controlPosition);
  const hoveredIdRef = useRef<string | null>(null);
  const fittedSignatureRef = useRef<string | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  /**
   * Records a failure. The state update is queued rather than applied inline so
   * that a synchronous constructor throw does not update state from inside an
   * effect body.
   */
  const reportError = useCallback((detail: unknown) => {
    if (process.env.NODE_ENV === "development") {
      console.error("[property-map]", detail);
    }

    queueMicrotask(() => setHasError(true));
  }, []);

  const geoJson = useMemo(() => propertiesToGeoJson(properties), [properties]);
  const geoJsonRef = useRef(geoJson);
  const bounds = useMemo(() => boundsOfProperties(properties), [properties]);
  const signature = useMemo(
    () => geoJson.features.map((feature) => feature.id).join("|"),
    [geoJson],
  );

  useEffect(() => {
    selectRef.current = onSelect;
    hoverRef.current = onHover;
    geoJsonRef.current = geoJson;
  }, [onSelect, onHover, geoJson]);

  /** Frames the current results, or the corridor when nothing matches. */
  const fitToResults = useCallback(
    (animate: boolean) => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      const duration = animate ? cameraDuration(700) : 0;

      if (!bounds) {
        map.fitBounds(NORTHERN_CORRIDOR_BOUNDS, {
          padding: mapLimits.fitPadding,
          duration,
        });
        return;
      }

      const isSinglePoint =
        bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1];

      map.fitBounds(bounds, {
        padding: mapLimits.fitPadding,
        duration,
        maxZoom: isSinglePoint
          ? mapLimits.singlePropertyZoom
          : mapLimits.selectionZoom,
      });
    },
    [bounds],
  );

  // Create the map once. Later updates mutate this instance.
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let map: mapboxgl.Map;
    let markerEntranceFrame = 0;
    let markerEntranceTimer: ReturnType<typeof setTimeout> | null = null;

    const currentTheme = () => {
      const theme = document.documentElement.dataset.theme;
      return isSiteTheme(theme) ? theme : "dark";
    };

    try {
      map = new mapboxgl.Map({
        accessToken: token,
        container,
        style: getMapStyle(currentTheme()),
        bounds: NORTHERN_CORRIDOR_BOUNDS,
        fitBoundsOptions: { padding: mapLimits.fitPadding },
        minZoom: mapLimits.minZoom,
        maxZoom: mapLimits.maxZoom,
      });
    } catch (error) {
      reportError(error);
      return;
    }

    mapRef.current = map;

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      controlPositionRef.current,
    );

    const onStyleLoad = () => {
      const palette = readMapPalette();
      const availabilityColor = readCssColor(
        "--status-move-in-ready",
        palette.accent,
      );

      for (const { id, image } of createMarkerImages(palette)) {
        if (!map.hasImage(id)) {
          map.addImage(id, image, { pixelRatio: markerImagePixelRatio });
        }
      }

      map.addSource(mapSource.properties, {
        type: "geojson",
        data: geoJsonRef.current ?? emptyFeatureCollection,
        cluster: true,
        clusterRadius: clusterConfig.radius,
        clusterMaxZoom: clusterConfig.maxZoom,
        promoteId: "id",
      });

      map.addLayer({
        id: mapLayers.clusters,
        type: "circle",
        source: mapSource.properties,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": palette.surface,
          "circle-opacity": 0.94,
          "circle-radius": ["step", ["get", "point_count"], 18, 5, 22, 15, 27],
          "circle-stroke-width": 1,
          "circle-stroke-color": palette.accent,
        },
      });

      map.addLayer({
        id: mapLayers.clusterCount,
        type: "symbol",
        source: mapSource.properties,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 13,
        },
        paint: { "text-color": palette.foreground },
      });

      // Emphasis rings sit beneath the markers so the silhouettes stay crisp.
      map.addLayer({
        id: mapLayers.hovered,
        type: "circle",
        source: mapSource.properties,
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-radius": 15,
          "circle-color": palette.foreground,
          "circle-opacity": 0.16,
        },
      });

      map.addLayer({
        id: mapLayers.selected,
        type: "circle",
        source: mapSource.properties,
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-radius": 19,
          "circle-color": palette.accent,
          "circle-opacity": 0.2,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": palette.accent,
        },
      });

      // Only a home that can be occupied now emits an availability signal.
      // Historic and in-progress markers, and the map camera, remain still.
      map.addLayer({
        id: mapLayers.activity,
        type: "circle",
        source: mapSource.properties,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "status"], "move-in-ready"],
        ],
        paint: {
          "circle-radius": 17,
          "circle-color": availabilityColor,
          "circle-opacity": 0.16,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": availabilityColor,
          "circle-stroke-opacity": 0.42,
        },
      });

      map.addLayer({
        id: mapLayers.activityCore,
        type: "circle",
        source: mapSource.properties,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "status"], "move-in-ready"],
        ],
        paint: {
          "circle-radius": 11,
          "circle-color": availabilityColor,
          "circle-opacity": 0.16,
          "circle-blur": 0.45,
        },
      });

      map.addLayer({
        id: mapLayers.markers,
        type: "symbol",
        source: mapSource.properties,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": [
            "match",
            ["get", "status"],
            ...propertyStatusOrder.flatMap((status) => [
              status,
              markerImageId(status),
            ]),
            markerImageId("completed"),
          ],
          "icon-allow-overlap": true,
          "icon-size": 0.74,
        },
        paint: {
          // Markers start invisible for entrance animation
          "icon-opacity": 0,
        },
      });

      setIsReady(true);
      
      // The dimensional markers settle into the map rather than popping in.
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!prefersReduced) {
        if (markerEntranceTimer) {
          clearTimeout(markerEntranceTimer);
        }
        cancelAnimationFrame(markerEntranceFrame);
        markerEntranceTimer = setTimeout(() => {
          const startedAt = performance.now();
          const enter = (now: number) => {
            if (!map.getLayer(mapLayers.markers)) {
              return;
            }

            const raw = Math.min(
              Math.max((now - startedAt) / 820, 0),
              1,
            );
            const progress = 1 - Math.pow(1 - raw, 3);
            map.setLayoutProperty(
              mapLayers.markers,
              "icon-size",
              0.74 + progress * 0.26,
            );
            map.setPaintProperty(
              mapLayers.markers,
              "icon-opacity",
              progress,
            );

            if (raw < 1) {
              markerEntranceFrame = requestAnimationFrame(enter);
            }
          };
          markerEntranceFrame = requestAnimationFrame(enter);
        }, 220);
      } else {
        map.setLayoutProperty(mapLayers.markers, "icon-size", 1);
        map.setPaintProperty(mapLayers.markers, "icon-opacity", 1);
      }
    };

    const onError = (event: { error?: { message?: string } }) => {
      reportError(event.error?.message ?? "unknown map error");
    };

    map.on("style.load", onStyleLoad);
    map.on("error", onError);

    const themeObserver = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.attributeName === "data-theme")) {
        return;
      }

      setIsReady(false);
      map.setStyle(getMapStyle(currentTheme()));
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      themeObserver.disconnect();
      if (markerEntranceTimer) {
        clearTimeout(markerEntranceTimer);
      }
      cancelAnimationFrame(markerEntranceFrame);
      mapRef.current = null;
      fittedSignatureRef.current = null;
      hoveredIdRef.current = null;
      // Removing the map detaches every listener, source, layer and image, and
      // releases the WebGL context, so navigating away leaks nothing.
      map.remove();
    };
  }, [token, reportError]);

  // Interaction handlers, attached once the layers exist.
  useEffect(() => {
    const map = mapRef.current;

    if (!isReady || !map) {
      return;
    }

    const setHovered = (id: string | null) => {
      if (hoveredIdRef.current === id) {
        return;
      }

      hoveredIdRef.current = id;
      map.setFilter(mapLayers.hovered, [
        "==",
        ["get", "id"],
        id ?? "__none__",
      ]);
      
      // Call the hover callback for three-way reaction
      if (hoverRef.current) {
        hoverRef.current(id);
      }
    };

    const onMarkerEnter = (event: MapMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const id = event.features?.[0]?.properties?.id;
      setHovered(typeof id === "string" ? id : null);
    };

    const onMarkerLeave = () => {
      map.getCanvas().style.cursor = "";
      setHovered(null);
    };

    const onMarkerClick = (event: MapMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;

      if (typeof id === "string") {
        selectRef.current(id);
      }
    };

    const onClusterClick = (event: MapMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const source = map.getSource(mapSource.properties) as
        | GeoJSONSource
        | undefined;

      if (typeof clusterId !== "number" || !source) {
        return;
      }

      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error || zoom == null || feature?.geometry.type !== "Point") {
          return;
        }

        map.easeTo({
          center: feature.geometry.coordinates as [number, number],
          zoom,
          duration: cameraDuration(500),
        });
      });
    };

    const onClusterEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const onBackgroundClick = (event: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, {
        layers: [mapLayers.markers, mapLayers.clusters],
      });

      if (hits.length === 0) {
        selectRef.current(null);
      }
    };

    map.on("mouseenter", mapLayers.markers, onMarkerEnter);
    map.on("mousemove", mapLayers.markers, onMarkerEnter);
    map.on("mouseleave", mapLayers.markers, onMarkerLeave);
    map.on("click", mapLayers.markers, onMarkerClick);
    map.on("mouseenter", mapLayers.clusters, onClusterEnter);
    map.on("mouseleave", mapLayers.clusters, onMarkerLeave);
    map.on("click", mapLayers.clusters, onClusterClick);
    map.on("click", onBackgroundClick);

    return () => {
      map.off("mouseenter", mapLayers.markers, onMarkerEnter);
      map.off("mousemove", mapLayers.markers, onMarkerEnter);
      map.off("mouseleave", mapLayers.markers, onMarkerLeave);
      map.off("click", mapLayers.markers, onMarkerClick);
      map.off("mouseenter", mapLayers.clusters, onClusterEnter);
      map.off("mouseleave", mapLayers.clusters, onMarkerLeave);
      map.off("click", mapLayers.clusters, onClusterClick);
      map.off("click", onBackgroundClick);
    };
  }, [isReady]);

  // Push filtered results into the existing source.
  useEffect(() => {
    const map = mapRef.current;

    if (!isReady || !map) {
      return;
    }

    const source = map.getSource(mapSource.properties) as
      | GeoJSONSource
      | undefined;

    source?.setData(geoJson);
  }, [isReady, geoJson]);

  // Frame the results when the set of matches changes, not on every render.
  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (fittedSignatureRef.current === signature) {
      return;
    }

    const isFirstFit = fittedSignatureRef.current === null;
    fittedSignatureRef.current = signature;
    fitToResults(!isFirstFit);
  }, [isReady, signature, fitToResults]);

  // Explicit reset action from the toolbar.
  useEffect(() => {
    if (!isReady || resetToken === 0) {
      return;
    }

    fitToResults(true);
  }, [isReady, resetToken, fitToResults]);

  // Selection: highlight, and only move the camera when the pin is not usable
  // where it is. Manual panning is otherwise left alone.
  useEffect(() => {
    const map = mapRef.current;

    if (!isReady || !map) {
      return;
    }

    const selected = properties.find((property) => property.id === selectedId);

    map.setFilter(mapLayers.selected, [
      "==",
      ["get", "id"],
      selected?.id ?? "__none__",
    ]);

    if (!selected || !isMappable(selected)) {
      return;
    }

    const center: [number, number] = [
      selected.location.publicLongitude,
      selected.location.publicLatitude,
    ];
    const zoom = map.getZoom();
    const isVisible = map.getBounds()?.contains(center) ?? false;

    if (isVisible && zoom >= clusterConfig.maxZoom) {
      return;
    }

    map.easeTo({
      center,
      zoom: Math.min(Math.max(zoom, clusterConfig.maxZoom + 0.5), mapLimits.selectionZoom),
      duration: cameraDuration(600),
    });
  }, [isReady, selectedId, properties]);

  // The map lives in a panel that resizes with the layout and the view toggle.
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;

    if (!isReady || !map || !container) {
      return;
    }

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => observer.disconnect();
  }, [isReady]);

  // A restrained availability pulse. It animates the signal, never the
  // camera, and pauses while somebody is inspecting a property.
  useEffect(() => {
    const map = mapRef.current;

    if (
      !isReady ||
      !map ||
      !map.getLayer(mapLayers.activity) ||
      !map.getLayer(mapLayers.activityCore)
    ) {
      return;
    }

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || selectedId !== null) {
      map.setPaintProperty(mapLayers.activity, "circle-radius", 17);
      map.setPaintProperty(mapLayers.activity, "circle-opacity", 0.1);
      map.setPaintProperty(mapLayers.activity, "circle-stroke-opacity", 0.28);
      map.setPaintProperty(mapLayers.activityCore, "circle-radius", 11);
      map.setPaintProperty(mapLayers.activityCore, "circle-opacity", 0.14);
      return;
    }

    let animationFrame = 0;
    const animate = (time: number) => {
      if (
        mapRef.current !== map ||
        !map.getLayer(mapLayers.activity) ||
        !map.getLayer(mapLayers.activityCore)
      ) {
        return;
      }

      const progress = (Math.sin(time / 700 - Math.PI / 2) + 1) / 2;
      map.setPaintProperty(
        mapLayers.activity,
        "circle-radius",
        17 + progress * 17,
      );
      map.setPaintProperty(
        mapLayers.activity,
        "circle-opacity",
        0.24 * (1 - progress),
      );
      map.setPaintProperty(
        mapLayers.activity,
        "circle-stroke-opacity",
        0.68 * (1 - progress),
      );
      map.setPaintProperty(
        mapLayers.activityCore,
        "circle-radius",
        10.5 + (1 - progress) * 2.5,
      );
      map.setPaintProperty(
        mapLayers.activityCore,
        "circle-opacity",
        0.1 + (1 - progress) * 0.16,
      );
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isReady, selectedId]);

  return (
    <div className={cn("relative isolate h-full w-full", className)}>
      {/*
       * `data-lenis-prevent` hands wheel and touch gestures to Mapbox inside
       * this element, so smooth scrolling and map panning never fight. The rest
       * of the page keeps its normal Lenis scrolling.
       */}
      <div
        ref={containerRef}
        data-lenis-prevent
        className={cn(
          "h-full w-full [&_.mapboxgl-ctrl-group]:border-border [&_.mapboxgl-ctrl-group]:bg-surface [&_.mapboxgl-ctrl-group]:border [&_.mapboxgl-ctrl-group_button+button]:border-t-border [&_.mapboxgl-ctrl-group_button]:!bg-transparent [&_.mapboxgl-ctrl-icon]:invert",
          controlPosition === "top-right" &&
            "[&_.mapboxgl-ctrl-top-right]:!top-[calc(var(--header-height)+1rem)]",
        )}
      />

      {showLegend && isReady && !hasError ? (
        <MapLegend className="absolute top-4 left-4 z-10" />
      ) : null}

      {!isReady && !hasError ? (
        <div
          className="bg-background-alt absolute inset-0 grid place-items-center"
          role="status"
        >
          <p className="text-foreground-subtle text-xs font-medium tracking-label uppercase">
            Loading map
          </p>
        </div>
      ) : null}

      {hasError ? (
        <div className="bg-background absolute inset-0">
          <PropertyMapFallback reason="error" className="border-0" />
        </div>
      ) : null}
    </div>
  );
}
