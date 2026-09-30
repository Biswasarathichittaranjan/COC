// OpenStreetMap critical facilities for an impact area via the Overpass API.

import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Asset, AssetType } from "../types";
import { DISTRICTS } from "../data/districts";
import { haversineKm } from "../geo";

// Public Overpass instances, tried in order (the main instance is frequently overloaded).
const ENDPOINTS = (process.env.OVERPASS_URLS ?? "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://overpass.private.coffee/api/interpreter")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function nearestDistrict(lat: number, lon: number) {
  let best = DISTRICTS[0];
  let bd = Infinity;
  for (const d of DISTRICTS) {
    const k = haversineKm(lat, lon, d.lat, d.lon);
    if (k < bd) {
      bd = k;
      best = d;
    }
  }
  return { district: best, km: bd };
}

export async function fetchOsmAssets(bbox: { south: number; west: number; north: number; east: number }): Promise<Asset[]> {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const q = `[out:json][timeout:30];
(
  nwr["amenity"="hospital"](${b});
  nwr["power"="plant"](${b});
  nwr["power"="substation"]["voltage"](${b});
  nwr["amenity"="shelter"]["name"~"[Cc]yclone"](${b});
);
out center 800;`;
  let json: { elements?: Record<string, any>[] } | null = null;
  const errors: string[] = [];
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: q }),
        headers: { "User-Agent": "landfall-prototype/0.1 (anticipatory cyclone risk demo)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      json = await res.json();
      break;
    } catch (e) {
      errors.push(`${new URL(url).host}: ${(e as Error).message}`);
    }
  }
  if (!json) throw new Error(`Overpass unavailable (${errors.join("; ")})`);
  const out: Asset[] = [];
  for (const el of json.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const t = el.tags ?? {};
    let type: AssetType | null = null;
    if (t.amenity === "hospital") type = "hospital";
    else if (t.power === "plant") type = "power_plant";
    else if (t.power === "substation") {
      const kv = Math.max(...String(t.voltage).split(";").map((v: string) => Number(v) / 1000).filter((v: number) => Number.isFinite(v)), 0);
      if (kv < 66) continue;
      type = "substation";
    } else type = "shelter";
    const { district, km } = nearestDistrict(lat, lon);
    if (km > 150) continue;
    out.push({
      id: `osm:${el.type}/${el.id}`,
      name: t.name || t["name:en"] || `${type.replace("_", " ")} (OSM ${el.type}/${el.id})`,
      type,
      lat,
      lon,
      elevM: 5,
      districtId: district.id,
      criticality: type === "hospital" ? (t.beds && Number(t.beds) > 200 ? 4 : 3) : type === "power_plant" ? 4 : 3,
      capacity: t["plant:output:electricity"] || t.voltage || t.beds,
      source: "osm",
      elevSource: "seed",
    });
  }
  return out.slice(0, 600);
}
