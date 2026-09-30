// Real-time numerical weather forecasts for district centroids (Open-Meteo, no key required).

import "server-only";
import type { District } from "../types";

type Forecast = Record<string, { rain72Mm: number; gustMaxMs: number }>;
let cache: { at: number; data: Forecast } | null = null;

export async function districtForecasts(districts: District[]): Promise<Forecast> {
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache.data;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", districts.map((d) => d.lat.toFixed(3)).join(","));
  url.searchParams.set("longitude", districts.map((d) => d.lon.toFixed(3)).join(","));
  url.searchParams.set("hourly", "precipitation,wind_gusts_10m");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "UTC");
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();
  const arr = Array.isArray(json) ? json : [json];
  const data: Forecast = {};
  arr.forEach((loc: { hourly?: { precipitation?: number[]; wind_gusts_10m?: number[] } }, i: number) => {
    const d = districts[i];
    if (!d || !loc.hourly) return;
    const p = (loc.hourly.precipitation ?? []).slice(0, 72);
    const g = (loc.hourly.wind_gusts_10m ?? []).slice(0, 72);
    data[d.id] = {
      rain72Mm: Math.round(p.reduce((s, x) => s + (x ?? 0), 0)),
      gustMaxMs: Math.round(Math.max(0, ...g.map((x) => x ?? 0)) * 10) / 10,
    };
  });
  cache = { at: Date.now(), data };
  return data;
}

export async function openMeteoStatus() {
  try {
    const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=21.6&longitude=88.3&hourly=precipitation&forecast_days=1", {
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
