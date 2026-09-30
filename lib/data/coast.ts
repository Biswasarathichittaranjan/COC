// Bay of Bengal coastline (Point Calimere -> Tanintharyi) with continental-shelf parameters.
//
// Nodes run counter-clockwise around the bay so land is always on the LEFT of the direction of travel;
// the inland normal is therefore the left-hand perpendicular. Coordinates are generalised (~5-15 km),
// adequate for a regional parametric surge model but not for engineering design.

import type { CoastNode, LonLat } from "../types";
import { haversineKm, offsetKm, pointInPolygon } from "../geo";

interface RegionParams {
  label: string;
  shelfWidthKm: number;
  shelfDepthM: number;
  funnel: number; // bathymetric/estuarine convergence amplification
  attenMPerKm: number; // overland surge attenuation (mangroves/roughness)
  springHighM: number; // spring high water above MSL
}

export const COAST_REGIONS: Record<string, RegionParams> = {
  tn: { label: "Tamil Nadu coast", shelfWidthKm: 25, shelfDepthM: 50, funnel: 1.0, attenMPerKm: 0.25, springHighM: 0.5 },
  ap_s: { label: "South Andhra coast", shelfWidthKm: 35, shelfDepthM: 45, funnel: 1.0, attenMPerKm: 0.2, springHighM: 0.6 },
  ap_delta: { label: "Krishna-Godavari delta", shelfWidthKm: 50, shelfDepthM: 35, funnel: 1.05, attenMPerKm: 0.15, springHighM: 0.7 },
  ap_n: { label: "North Andhra coast", shelfWidthKm: 25, shelfDepthM: 55, funnel: 1.0, attenMPerKm: 0.25, springHighM: 0.8 },
  od_s: { label: "South Odisha coast", shelfWidthKm: 30, shelfDepthM: 45, funnel: 1.0, attenMPerKm: 0.2, springHighM: 1.0 },
  od_n: { label: "North Odisha coast", shelfWidthKm: 80, shelfDepthM: 18, funnel: 1.1, attenMPerKm: 0.18, springHighM: 1.4 },
  wb: { label: "West Bengal / Indian Sundarbans", shelfWidthKm: 140, shelfDepthM: 18, funnel: 1.15, attenMPerKm: 0.3, springHighM: 2.4 },
  bd_sw: { label: "Bangladesh Sundarbans - Kuakata", shelfWidthKm: 150, shelfDepthM: 18, funnel: 1.15, attenMPerKm: 0.28, springHighM: 1.6 },
  bd_meghna: { label: "Meghna estuary", shelfWidthKm: 180, shelfDepthM: 14, funnel: 1.35, attenMPerKm: 0.12, springHighM: 2.6 },
  bd_se: { label: "Chattogram - Teknaf coast", shelfWidthKm: 60, shelfDepthM: 30, funnel: 1.05, attenMPerKm: 0.2, springHighM: 1.8 },
  mm_n: { label: "North Rakhine coast", shelfWidthKm: 70, shelfDepthM: 25, funnel: 1.25, attenMPerKm: 0.2, springHighM: 1.9 },
  mm_mid: { label: "South Rakhine coast", shelfWidthKm: 30, shelfDepthM: 50, funnel: 1.0, attenMPerKm: 0.25, springHighM: 1.2 },
  mm_delta: { label: "Ayeyarwady delta - Gulf of Martaban", shelfWidthKm: 150, shelfDepthM: 18, funnel: 1.15, attenMPerKm: 0.12, springHighM: 2.2 },
  mm_s: { label: "Tanintharyi coast", shelfWidthKm: 60, shelfDepthM: 35, funnel: 1.0, attenMPerKm: 0.25, springHighM: 2.6 },
};

// [lat, lon, region]
const RAW: [number, number, string][] = [
  [10.28, 79.86, "tn"], [10.77, 79.86, "tn"], [11.2, 79.84, "tn"], [11.49, 79.78, "tn"], [11.93, 79.84, "tn"],
  [12.2, 79.96, "tn"], [12.62, 80.2, "tn"], [13.08, 80.3, "tn"],
  [13.43, 80.33, "ap_s"], [13.9, 80.18, "ap_s"], [14.25, 80.14, "ap_s"], [14.9, 80.08, "ap_s"], [15.45, 80.2, "ap_s"],
  [15.83, 80.5, "ap_s"],
  [15.72, 80.95, "ap_delta"], [16.1, 81.2, "ap_delta"], [16.3, 81.72, "ap_delta"], [16.55, 82.3, "ap_delta"],
  [16.95, 82.29, "ap_delta"],
  [17.3, 82.6, "ap_n"], [17.69, 83.3, "ap_n"], [17.9, 83.46, "ap_n"], [18.33, 84.13, "ap_n"], [18.88, 84.59, "ap_n"],
  [19.26, 84.91, "od_s"], [19.55, 85.25, "od_s"], [19.72, 85.55, "od_s"], [19.8, 85.83, "od_s"], [19.88, 86.1, "od_s"],
  [20.02, 86.38, "od_s"],
  [20.26, 86.67, "od_n"], [20.5, 86.8, "od_n"], [20.75, 87.0, "od_n"], [21.05, 86.98, "od_n"], [21.47, 87.07, "od_n"],
  [21.62, 87.5, "od_n"],
  [21.7, 87.8, "wb"], [21.65, 88.08, "wb"], [21.56, 88.26, "wb"], [21.62, 88.6, "wb"], [21.62, 88.9, "wb"],
  [21.7, 89.1, "wb"],
  [21.72, 89.3, "bd_sw"], [21.78, 89.5, "bd_sw"], [21.83, 89.87, "bd_sw"], [21.82, 90.12, "bd_sw"], [21.92, 90.45, "bd_sw"],
  [21.95, 90.72, "bd_meghna"], [22.1, 91.05, "bd_meghna"], [22.45, 91.4, "bd_meghna"], [22.25, 91.78, "bd_meghna"],
  [21.95, 91.86, "bd_se"], [21.8, 91.86, "bd_se"], [21.58, 91.9, "bd_se"], [21.43, 91.97, "bd_se"], [21.15, 92.08, "bd_se"],
  [20.86, 92.3, "bd_se"], [20.73, 92.36, "bd_se"],
  [20.45, 92.6, "mm_n"], [20.14, 92.9, "mm_n"], [19.85, 93.1, "mm_n"], [19.43, 93.55, "mm_n"], [19.0, 93.72, "mm_n"],
  [18.45, 94.32, "mm_n"],
  [17.6, 94.57, "mm_mid"], [16.85, 94.4, "mm_mid"], [16.05, 94.2, "mm_mid"],
  [15.88, 94.45, "mm_delta"], [15.75, 94.8, "mm_delta"], [15.8, 95.25, "mm_delta"], [16.1, 95.7, "mm_delta"],
  [16.4, 96.25, "mm_delta"], [16.75, 96.9, "mm_delta"], [16.5, 97.6, "mm_delta"],
  [15.3, 97.78, "mm_s"], [14.08, 98.15, "mm_s"], [12.43, 98.55, "mm_s"], [10.0, 98.52, "mm_s"],
];

// Named places used to label coastal peaks.
export const COAST_PLACES: [string, number, number][] = [
  ["Nagapattinam", 10.77, 79.86], ["Puducherry", 11.93, 79.84], ["Chennai", 13.08, 80.3], ["Nellore", 14.25, 80.14],
  ["Ongole", 15.45, 80.2], ["Krishna mouth", 15.72, 80.95], ["Machilipatnam", 16.1, 81.2], ["Godavari mouth", 16.55, 82.3],
  ["Kakinada", 16.95, 82.29], ["Visakhapatnam", 17.69, 83.3], ["Kalingapatnam", 18.33, 84.13], ["Gopalpur", 19.26, 84.91],
  ["Chilika", 19.72, 85.55], ["Puri", 19.8, 85.83], ["Konark", 19.88, 86.1], ["Paradip", 20.26, 86.67],
  ["Dhamra", 20.75, 87.0], ["Chandipur", 21.47, 87.07], ["Digha", 21.62, 87.5], ["Sagar Island", 21.65, 88.08],
  ["Bakkhali", 21.56, 88.26], ["Indian Sundarbans", 21.62, 88.9], ["Hiron Point", 21.78, 89.5], ["Kuakata", 21.82, 90.12],
  ["Bhola (south)", 21.95, 90.72], ["Hatiya", 22.1, 91.05], ["Sandwip", 22.45, 91.4], ["Chattogram", 22.25, 91.78],
  ["Kutubdia", 21.8, 91.86], ["Cox's Bazar", 21.43, 91.97], ["Teknaf", 20.86, 92.3], ["Sittwe", 20.14, 92.9],
  ["Kyaukphyu", 19.43, 93.55], ["Thandwe", 18.45, 94.32], ["Gwa", 17.6, 94.57], ["Cape Negrais", 16.05, 94.2],
  ["Labutta coast", 15.75, 94.8], ["Bogale coast", 15.8, 95.25], ["Yangon river mouth", 16.4, 96.25],
  ["Mawlamyine", 16.5, 97.6], ["Dawei", 14.08, 98.15], ["Myeik", 12.43, 98.55],
];

function densify(maxStepKm: number): { lat: number; lon: number; region: string }[] {
  const out: { lat: number; lon: number; region: string }[] = [];
  for (let k = 0; k < RAW.length - 1; k++) {
    const [la1, lo1, r1] = RAW[k];
    const [la2, lo2] = RAW[k + 1];
    const d = haversineKm(la1, lo1, la2, lo2);
    const n = Math.max(1, Math.ceil(d / maxStepKm));
    for (let s = 0; s < n; s++) {
      const f = s / n;
      out.push({ lat: la1 + (la2 - la1) * f, lon: lo1 + (lo2 - lo1) * f, region: r1 });
    }
  }
  const last = RAW[RAW.length - 1];
  out.push({ lat: last[0], lon: last[1], region: last[2] });
  return out;
}

function build(): CoastNode[] {
  const pts = densify(6);
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 2)];
    const b = pts[Math.min(pts.length - 1, i + 2)];
    const [dx, dy] = offsetKm(a.lat, a.lon, b.lat, b.lon);
    const len = Math.hypot(dx, dy) || 1;
    // left-hand normal of travel direction = inland
    const nx = -dy / len;
    const ny = dx / len;
    const r = COAST_REGIONS[p.region];
    return {
      i,
      lat: p.lat,
      lon: p.lon,
      region: p.region,
      nx,
      ny,
      shelfWidthKm: r.shelfWidthKm,
      shelfDepthM: r.shelfDepthM,
      funnel: r.funnel,
      attenMPerKm: r.attenMPerKm,
      springHighM: r.springHighM,
    };
  });
}

export const COAST: CoastNode[] = build();

export const COASTLINE: LonLat[] = RAW.map(([lat, lon]) => [lon, lat]);

// ---- land / sea classification ----

const SEA_POLY: [number, number][] = [
  ...RAW.map(([lat, lon]) => [lat, lon] as [number, number]),
  [8.0, 98.3], [5.5, 100.3], [0, 100.3], [0, 77.5], [8.08, 77.55], [9.28, 79.2], [10.28, 79.86],
];

const SRI_LANKA: [number, number][] = [
  [9.83, 80.25], [8.9, 81.1], [8.0, 81.6], [7.0, 81.9], [6.2, 81.7], [5.92, 80.6], [6.4, 79.95], [7.3, 79.8],
  [8.3, 79.75], [9.0, 79.9], [9.83, 80.0],
];

export function isLand(lat: number, lon: number): boolean {
  if (pointInPolygon(lat, lon, SRI_LANKA)) return true;
  return !pointInPolygon(lat, lon, SEA_POLY);
}

export function nearestCoastNode(lat: number, lon: number): { node: CoastNode; distKm: number } {
  let best = COAST[0];
  let bestD = Infinity;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (const n of COAST) {
    const dx = (n.lon - lon) * cos;
    const dy = n.lat - lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = n;
    }
  }
  return { node: best, distKm: haversineKm(lat, lon, best.lat, best.lon) };
}

export function nearestPlace(lat: number, lon: number): string {
  let best = COAST_PLACES[0][0];
  let bestD = Infinity;
  for (const [name, la, lo] of COAST_PLACES) {
    const d = haversineKm(lat, lon, la, lo);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

export const TIDE_FACTOR: Record<string, number> = {
  spring_low: -1,
  low: -0.5,
  mean: 0,
  high: 0.6,
  spring_high: 1,
};
