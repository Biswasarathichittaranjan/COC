// Compact, model-ready briefing distilled from a simulation result. Shared by the UI (which sends it
// to /api/advisory) and the server (prompting Gemini / rule-based drafting).

import type { AlertLevel, SimResult } from "./types";
import { AUTHORITY_BY_ID } from "./data/districts";
import { nearestPlace } from "./data/coast";
import { MS_TO_KT } from "./geo";
import { AA_STAGE_LABEL } from "./models/impacts";
import { ASSET_TYPE_LABEL } from "./data/infrastructure";

export interface Brief {
  storm: { name: string; year: number; source: string; summary: string };
  exercise: boolean;
  issueTimeUtc: string;
  landfall: { timeUtc: string; place: string; lat: number; lon: number; vmaxKt: number; hoursAfterIssue: number } | null;
  landfallSpreadKm: number;
  scenario: { leadHours: number; members: number; tide: string; intensityScale: number; crossTrackShiftKm: number; speedScale: number };
  summary: SimResult["summary"];
  coastPeaks: { place: string; twlMeanM: number; twlP90M: number; pOver2m: number }[];
  districts: {
    id: string;
    name: string;
    admin1: string;
    authorityId: string;
    alert: AlertLevel;
    riskScore: number;
    stage: string;
    population: number;
    popExposedSurge: number;
    galeOnsetHoursAfterIssue: number | null;
    peakWindHoursAfterIssue: number | null;
    windMeanKt: number;
    pHurricaneForce: number;
    lowlandDepthMeanM: number;
    pLowlandDepthOver1m: number;
    rainEventMeanMm: number;
    rain24MeanMm: number;
    pRain24Extreme: number;
    dominantPathway: string;
    impactProbabilities: Record<string, number>;
    liveForecast72hMm?: number;
  }[];
  assetsAtRisk: { name: string; type: string; district: string; pLoss: number; dominantHazard: string; galeOnsetHoursAfterIssue: number | null }[];
  shelters: { name: string; district: string; pLoss: number }[];
  parametric: { name: string; pTrigger: number; expectedPayoutUsd: number; p90PayoutUsd: number }[];
  authorities: { id: string; name: string; short: string; warningAgency: string; localLanguage: string; districts: string[] }[];
  coastLevels: { lat: number; lon: number; twl: number; atten: number; nx: number; ny: number }[];
  bbox: [number, number, number, number];
}

const RANK: Record<AlertLevel, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };

export function maxAlert(levels: AlertLevel[]): AlertLevel {
  return levels.reduce<AlertLevel>((m, l) => (RANK[l] > RANK[m] ? l : m), "GREEN");
}

export function buildBrief(r: SimResult): Brief {
  const nodeLabel = new Map<string, string>();
  const label = (id: string) => {
    if (!nodeLabel.size) for (const n of r.districts[0]?.pathways.nodes ?? []) nodeLabel.set(n.id, n.label);
    return nodeLabel.get(id) ?? id;
  };
  const active = r.districts.filter((d) => d.alert !== "GREEN").sort((a, b) => b.riskScore - a.riskScore);
  const districts = active.slice(0, 24).map((d) => {
    const imp: Record<string, number> = {};
    for (const n of d.pathways.nodes) if (n.kind === "impact") imp[n.label] = n.p;
    return {
      id: d.id,
      name: d.name,
      admin1: d.admin1,
      authorityId: d.authorityId,
      alert: d.alert,
      riskScore: d.riskScore,
      stage: AA_STAGE_LABEL[d.aaStage],
      population: d.population,
      popExposedSurge: d.popExposedSurge,
      galeOnsetHoursAfterIssue: d.hazard.galeOnsetH,
      peakWindHoursAfterIssue: d.hazard.peakH,
      windMeanKt: Math.round(d.hazard.windMeanMs * MS_TO_KT),
      pHurricaneForce: d.hazard.p64,
      lowlandDepthMeanM: d.lowland.depthMeanM,
      pLowlandDepthOver1m: d.lowland.pDepth1,
      rainEventMeanMm: d.hazard.rainMeanMm,
      rain24MeanMm: d.hazard.rain24MeanMm,
      pRain24Extreme: d.hazard.pRain24Extreme,
      dominantPathway: d.pathways.dominant.map(label).join(" -> "),
      impactProbabilities: imp,
      liveForecast72hMm: d.liveForecast?.rain72Mm,
    };
  });
  const distName = new Map(r.districts.map((d) => [d.id, d.name]));
  const assetsAtRisk = [...r.assets]
    .filter((a) => a.pLoss >= 0.2 && a.type !== "shelter")
    .sort((a, b) => b.pLoss - a.pLoss || b.criticality - a.criticality)
    .slice(0, 25)
    .map((a) => ({
      name: a.name,
      type: ASSET_TYPE_LABEL[a.type],
      district: distName.get(a.districtId) ?? a.districtId,
      pLoss: a.pLoss,
      dominantHazard: a.dominant,
      galeOnsetHoursAfterIssue: a.hazard.galeOnsetH,
    }));
  const activeIds = new Set(active.map((d) => d.id));
  const shelters = r.assets
    .filter((a) => a.type === "shelter" && activeIds.has(a.districtId))
    .map((a) => ({ name: a.name, district: distName.get(a.districtId) ?? a.districtId, pLoss: a.pLoss }));
  const byAuth = new Map<string, string[]>();
  for (const d of active) byAuth.set(d.authorityId, [...(byAuth.get(d.authorityId) ?? []), d.name]);
  const authorities = [...byAuth.entries()].map(([id, ds]) => {
    const a = AUTHORITY_BY_ID.get(id)!;
    return { id, name: a.name, short: a.short, warningAgency: a.warningAgency, localLanguage: a.languages[0]?.name ?? "English", districts: ds };
  });
  const peaks = r.coast.filter((c) => c.surgeP90 >= 0.3).sort((a, b) => b.twlMean - a.twlMean);
  const coastPeaks: Brief["coastPeaks"] = [];
  for (const c of peaks) {
    const place = nearestPlace(c.lat, c.lon);
    if (coastPeaks.some((p) => p.place === place)) continue;
    coastPeaks.push({ place, twlMeanM: c.twlMean, twlP90M: c.twlP90, pOver2m: c.pTwl2m });
    if (coastPeaks.length >= 6) break;
  }
  const coastLevels = r.coast
    .filter((c) => c.surgeP90 >= 0.3 && c.twlP90 > 0.2)
    .map((c) => ({ lat: c.lat, lon: c.lon, twl: c.twlP90, atten: c.atten, nx: c.nx, ny: c.ny }));
  const lats = coastLevels.map((c) => c.lat).concat(r.landfall ? [r.landfall.lat] : []);
  const lons = coastLevels.map((c) => c.lon).concat(r.landfall ? [r.landfall.lon] : []);
  const bbox: [number, number, number, number] = lats.length
    ? [Math.min(...lons) - 0.8, Math.min(...lats) - 0.6, Math.max(...lons) + 0.8, Math.max(...lats) + 0.8]
    : [85, 18, 93, 24];

  return {
    storm: { name: r.storm.name, year: r.storm.year, source: r.storm.source, summary: r.storm.summary },
    exercise: r.storm.source !== "gdacs",
    issueTimeUtc: new Date(r.issueTime).toISOString(),
    landfall: r.landfall
      ? {
          timeUtc: new Date(r.landfall.t).toISOString(),
          place: nearestPlace(r.landfall.lat, r.landfall.lon),
          lat: r.landfall.lat,
          lon: r.landfall.lon,
          vmaxKt: r.landfall.vmaxKt,
          hoursAfterIssue: Math.round((r.landfall.t - r.issueTime) / 3_600_000),
        }
      : null,
    landfallSpreadKm: r.landfallSpreadKm,
    scenario: {
      leadHours: r.params.leadHours,
      members: r.params.members,
      tide: r.params.tide,
      intensityScale: r.params.intensityScale,
      crossTrackShiftKm: r.params.crossTrackShiftKm,
      speedScale: r.params.speedScale,
    },
    summary: r.summary,
    coastPeaks,
    districts,
    assetsAtRisk,
    shelters,
    parametric: r.covers
      .filter((c) => c.pTrigger > 0.05)
      .map((c) => ({ name: c.name, pTrigger: c.pTrigger, expectedPayoutUsd: c.expectedPayoutUsd, p90PayoutUsd: c.p90PayoutUsd })),
    authorities,
    coastLevels,
    bbox,
  };
}

export function assetTypeLabel(t: string) {
  return (ASSET_TYPE_LABEL as Record<string, string>)[t] ?? t;
}
