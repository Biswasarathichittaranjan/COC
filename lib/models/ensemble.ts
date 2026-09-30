// Monte-Carlo track/intensity ensemble around a control forecast.
//
// Error growth approximates recent North Indian Ocean official forecast skill:
// cross-track sigma ~ 50/90/125 km at 24/48/72 h, timing sigma ~ 1.4/2.9/4.3 h, intensity ~ +/-11/17/23 %.

import type { SimParams, StormState } from "../types";
import { destination, KT_TO_MS, lerp, MS_TO_KT, rng } from "../geo";
import { isLand } from "../data/coast";
import { assignMotion, HOUR, inlandDecayKt } from "./track";
import { defaultRmaxKm, deficitFromVmaxKt, hollandB, P_AMBIENT } from "./wind";

const sigmaCrossKm = (tau: number) => 15 + 1.5 * tau;
const sigmaTimingH = (tau: number) => 0.06 * tau;
const sigmaIntensity = (tau: number) => 0.05 + 0.0025 * tau;

function sample(states: StormState[], t: number): StormState | null {
  const t0 = states[0].t;
  const x = (t - t0) / HOUR;
  if (x < 0 || x > states.length - 1) return null;
  const i = Math.floor(x);
  const f = x - i;
  const a = states[i];
  const b = states[Math.min(i + 1, states.length - 1)];
  return {
    t,
    lat: lerp(a.lat, b.lat, f),
    lon: lerp(a.lon, b.lon, f),
    vmaxMs: lerp(a.vmaxMs, b.vmaxMs, f),
    pcHpa: lerp(a.pcHpa, b.pcHpa, f),
    rmaxKm: lerp(a.rmaxKm, b.rmaxKm, f),
    B: lerp(a.B, b.B, f),
    headingDeg: f < 0.5 ? a.headingDeg : b.headingDeg,
    speedMs: lerp(a.speedMs, b.speedMs, f),
    overLand: f < 0.5 ? a.overLand : b.overLand,
  };
}

/**
 * Generate ensemble members from `issueTime` to `endTime`. Member 0 is the control forecast
 * (user adjustments applied, no random perturbation).
 */
export function generateEnsemble(
  base: StormState[],
  issueTime: number,
  endTime: number,
  landfallBaseT: number | null,
  p: SimParams,
): StormState[][] {
  const r = rng(p.seed);
  // intensity the storm "would have" over water: hold landfall intensity after base landfall
  const baseLandIdx = landfallBaseT != null ? Math.round((landfallBaseT - base[0].t) / HOUR) : -1;
  const vLandfall = baseLandIdx > 0 ? base[baseLandIdx - 1].vmaxMs : null;
  const dpLandfall = baseLandIdx > 0 ? P_AMBIENT - base[baseLandIdx - 1].pcHpa : null;
  const leadToLandfall = landfallBaseT != null ? Math.max(6, (landfallBaseT - issueTime) / HOUR) : 48;

  const members: StormState[][] = [];
  for (let m = 0; m < p.members; m++) {
    const zc = m === 0 ? 0 : r.normal();
    const zt = m === 0 ? 0 : r.normal();
    const zi = m === 0 ? 0 : r.normal();
    const zr = m === 0 ? 0 : r.normal();
    const out: StormState[] = [];
    let landedAt: number | null = null;
    let vAtLanding = 0;
    for (let t = issueTime; t <= endTime; t += HOUR) {
      const tau = (t - issueTime) / HOUR;
      const tb = issueTime + (tau * p.speedScale + zt * sigmaTimingH(tau)) * HOUR;
      const s = sample(base, tb);
      if (!s) break;
      const shift = zc * sigmaCrossKm(tau) + p.crossTrackShiftKm * Math.min(1, tau / leadToLandfall);
      const [lat, lon] = Math.abs(shift) > 0.01 ? destination(s.lat, s.lon, s.headingDeg + 90, shift) : [s.lat, s.lon];
      const overLand = isLand(lat, lon);

      const afterBaseLandfall = landfallBaseT != null && tb >= landfallBaseT;
      const seaV = afterBaseLandfall && vLandfall != null ? vLandfall : s.vmaxMs;
      const seaDp = afterBaseLandfall && dpLandfall != null ? dpLandfall : P_AMBIENT - s.pcHpa;
      const factor = p.intensityScale * Math.exp(zi * sigmaIntensity(tau));
      let vKt = seaV * factor * MS_TO_KT;
      if (overLand && landedAt == null && tau > 0) {
        landedAt = t;
        vAtLanding = vKt;
      }
      if (landedAt != null) vKt = inlandDecayKt(vAtLanding, (t - landedAt) / HOUR);
      vKt = Math.max(15, vKt);
      const vMs = vKt * KT_TO_MS;
      const baseV = Math.max(seaV, 1);
      const dp = Math.max(2, seaDp > 0 ? seaDp * (vMs / baseV) ** 2 : deficitFromVmaxKt(vKt));
      const rmax = (s.rmaxKm || defaultRmaxKm(vMs, lat)) * p.rmaxScale * Math.exp(zr * 0.2) * (landedAt != null ? 1 + 0.015 * ((t - landedAt) / HOUR) : 1);
      out.push({
        t,
        lat,
        lon,
        vmaxMs: vMs,
        pcHpa: P_AMBIENT - dp,
        rmaxKm: Math.min(rmax, 120),
        B: hollandB(vMs, dp),
        headingDeg: s.headingDeg,
        speedMs: s.speedMs,
        overLand,
      });
    }
    members.push(assignMotion(out));
  }
  return members;
}
