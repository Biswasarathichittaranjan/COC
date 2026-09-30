// Track processing: hourly interpolation, landfall detection, synthetic tracks and inland decay.

import type { CustomStormSpec, StormState, TrackPoint } from "../types";
import { bearingDeg, destination, haversineKm, KT_TO_MS, lerp, MS_TO_KT } from "../geo";
import { isLand } from "../data/coast";
import { defaultRmaxKm, deficitFromVmaxKt, hollandB, P_AMBIENT } from "./wind";

export const HOUR = 3_600_000;

/** Kaplan & DeMaria (1995) inland decay: V(t) = Vb + (R*V0 - Vb) * exp(-a t), knots. */
export function inlandDecayKt(v0Kt: number, hoursOverLand: number): number {
  const Vb = 26.7;
  const R = 0.9;
  const a = 0.095;
  if (v0Kt <= Vb) return v0Kt * Math.exp(-0.02 * hoursOverLand);
  return Vb + (R * v0Kt - Vb) * Math.exp(-a * hoursOverLand);
}

export function makeState(
  t: number,
  lat: number,
  lon: number,
  vmaxKt: number,
  opts: { pcHpa?: number; rmaxKm?: number; headingDeg?: number; speedMs?: number } = {},
): StormState {
  const vmaxMs = Math.max(vmaxKt, 10) * KT_TO_MS;
  const dp = opts.pcHpa ? Math.max(2, P_AMBIENT - opts.pcHpa) : deficitFromVmaxKt(vmaxKt);
  return {
    t,
    lat,
    lon,
    vmaxMs,
    pcHpa: P_AMBIENT - dp,
    rmaxKm: opts.rmaxKm ?? defaultRmaxKm(vmaxMs, lat),
    B: hollandB(vmaxMs, dp),
    headingDeg: opts.headingDeg ?? 0,
    speedMs: opts.speedMs ?? 0,
    overLand: isLand(lat, lon),
  };
}

/** Recompute heading and translation speed from consecutive positions. */
export function assignMotion(states: StormState[]): StormState[] {
  for (let i = 0; i < states.length; i++) {
    const a = states[Math.max(0, i - 1)];
    const b = states[Math.min(states.length - 1, i + 1)];
    if (a === b) continue;
    const dt = (b.t - a.t) / 1000;
    states[i].headingDeg = bearingDeg(a.lat, a.lon, b.lat, b.lon);
    states[i].speedMs = dt > 0 ? (haversineKm(a.lat, a.lon, b.lat, b.lon) * 1000) / dt : 0;
  }
  return states;
}

/** Hourly states interpolated from 3-12 hourly track points. */
export function hourlyStates(track: TrackPoint[]): StormState[] {
  const pts = [...track].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const out: StormState[] = [];
  const t0 = Math.ceil(Date.parse(pts[0].t) / HOUR) * HOUR;
  const tEnd = Date.parse(pts[pts.length - 1].t);
  let k = 0;
  for (let t = t0; t <= tEnd; t += HOUR) {
    while (k < pts.length - 2 && Date.parse(pts[k + 1].t) < t) k++;
    const a = pts[k];
    const b = pts[Math.min(k + 1, pts.length - 1)];
    const ta = Date.parse(a.t);
    const tb = Date.parse(b.t);
    const f = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    const pc = a.pcHpa && b.pcHpa ? lerp(a.pcHpa, b.pcHpa, f) : undefined;
    const rmax = a.rmaxKm && b.rmaxKm ? lerp(a.rmaxKm, b.rmaxKm, f) : undefined;
    out.push(makeState(t, lerp(a.lat, b.lat, f), lerp(a.lon, b.lon, f), lerp(a.vmaxKt, b.vmaxKt, f), { pcHpa: pc, rmaxKm: rmax }));
  }
  return assignMotion(out);
}

export interface Landfall {
  index: number;
  t: number;
  lat: number;
  lon: number;
  vmaxKt: number;
}

export function findLandfall(states: StormState[], fromIndex = 0): Landfall | null {
  for (let i = Math.max(1, fromIndex); i < states.length; i++) {
    const s = states[i];
    if (s.overLand && !states[i - 1].overLand) {
      // require the storm to stay over land for 2+ hours (ignores islands / coastline noise)
      const next = states[Math.min(i + 2, states.length - 1)];
      if (!next.overLand) continue;
      return { index: i, t: s.t, lat: s.lat, lon: s.lon, vmaxKt: states[i - 1].vmaxMs * MS_TO_KT };
    }
  }
  return null;
}

/** Synthetic straight-line track through a chosen landfall point. */
export function buildCustomTrack(spec: CustomStormSpec, landfallTime: number): TrackPoint[] {
  const before = 96;
  const after = 36;
  const peak = Math.max(spec.peakVmaxKt ?? spec.vmaxKt, spec.vmaxKt);
  const back = (spec.headingDeg + 180) % 360;
  const pts: TrackPoint[] = [];
  for (let h = -before; h <= after; h += 3) {
    const dist = Math.abs(h) * spec.speedKmh;
    const [lat, lon] = h <= 0
      ? destination(spec.landfallLat, spec.landfallLon, back, dist)
      : destination(spec.landfallLat, spec.landfallLon, spec.headingDeg, dist);
    let v: number;
    if (h <= -24) {
      // genesis to peak
      const f = (h + before) / (before - 24);
      v = 30 + (peak - 30) * Math.min(1, Math.pow(f, 1.3));
    } else if (h <= 0) {
      v = lerp(peak, spec.vmaxKt, (h + 24) / 24);
    } else {
      v = inlandDecayKt(spec.vmaxKt, h);
    }
    pts.push({
      t: new Date(landfallTime + h * HOUR).toISOString(),
      lat,
      lon,
      vmaxKt: Math.round(v),
      rmaxKm: spec.rmaxKm ? spec.rmaxKm * (h > 0 ? 1 + 0.02 * h : 1) : undefined,
    });
  }
  return pts;
}
