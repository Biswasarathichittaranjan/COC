// Parametric tropical-cyclone wind and pressure field (Holland 1980 profile, surface form).

import type { LonLat, StormState } from "../types";
import { clamp, destination, KT_TO_MS } from "../geo";

export const P_AMBIENT = 1008; // hPa, typical North Indian Ocean environmental pressure
const RHO_AIR = 1.15;
const INFLOW = (20 * Math.PI) / 180;
const LAND_ROUGHNESS = 0.85; // open-terrain reduction relative to over-water winds

/** Pressure deficit consistent with Vmax for the North Indian Ocean (V_kt ~ 14.2 * sqrt(dP)). */
export function deficitFromVmaxKt(vmaxKt: number): number {
  return Math.max(2, (vmaxKt / 14.2) ** 2);
}

export function hollandB(vmaxMs: number, dpHpa: number): number {
  return clamp((RHO_AIR * Math.E * vmaxMs * vmaxMs) / (dpHpa * 100), 1.0, 2.2);
}

/** Radius of maximum winds (Willoughby et al. 2006 style fit), km. */
export function defaultRmaxKm(vmaxMs: number, lat: number): number {
  return clamp(46.4 * Math.exp(-0.0155 * vmaxMs + 0.0169 * Math.abs(lat)), 12, 80);
}

/** Symmetric (storm-relative) wind speed at radius r (km). */
export function hollandSpeed(rKm: number, rmaxKm: number, vmaxMs: number, B: number): number {
  const r = Math.max(rKm, 0.5);
  const x = Math.pow(rmaxKm / r, B);
  return vmaxMs * Math.sqrt(x * Math.exp(1 - x));
}

export function pressureAt(rKm: number, s: StormState): number {
  const r = Math.max(rKm, 0.5);
  const dp = P_AMBIENT - s.pcHpa;
  return s.pcHpa + dp * Math.exp(-Math.pow(s.rmaxKm / r, s.B));
}

/**
 * Surface wind vector (m/s, east/north components) at a point offset (dx, dy km) from the storm centre.
 * Northern-hemisphere cyclonic rotation with inflow angle plus a translation asymmetry, so the
 * front-right quadrant is strongest.
 */
export function windVector(dx: number, dy: number, s: StormState, overLand: boolean): [number, number, number] {
  const r = Math.hypot(dx, dy);
  const vt = s.speedMs;
  const vSym = hollandSpeed(r, s.rmaxKm, Math.max(s.vmaxMs - 0.55 * vt, s.vmaxMs * 0.7), s.B);
  let ux = 0;
  let uy = 0;
  if (r > 0.01) {
    const tx = -dy / r; // counter-clockwise tangential
    const ty = dx / r;
    const ix = -dx / r; // inward
    const iy = -dy / r;
    ux = vSym * (Math.cos(INFLOW) * tx + Math.sin(INFLOW) * ix);
    uy = vSym * (Math.cos(INFLOW) * ty + Math.sin(INFLOW) * iy);
  }
  const hd = (s.headingDeg * Math.PI) / 180;
  const f = s.vmaxMs > 0 ? 0.55 * (vSym / s.vmaxMs) : 0;
  ux += f * vt * Math.sin(hd);
  uy += f * vt * Math.cos(hd);
  const k = overLand ? LAND_ROUGHNESS : 1;
  ux *= k;
  uy *= k;
  return [ux, uy, Math.hypot(ux, uy)];
}

/** Polygon (lon/lat ring) enclosing winds >= thresholdKt around a storm state. */
export function windRadiusPolygon(s: StormState, thresholdKt: number, n = 48): LonLat[] | null {
  const thr = thresholdKt * KT_TO_MS;
  if (s.vmaxMs < thr) return null;
  const ring: LonLat[] = [];
  for (let k = 0; k <= n; k++) {
    const brg = (360 * k) / n;
    const b = (brg * Math.PI) / 180;
    // march outward from Rmax until wind drops below threshold
    let lo = s.rmaxKm;
    let hi = 800;
    const at = (r: number) => windVector(r * Math.sin(b), r * Math.cos(b), s, false)[2];
    if (at(lo) < thr) {
      lo = 1;
    }
    if (at(hi) >= thr) hi = 800;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2;
      if (at(mid) >= thr) lo = mid;
      else hi = mid;
    }
    const [la, lo2] = destination(s.lat, s.lon, brg, lo);
    ring.push([lo2, la]);
  }
  return ring;
}
