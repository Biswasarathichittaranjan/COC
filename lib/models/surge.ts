// Parametric (bathystrophic-style) storm-surge model for the Bay of Bengal coast.
//
// At each coastal node the equilibrium surge is
//   eta_eq = funnel * F * (rho_a / (rho_w g)) * <Cd(U) * U_on * |U|> * L / h   (wind set-up over the shelf)
//          + 0.0099 m/hPa * (P_amb - P)                                         (inverse barometer)
//          + 0.012 s * U_on,coast * exposure                                    (wave set-up, larger on narrow shelves)
// where <...> is the onshore wind stress averaged along a transect across the shelf (seaward of the
// node), L the shelf width and h the mean shelf depth. The water level relaxes toward eta_eq with a
// ~2 h time scale so short wind bursts do not produce instant peaks. F is a single calibration
// factor tuned against historical events (scripts/calibrate.ts).
//
// Inland depth at a site: max(0, TWL_coast - attenuation * distance_inland - ground elevation).

import type { CoastNode, StormState } from "../types";
import { offsetKm } from "../geo";
import { pressureAt, P_AMBIENT, windVector } from "./wind";

export const SURGE_CALIBRATION = 1.0;
const K = 1.15 / (1025 * 9.81);
const RELAX_H = 2;
const MAX_RANGE_KM = 600;
const TRANSECT = [0.05, 0.35, 0.7]; // fractions of shelf width seaward of the coast

function dragCoefficient(u: number): number {
  return Math.min((0.75 + 0.067 * u) * 1e-3, 2.6e-3);
}

/** Peak storm surge (m, no tide) at every coast node for one ensemble member. */
export function peakSurge(member: StormState[], nodes: CoastNode[], F = SURGE_CALIBRATION): Float32Array {
  const n = nodes.length;
  const eta = new Float32Array(n);
  const peak = new Float32Array(n);
  const decay = Math.exp(-1 / RELAX_H);
  for (const s of member) {
    const latRange = MAX_RANGE_KM / 111;
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      let eq = 0;
      if (Math.abs(node.lat - s.lat) < latRange && Math.abs(node.lon - s.lon) < latRange * 1.1) {
        const [dx, dy] = offsetKm(s.lat, s.lon, node.lat, node.lon);
        const r = Math.hypot(dx, dy);
        if (r < MAX_RANGE_KM) {
          let stress = 0;
          let uOnCoast = 0;
          for (const f of TRANSECT) {
            const d = f * node.shelfWidthKm;
            const [ux, uy, u] = windVector(dx - node.nx * d, dy - node.ny * d, s, false);
            const uOn = ux * node.nx + uy * node.ny;
            stress += dragCoefficient(u) * uOn * u;
            if (f === TRANSECT[0]) uOnCoast = uOn;
          }
          stress /= TRANSECT.length;
          const setup = stress > 0 ? (F * K * stress * (node.shelfWidthKm * 1000)) / node.shelfDepthM : 0;
          const ib = 0.0099 * (P_AMBIENT - pressureAt(r, s));
          const exposure = Math.min(1, Math.max(0.3, 1.3 - node.shelfWidthKm / 150));
          const wave = uOnCoast > 0 ? 0.012 * uOnCoast * exposure : 0;
          eq = node.funnel * setup + ib + wave;
        }
      }
      eta[i] = eq + (eta[i] - eq) * decay;
      if (eta[i] > peak[i]) peak[i] = eta[i];
    }
  }
  // light along-shore smoothing (~25 km window)
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < n) {
        s += peak[j];
        c++;
      }
    }
    out[i] = Math.min(12, s / c);
  }
  return out;
}

/** Surge (excluding tide) below which coastal defences / natural banks are assumed to hold. */
export const MIN_FLOOD_SURGE_M = 0.3;

/**
 * Inland inundation depth. Ordinary tides are contained by embankments and natural banks, so
 * flooding requires a meaningful surge; when it occurs the tide adds to the water level.
 */
export function inlandDepth(surge: number, twlCoast: number, attenMPerKm: number, distKm: number, elevM: number): number {
  if (distKm > 80 || surge < MIN_FLOOD_SURGE_M) return 0;
  return Math.max(0, twlCoast - attenMPerKm * distKm - elevM);
}
