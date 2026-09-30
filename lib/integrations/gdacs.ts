// Live / recent tropical cyclones from GDACS (JRC/UN), filtered to the North Indian Ocean.
// Tracks come from the GDACS timeline export: `actual=True` rows are observed advisories,
// `actual=False` rows are the latest forecast positions.

import "server-only";
import type { Storm, TrackPoint } from "../types";

const BASE = "https://www.gdacs.org/gdacsapi/api";
const NIO = { west: 76, east: 100, south: 0, north: 30 };
const MS_TO_KT = 1 / 0.514444;

export interface LiveStormSummary {
  id: string;
  eventId: number;
  episodeId: number;
  name: string;
  alertLevel: string;
  current: boolean;
  from: string;
  to: string;
  lat: number;
  lon: number;
  country: string;
  maxWindKmh: number | null;
}

let listCache: { at: number; data: LiveStormSummary[] } | null = null;
const stormCache = new Map<string, { at: number; storm: Storm }>();

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GDACS ${res.status}`);
  return res.json();
}

export async function listLiveStorms(days = 30): Promise<LiveStormSummary[]> {
  if (listCache && Date.now() - listCache.at < 10 * 60_000) return listCache.data;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400e3);
  const url = `${BASE}/events/geteventlist/SEARCH?eventlist=TC&fromDate=${from.toISOString().slice(0, 10)}&toDate=${to.toISOString().slice(0, 10)}`;
  const json = await getJson(url);
  const out: LiveStormSummary[] = [];
  for (const f of json.features ?? []) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (lon < NIO.west || lon > NIO.east || lat < NIO.south || lat > NIO.north) continue;
    const p = f.properties;
    out.push({
      id: `gdacs-${p.eventid}`,
      eventId: p.eventid,
      episodeId: p.episodeid,
      name: p.eventname ?? p.name,
      alertLevel: p.alertlevel,
      current: p.iscurrent === "true" || p.iscurrent === true,
      from: p.fromdate,
      to: p.todate,
      lat,
      lon,
      country: p.country,
      maxWindKmh: p.severitydata?.severity ? Math.round(p.severitydata.severity) : null,
    });
  }
  out.sort((a, b) => Number(b.current) - Number(a.current) || b.to.localeCompare(a.to));
  listCache = { at: Date.now(), data: out };
  return out;
}

function parseGdacsDate(s: string): string {
  // "22 Sep 2026 18:00" (UTC)
  const d = new Date(`${s.replace(/>$/, "")} UTC`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function getLiveStorm(eventId: number): Promise<Storm> {
  const key = String(eventId);
  const hit = stormCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.storm;
  const details = await getJson(`${BASE}/events/geteventdata?eventtype=TC&eventid=${eventId}`);
  const p = details.properties;
  const timelineUrl: string | undefined = p.impacts?.find((i: { resource?: { timeline?: string } }) => i.resource?.timeline)?.resource?.timeline;
  if (!timelineUrl) throw new Error("GDACS event has no track timeline");
  const tl = await getJson(timelineUrl);
  const items: Record<string, string>[] = tl.channel?.item ?? [];
  const track: TrackPoint[] = items
    .map((x) => ({
      t: parseGdacsDate(x.advisory_datetime),
      lat: Number(x.latitude),
      lon: Number(x.longitude),
      vmaxKt: Math.max(20, Math.round(Number(x.wind_speed) * MS_TO_KT)),
      pcHpa: Number(x.pressure) > 800 ? Number(x.pressure) : undefined,
      forecast: String(x.actual).toLowerCase() !== "true",
    }))
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon))
    .sort((a, b) => a.t.localeCompare(b.t));
  // de-duplicate identical timestamps (keep the later advisory)
  const dedup = new Map<string, TrackPoint>();
  for (const pt of track) dedup.set(pt.t, pt);
  const storm: Storm = {
    id: `gdacs-${eventId}`,
    name: p.eventname ?? p.name,
    year: new Date(p.fromdate).getUTCFullYear(),
    source: "gdacs",
    summary: `${p.htmldescription ?? p.description} Source: ${p.source ?? "GDACS"} via GDACS (episode ${p.episodeid}).`,
    track: [...dedup.values()],
    gdacs: { eventId, episodeId: p.episodeid, alertLevel: p.alertlevel, current: p.iscurrent === "true" },
  };
  stormCache.set(key, { at: Date.now(), storm });
  return storm;
}
