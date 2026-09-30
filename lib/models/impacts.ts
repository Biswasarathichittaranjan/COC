// Vulnerability and consequence models: asset fragility curves, rainfall/surge damage pathways,
// alert levels and anticipatory-action stages.

import type { AAStage, AlertLevel, AssetType, District, HazardStats, PathwayEdge, PathwayNode, PathwayResult } from "../types";
import { fragility, mean } from "../geo";

// Lognormal fragility parameters [median, beta] for FUNCTIONAL loss.
// wind: 1-min sustained m/s; depth: inundation m; rain24: mm in 24 h (local flooding).
export const FRAGILITY: Record<AssetType, { wind: [number, number]; depth: [number, number]; rain24: [number, number] }> = {
  power_plant: { wind: [58, 0.2], depth: [1.0, 0.45], rain24: [280, 0.4] },
  substation: { wind: [42, 0.2], depth: [0.6, 0.45], rain24: [240, 0.4] }, // incoming line trips + control room flooding
  hospital: { wind: [55, 0.2], depth: [0.5, 0.4], rain24: [220, 0.4] },
  shelter: { wind: [72, 0.15], depth: [2.5, 0.35], rain24: [350, 0.4] }, // raised plinth, engineered for ~260 km/h
  road: { wind: [33, 0.3], depth: [0.3, 0.35], rain24: [170, 0.35] }, // wind -> tree-fall blockage
  port: { wind: [28, 0.2], depth: [1.5, 0.4], rain24: [300, 0.4] }, // wind -> operations suspended
};

export interface MemberHazard {
  wind: number[]; // max sustained wind (m/s) per member
  rainTotal: number[];
  rain24: number[];
  depth: number[];
  twlCoast: number[]; // total water level at the nearest coast node
}

// ---------- damage pathways ----------

const NODES: { id: string; label: string; kind: PathwayNode["kind"] }[] = [
  { id: "h_wind", label: "Destructive wind (>=64 kt)", kind: "hazard" },
  { id: "h_surge", label: "Storm surge (>=0.5 m inland)", kind: "hazard" },
  { id: "h_rain", label: "Extreme rainfall (>=204 mm/24h)", kind: "hazard" },
  { id: "m_pluvial", label: "Pluvial / urban waterlogging", kind: "mechanism" },
  { id: "m_riverine", label: "Riverine flooding", kind: "mechanism" },
  { id: "m_compound", label: "Compound flooding (surge blocks drainage)", kind: "mechanism" },
  { id: "m_landslide", label: "Landslides", kind: "mechanism" },
  { id: "m_treefall", label: "Tree-fall & debris", kind: "mechanism" },
  { id: "m_saline", label: "Saline inundation / embankment breach", kind: "mechanism" },
  { id: "i_roads", label: "Arterial road disruption", kind: "impact" },
  { id: "i_power", label: "Power outage", kind: "impact" },
  { id: "i_shelter", label: "Shelter access loss", kind: "impact" },
  { id: "i_health", label: "Health-service disruption", kind: "impact" },
  { id: "i_wash", label: "WASH failure / disease risk", kind: "impact" },
  { id: "i_livelihood", label: "Crop, fishery & livelihood loss", kind: "impact" },
];

const EDGES: [string, string, number][] = [
  ["h_rain", "m_pluvial", 1],
  ["h_rain", "m_riverine", 1],
  ["h_rain", "m_landslide", 1],
  ["h_rain", "m_compound", 0.6],
  ["h_surge", "m_compound", 0.9],
  ["h_surge", "m_saline", 1],
  ["h_wind", "m_treefall", 1],
  ["m_pluvial", "i_roads", 0.6],
  ["m_riverine", "i_roads", 0.8],
  ["m_compound", "i_roads", 0.9],
  ["m_landslide", "i_roads", 0.7],
  ["m_treefall", "i_roads", 0.8],
  ["m_saline", "i_roads", 0.9],
  ["m_treefall", "i_power", 0.9],
  ["m_compound", "i_power", 0.5],
  ["m_saline", "i_power", 0.6],
  ["i_roads", "i_shelter", 0.7],
  ["m_saline", "i_shelter", 0.5],
  ["i_power", "i_health", 0.5],
  ["i_roads", "i_health", 0.5],
  ["m_riverine", "i_wash", 0.6],
  ["m_compound", "i_wash", 0.6],
  ["m_saline", "i_wash", 0.7],
  ["m_pluvial", "i_wash", 0.4],
  ["m_saline", "i_livelihood", 0.8],
  ["m_riverine", "i_livelihood", 0.5],
  ["m_treefall", "i_livelihood", 0.4],
];

function noisyOr(parts: number[]): number {
  let q = 1;
  for (const p of parts) q *= 1 - Math.min(1, Math.max(0, p));
  return 1 - q;
}

export function computePathways(d: District, centre: MemberHazard, low: MemberHazard, hospitalLoss: number): PathwayResult {
  const n = centre.wind.length;
  const deltaFactor = d.terrain === "delta" ? 1 : d.terrain === "hilly" ? 0.6 : 0.8;
  const pr: Record<string, number> = {};
  const per = (f: (m: number) => number) => mean(Array.from({ length: n }, (_, m) => f(m)));

  const wind = (m: number) => Math.max(centre.wind[m], low.wind[m]);
  const r24 = (m: number) => Math.max(centre.rain24[m], low.rain24[m]);
  const rTot = (m: number) => Math.max(centre.rainTotal[m], low.rainTotal[m]);

  pr.h_wind = per((m) => (wind(m) >= 32.9 ? 1 : 0));
  pr.h_surge = per((m) => (low.depth[m] >= 0.5 ? 1 : 0));
  pr.h_rain = per((m) => (r24(m) >= 204.5 ? 1 : 0));
  pr.m_pluvial = per((m) => fragility(r24(m), d.drainageMm24h, 0.35));
  pr.m_riverine = per((m) => fragility(rTot(m) * 1.1, 300, 0.4)) * deltaFactor;
  pr.m_compound = per((m) => noisyOr([fragility(r24(m), d.drainageMm24h, 0.35), fragility(rTot(m), 300, 0.4)]) * (low.twlCoast[m] >= 1.5 ? 1 : low.twlCoast[m] / 1.5 * 0.5));
  pr.m_landslide = d.terrain === "hilly" ? per((m) => fragility(rTot(m), d.id === "coxs-bazar" ? 170 : 220, 0.4)) : 0;
  pr.m_treefall = per((m) => fragility(wind(m), 30, 0.2));
  pr.m_saline = per((m) => fragility(low.depth[m], 0.4, 0.5));

  pr.i_roads = noisyOr([0.6 * pr.m_pluvial, 0.8 * pr.m_riverine, 0.9 * pr.m_compound, 0.7 * pr.m_landslide, 0.8 * pr.m_treefall, 0.9 * pr.m_saline]);
  pr.i_power = noisyOr([0.9 * pr.m_treefall, 0.5 * pr.m_compound, 0.6 * pr.m_saline, per((m) => fragility(wind(m), 28, 0.25))]);
  pr.i_shelter = noisyOr([0.7 * pr.i_roads, 0.5 * pr.m_saline]);
  pr.i_health = noisyOr([0.5 * pr.i_power, 0.5 * pr.i_roads, hospitalLoss]);
  pr.i_wash = noisyOr([0.6 * pr.m_riverine, 0.6 * pr.m_compound, 0.7 * pr.m_saline, 0.4 * pr.m_pluvial]);
  pr.i_livelihood = noisyOr([0.8 * pr.m_saline, 0.5 * pr.m_riverine, 0.4 * pr.m_treefall]);

  const nodes: PathwayNode[] = NODES.map((x) => ({ ...x, p: round3(pr[x.id] ?? 0) }));
  const edges: PathwayEdge[] = EDGES.map(([from, to, w]) => ({ from, to, w: round3(w * (pr[from] ?? 0)) }));

  // strongest hazard -> mechanism -> impact chain
  let best: string[] = [];
  let bestP = 0;
  for (const [h, m1, w1] of EDGES) {
    if (!h.startsWith("h_")) continue;
    for (const [m2, i1, w2] of EDGES) {
      if (m2 !== m1 || !i1.startsWith("i_")) continue;
      const p = pr[h] * w1 * pr[m1] * w2 * pr[i1];
      if (p > bestP) {
        bestP = p;
        best = [h, m1, i1];
      }
    }
  }
  return { nodes, edges, dominant: best, dominantP: round3(bestP) };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// ---------- alert levels & anticipatory action ----------

export function alertLevel(h: HazardStats, low: HazardStats): AlertLevel {
  const p64 = Math.max(h.p64, low.p64);
  const p50 = Math.max(h.p50, low.p50);
  const p34 = Math.max(h.p34, low.p34);
  const ext = Math.max(h.pRain24Extreme, low.pRain24Extreme);
  const heavy = Math.max(h.pRain24Heavy, low.pRain24Heavy);
  if (p64 >= 0.3 || p50 >= 0.6 || low.pDepth1 >= 0.3 || ext >= 0.5) return "RED";
  if (p50 >= 0.4 || p64 >= 0.2 || low.pDepth05 >= 0.3 || heavy >= 0.5 || ext >= 0.25) return "ORANGE";
  if (p34 >= 0.3 || low.pDepth05 >= 0.1 || Math.max(h.rain24MeanMm, low.rain24MeanMm) >= 64.5) return "YELLOW";
  return "GREEN";
}

export function aaStage(alert: AlertLevel, galeOnsetH: number | null): AAStage {
  const o = galeOnsetH ?? 999;
  if (alert === "ORANGE" || alert === "RED") {
    if (o <= 12) return "impact";
    if (o <= 30 && alert === "RED") return "evacuate";
    if (o <= 48) return "activation";
    return "readiness";
  }
  if (alert === "YELLOW" && o <= 72) return "readiness";
  return "monitor";
}

export const AA_STAGE_LABEL: Record<AAStage, string> = {
  monitor: "Monitor",
  readiness: "Readiness (T-72h)",
  activation: "Activation (T-48h)",
  evacuate: "Evacuate (T-24h)",
  impact: "Shelter in place (T-12h)",
};

export const AA_ACTIONS: Record<AAStage, string[]> = {
  monitor: ["Track official bulletins; verify contact trees and shelter inventories."],
  readiness: [
    "Recall fishing fleets and suspend sea-going operations",
    "Pre-position relief stocks, drinking water, ORS and generator fuel",
    "Alert volunteer networks (CPP / Aapda Mitra) and verify shelter keys, lighting, water",
    "Trigger forecast-based financing / parametric liquidity release where thresholds are met",
  ],
  activation: [
    "Open cyclone shelters; begin phased evacuation of kutcha houses and low-lying zones",
    "Move patients from ground-floor wards; confirm 72 h generator fuel at hospitals",
    "Stage utility restoration crews and tree-cutting teams outside the impact zone",
    "Sandbag / pump-protect low-lying substations; pre-arrange mobile substations",
  ],
  evacuate: [
    "Complete evacuation of surge-exposed zones before gale onset",
    "De-energise feeders in surge zones; close ports and suspend rail/road traffic on exposed links",
    "Deploy search-and-rescue (NDRF/Fire Service/Army) to pre-identified staging points",
  ],
  impact: [
    "Shelter in place: no movement during gale-force winds",
    "Maintain emergency communications (satellite phones, HF radio)",
    "Prepare post-landfall damage assessment and route-clearance teams",
  ],
};
