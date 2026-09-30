"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Map as MLMap, Marker, Popup, setWorkerUrl, type GeoJSONSource, type ImageSource, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LonLat, SimResult } from "@/lib/types";
import type { GeeLayer } from "@/lib/integrations/gee-types";
import { gridToDataUrl, rampExpression, RAMPS } from "@/lib/colors";
import { windRadiusPolygon } from "@/lib/models/wind";
import { ALERT_COLOR, kt, pct } from "@/lib/format";
import { ASSET_TYPE_LABEL } from "@/lib/data/infrastructure";

export type LayerKey =
  | "cone"
  | "members"
  | "radii"
  | "wind"
  | "p64"
  | "rain"
  | "surge"
  | "districts"
  | "assets"
  | "covers"
  | "gee_inundation"
  | "gee_imerg72"
  | "gee_gfsRain72"
  | "gee_gfsWind72"
  | "gee_population"
  | "gee_lecz";

export type LayerState = Record<LayerKey, boolean>;

export interface MapHandle {
  snapshot: () => string | null;
  flyTo: (lon: number, lat: number, zoom?: number) => void;
}

interface Props {
  result: SimResult | null;
  previewTrack: LonLat[] | null;
  layers: LayerState;
  basemap: "dark" | "satellite";
  timeIndex: number;
  geeLayers: Partial<Record<string, GeeLayer>>;
  selectedDistrictId: string | null;
  pickMode: boolean;
  customLandfall: { lat: number; lon: number } | null;
  onPick: (lat: number, lon: number) => void;
  onSelectDistrict: (id: string) => void;
  handleRef: MutableRefObject<MapHandle | null>;
}

// Worker modules are copied to /public by scripts/copy-maplibre-worker.mjs (postinstall).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const BLANK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const BLANK_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [80, 20],
  [80.01, 20],
  [80.01, 19.99],
  [80, 19.99],
];
const GEE_KINDS = ["lecz", "population", "imerg72", "gfsRain72", "gfsWind72", "inundation"] as const;
const TYPE_STROKE: Record<string, string> = {
  power_plant: "#fde047",
  substation: "#facc15",
  hospital: "#f472b6",
  shelter: "#34d399",
  port: "#60a5fa",
  road: "#e5e7eb",
};

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

function circlePolygon(lat: number, lon: number, rKm: number): LonLat[] {
  const out: LonLat[] = [];
  for (let a = 0; a <= 360; a += 10) {
    const b = (a * Math.PI) / 180;
    out.push([lon + (rKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(b), lat + (rKm / 110.57) * Math.cos(b)]);
  }
  return out;
}

export default function MapView(props: Props) {
  const { result, previewTrack, layers, basemap, timeIndex, geeLayers, selectedDistrictId, pickMode, customLandfall, onPick, onSelectDistrict, handleRef } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const stormMarker = useRef<Marker | null>(null);
  const landfallMarker = useRef<Marker | null>(null);
  const pickRef = useRef(pickMode);
  const cbRef = useRef({ onPick, onSelectDistrict });
  const resultRef = useRef(result);
  useEffect(() => {
    pickRef.current = pickMode;
    cbRef.current = { onPick, onSelectDistrict };
    resultRef.current = result;
  });

  // ---------- init ----------
  useEffect(() => {
    if (!container.current) return;
    const esri = (service: string) => [`https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`];
    const map = new MLMap({
      container: container.current,
      center: [88.8, 18.6],
      zoom: 4.7,
      minZoom: 3,
      maxZoom: 13,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true },
      style: {
        version: 8,
        sources: {
          dark: {
            type: "raster",
            tiles: esri("Canvas/World_Dark_Gray_Base"),
            tileSize: 256,
            maxzoom: 16,
            attribution: "Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors",
          },
          esri: {
            type: "raster",
            tiles: esri("World_Imagery"),
            tileSize: 256,
            attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#0b1120" } },
          { id: "base-dark", type: "raster", source: "dark" },
          { id: "base-sat", type: "raster", source: "esri", layout: { visibility: "none" }, paint: { "raster-saturation": -0.2, "raster-brightness-max": 0.8 } },
        ],
      },
    });
    mapRef.current = map;
    if (process.env.NODE_ENV === "development") (window as unknown as { __lfMap?: MLMap }).__lfMap = map;

    map.on("load", () => {
      for (const g of ["rain", "wind", "p64"]) {
        map.addSource(`grid-${g}`, { type: "image", url: BLANK_PNG, coordinates: BLANK_COORDS });
        map.addLayer({ id: `grid-${g}`, type: "raster", source: `grid-${g}`, paint: { "raster-opacity": 0.85, "raster-fade-duration": 0 }, layout: { visibility: "none" } });
      }
      const geo = (id: string) => map.addSource(id, { type: "geojson", data: EMPTY });
      ["cone", "radii", "coast", "members", "observed", "control", "covers", "roads", "districts", "assets", "preview", "pick"].forEach(geo);
      map.addLayer({ id: "cone-fill", type: "fill", source: "cone", paint: { "fill-color": "#e2e8f0", "fill-opacity": 0.08 } });
      map.addLayer({ id: "cone-line", type: "line", source: "cone", paint: { "line-color": "#e2e8f0", "line-opacity": 0.55, "line-width": 1, "line-dasharray": [3, 2] } });
      map.addLayer({
        id: "radii-fill",
        type: "fill",
        source: "radii",
        paint: {
          "fill-color": ["match", ["get", "kt"], 64, "#ef4444", 50, "#f97316", "#facc15"],
          "fill-opacity": 0.14,
        },
      });
      map.addLayer({
        id: "radii-line",
        type: "line",
        source: "radii",
        paint: { "line-color": ["match", ["get", "kt"], 64, "#ef4444", 50, "#f97316", "#facc15"], "line-width": 1.2 },
      });
      map.addLayer({
        id: "coast-line",
        type: "line",
        source: "coast",
        layout: { "line-cap": "round" },
        paint: {
          "line-color": rampExpression(RAMPS.twl.stops, "twl") as never,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 8, 7],
        },
      });
      map.addLayer({ id: "members-line", type: "line", source: "members", paint: { "line-color": "#cbd5e1", "line-opacity": 0.22, "line-width": 0.8 } });
      map.addLayer({ id: "observed-line", type: "line", source: "observed", paint: { "line-color": "#94a3b8", "line-width": 2, "line-dasharray": [1, 1.5] } });
      map.addLayer({ id: "control-line", type: "line", source: "control", paint: { "line-color": "#f8fafc", "line-width": 2.2 } });
      map.addLayer({
        id: "covers-line",
        type: "line",
        source: "covers",
        paint: { "line-color": "#a78bfa", "line-width": 1.4, "line-dasharray": [2, 2], "line-opacity": ["interpolate", ["linear"], ["get", "p"], 0, 0.35, 1, 1] },
      });
      map.addLayer({
        id: "roads-line",
        type: "line",
        source: "roads",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": rampExpression(RAMPS.loss.stops, "p", 100) as never, "line-width": 3, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "districts-circle",
        type: "circle",
        source: "districts",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "pop"], 3e5, 6, 1e7, 16],
          "circle-color": ["match", ["get", "alert"], "RED", ALERT_COLOR.RED, "ORANGE", ALERT_COLOR.ORANGE, "YELLOW", ALERT_COLOR.YELLOW, ALERT_COLOR.GREEN],
          "circle-opacity": ["match", ["get", "alert"], "GREEN", 0.25, 0.5],
          "circle-stroke-color": ["case", ["==", ["get", "selected"], 1], "#ffffff", "#0f172a"],
          "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 2.5, 1],
        },
      });
      map.addLayer({
        id: "assets-circle",
        type: "circle",
        source: "assets",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["+", 2, ["*", 0.6, ["get", "crit"]]], 9, ["+", 4, ["get", "crit"]]],
          "circle-color": rampExpression(RAMPS.loss.stops, "p", 100) as never,
          "circle-stroke-color": ["match", ["get", "type"], ...Object.entries(TYPE_STROKE).flat(), "#e5e7eb"] as never,
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({ id: "preview-line", type: "line", source: "preview", paint: { "line-color": "#f8fafc", "line-width": 1.6, "line-dasharray": [2, 2], "line-opacity": 0.7 } });
      map.addLayer({ id: "pick-circle", type: "circle", source: "pick", paint: { "circle-radius": 7, "circle-color": "#f43f5e", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      map.addSource("labels", { type: "raster", tiles: esri("Canvas/World_Dark_Gray_Reference"), tileSize: 256, maxzoom: 16 });
      map.addLayer({ id: "base-labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.9 } });
      setReady(true);
    });

    const popup = new Popup({ closeButton: false, closeOnClick: true, maxWidth: "280px", className: "lf-popup" });
    map.on("click", (e) => {
      if (pickRef.current) cbRef.current.onPick(e.lngLat.lat, e.lngLat.lng);
    });
    const showAsset = (e: MapLayerMouseEvent) => {
      if (pickRef.current) return;
      const f = e.features?.[0];
      const a = resultRef.current?.assets.find((x) => x.id === f?.properties?.id);
      if (!a) return;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="font-semibold text-slate-100">${a.name}</div>
           <div class="text-slate-400 text-xs mb-1">${ASSET_TYPE_LABEL[a.type]} · elev ${a.elevM} m · ${a.source === "osm" ? "OSM" : "seed registry"}</div>
           <div class="text-xs">P(functional loss) <b>${pct(a.pLoss)}</b> · dominant: <b>${a.dominant}</b></div>
           <div class="text-xs text-slate-400">wind ${kt(a.hazard.windMeanMs)} kt · depth ${a.hazard.depthMeanM} m · rain24 ${a.hazard.rain24MeanMm} mm · gales in ${a.hazard.galeOnsetH ?? "-"} h</div>`,
        )
        .addTo(map);
    };
    map.on("click", "assets-circle", showAsset);
    map.on("click", "roads-line", showAsset);
    map.on("click", "districts-circle", (e) => {
      if (pickRef.current) return;
      const id = e.features?.[0]?.properties?.id;
      if (id) cbRef.current.onSelectDistrict(String(id));
    });
    for (const l of ["assets-circle", "roads-line", "districts-circle"]) {
      map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", l, () => (map.getCanvas().style.cursor = pickRef.current ? "crosshair" : ""));
    }

    handleRef.current = {
      snapshot: () => {
        try {
          const src = map.getCanvas();
          const scale = Math.min(1, 1280 / src.width);
          const c = document.createElement("canvas");
          c.width = Math.round(src.width * scale);
          c.height = Math.round(src.height * scale);
          c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
          return c.toDataURL("image/jpeg", 0.85);
        } catch {
          return null;
        }
      },
      flyTo: (lon, lat, zoom = 8) => map.flyTo({ center: [lon, lat], zoom, speed: 1.4 }),
    };

    return () => {
      setReady(false);
      stormMarker.current = null;
      landfallMarker.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [handleRef]);

  // ---------- basemap & visibility ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("base-dark")) return;
    map.setLayoutProperty("base-dark", "visibility", basemap === "dark" ? "visible" : "none");
    map.setLayoutProperty("base-sat", "visibility", basemap === "satellite" ? "visible" : "none");
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("cone-fill", layers.cone);
    vis("cone-line", layers.cone);
    vis("members-line", layers.members);
    vis("radii-fill", layers.radii);
    vis("radii-line", layers.radii);
    vis("grid-wind", layers.wind);
    vis("grid-p64", layers.p64);
    vis("grid-rain", layers.rain);
    vis("coast-line", layers.surge);
    vis("districts-circle", layers.districts);
    vis("assets-circle", layers.assets);
    vis("roads-line", layers.assets);
    vis("covers-line", layers.covers);
    for (const k of GEE_KINDS) vis(`gee-${k}`, layers[`gee_${k}` as LayerKey]);
    map.getCanvas().style.cursor = pickMode ? "crosshair" : "";
  }, [ready, layers, basemap, pickMode]);

  // ---------- Earth Engine tile layers ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const k of GEE_KINDS) {
      const id = `gee-${k}`;
      const layer = geeLayers[k];
      const src = map.getSource(id) as { tiles?: string[] } | undefined;
      const current = src?.tiles?.[0];
      if (layer && current === layer.url) continue;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      if (!layer) continue;
      map.addSource(id, { type: "raster", tiles: [layer.url], tileSize: 256, attribution: layer.attribution });
      map.addLayer(
        {
          id,
          type: "raster",
          source: id,
          paint: { "raster-opacity": k === "lecz" ? 0.45 : k === "population" ? 0.6 : 0.8 },
          layout: { visibility: layers[`gee_${k}` as LayerKey] ? "visible" : "none" },
        },
        "grid-rain",
      );
    }
  }, [ready, geeLayers, layers]);

  // ---------- simulation result ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const setData = (id: string, data: GeoJSON.FeatureCollection) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
    if (!result) {
      for (const id of ["cone", "coast", "members", "observed", "control", "covers", "roads", "districts", "assets"]) setData(id, EMPTY);
      for (const g of ["rain", "wind", "p64"]) (map.getSource(`grid-${g}`) as ImageSource).updateImage({ url: BLANK_PNG, coordinates: BLANK_COORDS });
      landfallMarker.current?.remove();
      return;
    }
    setData("cone", fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [result.cone] } }]));
    setData(
      "members",
      fc(result.members.slice(1).map((m) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: m.coords } }))),
    );
    setData("observed", fc(result.observed.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: result.observed } }] : []));
    setData("control", fc([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: result.control.map((s) => [s.lon, s.lat]) } }]));
    const coastFeatures: GeoJSON.Feature[] = [];
    for (let i = 0; i < result.coast.length - 1; i++) {
      const a = result.coast[i];
      const b = result.coast[i + 1];
      const twl = Math.max(a.twlMean, b.twlMean);
      if (Math.max(a.surgeP90, b.surgeP90) < 0.3) continue; // show surge-affected coast only, not tide alone
      coastFeatures.push({ type: "Feature", properties: { twl }, geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] } });
    }
    setData("coast", fc(coastFeatures));
    setData(
      "covers",
      fc(
        result.covers
          .filter((c) => c.radiusKm > 0)
          .map((c) => ({ type: "Feature", properties: { p: c.pTrigger }, geometry: { type: "LineString", coordinates: circlePolygon(c.lat, c.lon, c.radiusKm) } })),
      ),
    );
    setData(
      "roads",
      fc(
        result.assets
          .filter((a) => a.path)
          .map((a) => ({ type: "Feature", properties: { id: a.id, p: a.pLoss }, geometry: { type: "LineString", coordinates: a.path! } })),
      ),
    );
    setData(
      "assets",
      fc(
        result.assets
          .filter((a) => !a.path)
          .sort((x, y) => x.pLoss - y.pLoss)
          .map((a) => ({ type: "Feature", properties: { id: a.id, p: a.pLoss, type: a.type, crit: a.criticality }, geometry: { type: "Point", coordinates: [a.lon, a.lat] } })),
      ),
    );
    const grids: [string, keyof SimResult["grids"], (typeof RAMPS)[keyof typeof RAMPS], number][] = [
      ["grid-wind", "wind", RAMPS.wind, 1 / 0.514444],
      ["grid-p64", "p64", RAMPS.p64, 100],
      ["grid-rain", "rain", RAMPS.rain, 1],
    ];
    for (const [id, key, ramp, scale] of grids) {
      const g = result.grids[key];
      (map.getSource(id) as ImageSource).updateImage({
        url: gridToDataUrl(g, ramp.stops, scale, key === "rain" ? 0.55 : 0.6),
        coordinates: [
          [g.west, g.north],
          [g.east, g.north],
          [g.east, g.south],
          [g.west, g.south],
        ],
      });
    }
    landfallMarker.current?.remove();
    if (result.landfall) {
      const el = document.createElement("div");
      el.className = "lf-landfall";
      el.title = "Control-forecast landfall";
      landfallMarker.current = new Marker({ element: el }).setLngLat([result.landfall.lon, result.landfall.lat]).addTo(map);
    }
    const lons = result.cone.map((c) => c[0]);
    const lats = result.cone.map((c) => c[1]);
    map.resize();
    map.fitBounds(
      [
        [Math.min(...lons) - 1, Math.min(...lats) - 1],
        [Math.max(...lons) + 1, Math.max(...lats) + 1],
      ],
      { padding: { top: 60, bottom: 90, left: 40, right: 40 }, duration: 900, maxZoom: 7 },
    );
  }, [ready, result]);

  // ---------- district styling (selection) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("districts") as GeoJSONSource | undefined;
    src?.setData(
      fc(
        (result?.districts ?? []).map((d) => ({
          type: "Feature",
          properties: { id: d.id, alert: d.alert, pop: d.population, selected: d.id === selectedDistrictId ? 1 : 0 },
          geometry: { type: "Point", coordinates: [d.lon, d.lat] },
        })),
      ),
    );
  }, [ready, result, selectedDistrictId]);

  // ---------- storm position & wind radii for current time ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const s = result?.control[Math.min(timeIndex, (result?.control.length ?? 1) - 1)];
    const src = map.getSource("radii") as GeoJSONSource | undefined;
    if (!s) {
      src?.setData(EMPTY);
      stormMarker.current?.remove();
      stormMarker.current = null;
      return;
    }
    const feats: GeoJSON.Feature[] = [];
    for (const k of [34, 50, 64]) {
      const ring = windRadiusPolygon(s, k);
      if (ring) feats.push({ type: "Feature", properties: { kt: k }, geometry: { type: "Polygon", coordinates: [ring] } });
    }
    src?.setData(fc(feats));
    if (!stormMarker.current) {
      const el = document.createElement("div");
      el.className = "lf-storm";
      el.innerHTML = `<svg viewBox="0 0 40 40" width="34" height="34"><g fill="none" stroke="#f8fafc" stroke-width="3" stroke-linecap="round"><path d="M20 6 C 30 6, 34 14, 32 20"/><path d="M20 34 C 10 34, 6 26, 8 20"/></g><circle cx="20" cy="20" r="5" fill="#f43f5e" stroke="#fff" stroke-width="2"/></svg>`;
      stormMarker.current = new Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
    } else stormMarker.current.setLngLat([s.lon, s.lat]);
  }, [ready, result, timeIndex]);

  // ---------- preview track & pick point ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("preview") as GeoJSONSource | undefined)?.setData(
      fc(previewTrack && previewTrack.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: previewTrack } }] : []),
    );
    (map.getSource("pick") as GeoJSONSource | undefined)?.setData(
      fc(customLandfall ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [customLandfall.lon, customLandfall.lat] } }] : []),
    );
  }, [ready, previewTrack, customLandfall, result]);

  // maplibre's stylesheet forces `position: relative` on the container, so size it from a wrapper
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
