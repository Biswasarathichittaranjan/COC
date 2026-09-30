import type { Asset, District, SimParams, Storm } from "@/lib/types";
import { HISTORICAL_STORMS } from "@/lib/data/storms";
import { DISTRICTS } from "@/lib/data/districts";
import { SEED_ASSETS } from "@/lib/data/infrastructure";
import { runSimulation } from "@/lib/simulate";
import { buildCustomTrack, HOUR } from "@/lib/models/track";
import { getLiveStorm } from "@/lib/integrations/gdacs";
import { geeConfigured, sampleElevations } from "@/lib/integrations/gee";
import { districtForecasts } from "@/lib/integrations/openmeteo";

export const maxDuration = 120;

function clampParams(p: Partial<SimParams>): SimParams {
  const num = (v: unknown, d: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return {
    stormId: String(p.stormId ?? "amphan-2020"),
    custom: p.custom,
    leadHours: num(p.leadHours, 48, 0, 120),
    members: Math.round(num(p.members, 50, 1, 100)),
    seed: Math.round(num(p.seed, 7, 1, 1e9)),
    intensityScale: num(p.intensityScale, 1, 0.5, 1.5),
    rmaxScale: num(p.rmaxScale, 1, 0.5, 2),
    crossTrackShiftKm: num(p.crossTrackShiftKm, 0, -300, 300),
    speedScale: num(p.speedScale, 1, 0.4, 2),
    tide: (["spring_low", "low", "mean", "high", "spring_high"] as const).includes(p.tide as never) ? (p.tide as SimParams["tide"]) : "mean",
    live: !!p.live,
  };
}

async function resolveStorm(params: SimParams): Promise<Storm> {
  if (params.stormId === "custom") {
    if (!params.custom) throw new Error("Custom storm specification missing");
    const landfall = Math.ceil(Date.now() / HOUR) * HOUR + params.leadHours * HOUR;
    return {
      id: "custom",
      name: "Scenario",
      year: new Date().getUTCFullYear(),
      source: "custom",
      summary: `Synthetic cyclone: ${params.custom.vmaxKt} kt at landfall, heading ${params.custom.headingDeg} deg at ${params.custom.speedKmh} km/h.`,
      track: buildCustomTrack(params.custom, landfall),
    };
  }
  if (params.stormId.startsWith("gdacs-")) return getLiveStorm(Number(params.stormId.slice(6)));
  const s = HISTORICAL_STORMS.find((x) => x.id === params.stormId);
  if (!s) throw new Error(`Unknown storm ${params.stormId}`);
  return s;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms))]);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const params = clampParams(body.params ?? {});
  const extra: Asset[] = Array.isArray(body.extraAssets) ? body.extraAssets.slice(0, 600) : [];
  const notes: string[] = [];
  try {
    const storm = await resolveStorm(params);
    let assets: Asset[] = [...SEED_ASSETS, ...extra];
    let districts: District[] = DISTRICTS;
    let elevationSource: "seed" | "nasadem" = "seed";

    if (geeConfigured()) {
      try {
        const pts = [
          ...assets.map((a) => ({ id: a.id, lat: a.lat, lon: a.lon })),
          ...districts.flatMap((d) => [
            { id: `d:${d.id}`, lat: d.lat, lon: d.lon },
            { id: `l:${d.id}`, lat: d.lowland.lat, lon: d.lowland.lon },
          ]),
        ];
        const elev = await withTimeout(sampleElevations(pts), 25_000);
        assets = assets.map((a) => (elev[a.id] != null && !a.path ? { ...a, elevM: elev[a.id], elevSource: "nasadem" as const } : a));
        districts = districts.map((d) => ({
          ...d,
          elevM: elev[`d:${d.id}`] ?? d.elevM,
          lowland: { ...d.lowland, elevM: elev[`l:${d.id}`] ?? d.lowland.elevM },
        }));
        elevationSource = "nasadem";
      } catch (e) {
        notes.push(`NASADEM elevation sampling failed (${(e as Error).message}); using seed elevations.`);
      }
    }

    let liveForecast: Record<string, { rain72Mm: number; gustMaxMs: number }> | undefined;
    if (params.live && storm.source !== "gdacs") {
      params.live = false;
      notes.push("Real-time weather blending applies only to live GDACS storms; skipped for this scenario.");
    }
    if (params.live) {
      try {
        liveForecast = await withTimeout(districtForecasts(districts), 15_000);
      } catch (e) {
        notes.push(`Open-Meteo forecast unavailable (${(e as Error).message}).`);
      }
    }

    const result = runSimulation(params, { storm, districts, assets, liveForecast, elevationSource });
    result.meta.notes.unshift(...notes);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
