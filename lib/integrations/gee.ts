// Google Earth Engine integration (server-only): authenticated with a service-account key.
//
// Layers produced here are rendered in the map as XYZ tiles, and the same expressions feed
// population-exposure statistics and the hazard thumbnail sent to Gemini.

import "server-only";
import fs from "node:fs";
import { COASTLINE } from "../data/coast";
import { destination } from "../geo";
import type { CoastLevel, GeeLayer, LayerKind } from "./gee-types";

export type { CoastLevel, GeeLayer, LayerKind };

/* eslint-disable @typescript-eslint/no-explicit-any */
type EE = any;

export const PALETTES = {
  depth: ["#bae6fd", "#38bdf8", "#2563eb", "#7c3aed", "#c026d3"],
  rain: ["#c7d2fe", "#818cf8", "#4f46e5", "#7e22ce", "#db2777"],
  wind: ["#fde68a", "#f59e0b", "#ea580c", "#dc2626", "#7f1d1d"],
  pop: ["#fef3c7", "#fbbf24", "#f97316", "#dc2626", "#7f1d1d"],
};

let eePromise: Promise<EE> | null = null;
let lastError: string | null = null;

function loadKey(): { client_email: string; private_key: string; project_id?: string } | null {
  const file = process.env.GEE_SERVICE_ACCOUNT_KEY_FILE;
  const inline = process.env.GEE_SERVICE_ACCOUNT_KEY;
  try {
    if (file) return JSON.parse(fs.readFileSync(file, "utf8"));
    if (inline) {
      const text = inline.trim().startsWith("{") ? inline : Buffer.from(inline, "base64").toString("utf8");
      return JSON.parse(text);
    }
  } catch (e) {
    lastError = `Could not read Earth Engine service-account key: ${(e as Error).message}`;
  }
  return null;
}

export function geeConfigured(): boolean {
  return !!(process.env.GEE_SERVICE_ACCOUNT_KEY_FILE || process.env.GEE_SERVICE_ACCOUNT_KEY);
}

export async function getEE(): Promise<EE> {
  if (!geeConfigured()) throw new Error("Earth Engine is not configured (set GEE_SERVICE_ACCOUNT_KEY_FILE and GEE_PROJECT)");
  if (!eePromise) {
    eePromise = (async () => {
      const key = loadKey();
      if (!key) throw new Error(lastError ?? "Invalid Earth Engine key");
      const mod = await import("@google/earthengine");
      const ee: EE = (mod as any).default ?? mod;
      const project = process.env.GEE_PROJECT || key.project_id;
      await new Promise<void>((resolve, reject) => {
        ee.data.authenticateViaPrivateKey(
          key,
          () => ee.initialize(null, null, () => resolve(), (err: unknown) => reject(new Error(String(err))), null, project),
          (err: unknown) => reject(new Error(String(err))),
        );
      });
      return ee;
    })();
    eePromise.catch((e) => {
      lastError = (e as Error).message;
      eePromise = null;
    });
  }
  return eePromise;
}

function evaluate<T>(obj: EE): Promise<T> {
  return new Promise((resolve, reject) =>
    obj.evaluate((v: T, err?: string) => (err ? reject(new Error(err)) : resolve(v))),
  );
}

function mapUrl(img: EE, vis: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) =>
    img.getMapId(vis, (m: { urlFormat: string } | undefined, err?: string) =>
      err || !m ? reject(new Error(err ?? "getMapId failed")) : resolve(m.urlFormat),
    ),
  );
}

function thumbUrl(img: EE, params: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) =>
    img.getThumbURL(params, (url: string, err?: string) => (err ? reject(new Error(err)) : resolve(url))),
  );
}

let statusCache: { at: number; value: { configured: boolean; ok: boolean; error?: string; project?: string } } | null = null;

export async function geeStatus() {
  if (!geeConfigured()) return { configured: false, ok: false };
  if (statusCache && Date.now() - statusCache.at < 5 * 60_000) return statusCache.value;
  try {
    const ee = await getEE();
    await evaluate<number>(ee.Number(1).add(1));
    statusCache = { at: Date.now(), value: { configured: true, ok: true, project: process.env.GEE_PROJECT } };
  } catch (e) {
    statusCache = { at: Date.now(), value: { configured: true, ok: false, error: (e as Error).message } };
  }
  return statusCache.value;
}

// ---------------- surge inundation ----------------

function bearingOf(nx: number, ny: number): number {
  return (Math.atan2(nx, ny) * 180) / Math.PI;
}

/** Inland "surge influence" polygons, one per coastal segment, carrying water level and attenuation. */
function surgeZones(ee: EE, coast: CoastLevel[]) {
  const feats: EE[] = [];
  for (let i = 0; i < coast.length - 1; i++) {
    const a = coast[i];
    const b = coast[i + 1];
    const twl = Math.max(a.twl, b.twl);
    if (twl < 0.2) continue;
    const reach = Math.min(70, twl / Math.max(0.05, Math.min(a.atten, b.atten)) + 3);
    const ba = bearingOf(a.nx, a.ny);
    const bb = bearingOf(b.nx, b.ny);
    const [a0la, a0lo] = destination(a.lat, a.lon, ba + 180, 4);
    const [b0la, b0lo] = destination(b.lat, b.lon, bb + 180, 4);
    const [a1la, a1lo] = destination(a.lat, a.lon, ba, reach);
    const [b1la, b1lo] = destination(b.lat, b.lon, bb, reach);
    feats.push(
      ee.Feature(
        ee.Geometry.Polygon([[[a0lo, a0la], [b0lo, b0la], [b1lo, b1la], [a1lo, a1la], [a0lo, a0la]]]),
        { twl, atten: Math.min(a.atten, b.atten) },
      ),
    );
  }
  return ee.FeatureCollection(feats);
}

function inundationDepth(ee: EE, coast: CoastLevel[]) {
  const zones = surgeZones(ee, coast);
  const twl = zones.reduceToImage(["twl"], ee.Reducer.max());
  const atten = zones.reduceToImage(["atten"], ee.Reducer.min());
  const shoreline = ee.FeatureCollection([ee.Feature(ee.Geometry.LineString(COASTLINE))]);
  const distKm = shoreline.distance(90000, 100).divide(1000);
  const nasadem = ee.Image("NASA/NASADEM_HGT/001");
  const dem = nasadem.select("elevation");
  const land = nasadem.select("swb").eq(0);
  const level = twl.subtract(atten.multiply(distKm));
  const depth = level.subtract(dem).updateMask(land);
  return { depth: depth.updateMask(depth.gt(0.05)).rename("depth"), zones };
}

// ---------------- layers ----------------

export async function buildLayers(kinds: LayerKind[], coast?: CoastLevel[]) {
  const ee = await getEE();
  const layers: Partial<Record<LayerKind, GeeLayer>> = {};
  const errors: Partial<Record<LayerKind, string>> = {};
  const now = Date.now();

  await Promise.all(
    kinds.map(async (kind) => {
      try {
        if (kind === "inundation") {
          if (!coast?.length) throw new Error("No coastal water levels supplied");
          const { depth } = inundationDepth(ee, coast);
          layers.inundation = {
            url: await mapUrl(depth, { min: 0, max: 4, palette: PALETTES.depth }),
            label: "Modelled surge inundation depth (NASADEM terrain)",
            legend: { min: 0, max: 4, unit: "m", palette: PALETTES.depth },
            attribution: "Terrain: NASA NASADEM via Google Earth Engine",
          };
        } else if (kind === "imerg72") {
          const col = ee.ImageCollection("NASA/GPM_L3/IMERG_V07").select("precipitation");
          const latest = await evaluate<number>(col.filterDate(now - 20 * 86400e3, now).aggregate_max("system:time_start"));
          const img = col.filterDate(latest - 72 * 3600e3, latest + 1).sum().multiply(0.5);
          layers.imerg72 = {
            url: await mapUrl(img.updateMask(img.gt(5)), { min: 0, max: 300, palette: PALETTES.rain }),
            label: `Observed rainfall, 72 h to ${new Date(latest).toISOString().slice(0, 16)}Z (GPM IMERG)`,
            legend: { min: 0, max: 300, unit: "mm", palette: PALETTES.rain },
            attribution: "NASA GPM IMERG V07 via Google Earth Engine",
          };
        } else if (kind === "gfsRain72" || kind === "gfsWind72") {
          const gfs = ee.ImageCollection("NOAA/GFS0P25");
          const run = await evaluate<number>(gfs.filterDate(now - 3 * 86400e3, now + 86400e3).aggregate_max("creation_time"));
          const col = gfs.filter(ee.Filter.eq("creation_time", run));
          const runTxt = new Date(run).toISOString().slice(0, 13);
          if (kind === "gfsRain72") {
            const hours = Array.from({ length: 12 }, (_, i) => (i + 1) * 6);
            const img = col.filter(ee.Filter.inList("forecast_hours", hours)).select("total_precipitation_surface").sum();
            layers.gfsRain72 = {
              url: await mapUrl(img.updateMask(img.gt(5)), { min: 0, max: 300, palette: PALETTES.rain }),
              label: `GFS forecast rainfall, next 72 h (run ${runTxt}Z)`,
              legend: { min: 0, max: 300, unit: "mm", palette: PALETTES.rain },
              attribution: "NOAA GFS 0.25 deg via Google Earth Engine",
            };
          } else {
            const img = col
              .filter(ee.Filter.lte("forecast_hours", 72))
              .map((im: EE) => im.select("u_component_of_wind_10m_above_ground").hypot(im.select("v_component_of_wind_10m_above_ground")))
              .max();
            layers.gfsWind72 = {
              url: await mapUrl(img.updateMask(img.gt(10)), { min: 10, max: 40, palette: PALETTES.wind }),
              label: `GFS max 10 m wind, next 72 h (run ${runTxt}Z)`,
              legend: { min: 10, max: 40, unit: "m/s", palette: PALETTES.wind },
              attribution: "NOAA GFS 0.25 deg via Google Earth Engine",
            };
          }
        } else if (kind === "population") {
          const pop = ee.ImageCollection("WorldPop/GP/100m/pop").filter(ee.Filter.eq("year", 2020)).mosaic();
          layers.population = {
            url: await mapUrl(pop.updateMask(pop.gt(1)), { min: 1, max: 60, palette: PALETTES.pop }),
            label: "Population per 100 m cell (WorldPop 2020)",
            legend: { min: 1, max: 60, unit: "people", palette: PALETTES.pop },
            attribution: "WorldPop via Google Earth Engine",
          };
        } else if (kind === "lecz") {
          const n = ee.Image("NASA/NASADEM_HGT/001");
          const img = n.select("elevation").lte(5).and(n.select("swb").eq(0)).selfMask();
          layers.lecz = {
            url: await mapUrl(img, { palette: ["#f59e0b"] }),
            label: "Low-elevation coastal zone (<= 5 m, NASADEM)",
            legend: { min: 0, max: 5, unit: "m", palette: ["#f59e0b", "#f59e0b"] },
            attribution: "NASA NASADEM via Google Earth Engine",
          };
        }
      } catch (e) {
        errors[kind] = (e as Error).message;
      }
    }),
  );
  return { layers, errors };
}

// ---------------- exposure statistics ----------------

export async function exposureStats(coast: CoastLevel[]) {
  const ee = await getEE();
  const { depth, zones } = inundationDepth(ee, coast);
  const pop = ee.ImageCollection("WorldPop/GP/100m/pop").filter(ee.Filter.eq("year", 2020)).mosaic();
  const region = zones.geometry();
  const popSum = pop.updateMask(depth.gt(0.5)).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: region,
    scale: 100,
    maxPixels: 1e10,
    tileScale: 4,
  });
  const area = ee.Image.pixelArea().updateMask(depth.gt(0.05)).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: region,
    scale: 100,
    maxPixels: 1e10,
    tileScale: 4,
  });
  const [p, a] = await Promise.all([evaluate<Record<string, number>>(popSum), evaluate<Record<string, number>>(area)]);
  return {
    popInundatedOver05m: Math.round(p?.population ?? 0),
    inundatedAreaKm2: Math.round((a?.area ?? 0) / 1e6),
  };
}

// ---------------- elevation sampling ----------------

const elevCache = new Map<string, number>();

export async function sampleElevations(points: { id: string; lat: number; lon: number }[]) {
  const out: Record<string, number> = {};
  const todo = points.filter((p) => {
    const k = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    const v = elevCache.get(k);
    if (v != null) out[p.id] = v;
    return v == null;
  });
  if (todo.length) {
    const ee = await getEE();
    const dem = ee.Image("NASA/NASADEM_HGT/001").select("elevation");
    const fc = ee.FeatureCollection(todo.map((p) => ee.Feature(ee.Geometry.Point([p.lon, p.lat]), { id: p.id })));
    const res = await evaluate<{ features: { properties: { id: string; mean?: number } }[] }>(
      dem.reduceRegions({ collection: fc, reducer: ee.Reducer.mean(), scale: 30 }),
    );
    for (const f of res.features) {
      const p = todo.find((x) => x.id === f.properties.id);
      if (!p || f.properties.mean == null) continue;
      const v = Math.max(0, Math.round(f.properties.mean * 10) / 10);
      elevCache.set(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, v);
      out[p.id] = v;
    }
  }
  return out;
}

// ---------------- imagery for Gemini ----------------

export async function hazardThumbnail(coast: CoastLevel[], bbox: [number, number, number, number]): Promise<string | null> {
  const ee = await getEE();
  const { depth } = inundationDepth(ee, coast);
  const nasadem = ee.Image("NASA/NASADEM_HGT/001");
  const hill = ee.Terrain.hillshade(nasadem.select("elevation")).visualize({ min: 120, max: 255, palette: ["#1f2937", "#9ca3af"] });
  const water = nasadem.select("swb").eq(255).selfMask().visualize({ palette: ["#0c4a6e"] });
  const pop = ee.ImageCollection("WorldPop/GP/100m/pop").filter(ee.Filter.eq("year", 2020)).mosaic();
  const popVis = pop.updateMask(pop.gt(20)).visualize({ min: 20, max: 200, palette: ["#fde68a", "#f97316"], opacity: 0.6 });
  const inund = depth.visualize({ min: 0, max: 4, palette: PALETTES.depth });
  const composite = ee.ImageCollection([hill, water, popVis, inund]).mosaic();
  const [w, s, e, n] = bbox;
  const url = await thumbUrl(composite, {
    region: ee.Geometry.Rectangle([w, s, e, n], null, false),
    dimensions: 768,
    format: "png",
  });
  const token = ee.data.getAuthToken?.();
  const res = await fetch(url, { headers: token ? { Authorization: token } : {} });
  if (!res.ok) throw new Error(`Thumbnail fetch failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}
