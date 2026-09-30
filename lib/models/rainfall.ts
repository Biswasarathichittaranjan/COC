// Tropical-cyclone rainfall climatology-persistence model (R-CLIPER; Tuleya et al. 2007),
// with a simple orographic enhancement for the hill ranges that ring the Bay.

import { MS_TO_KT } from "../geo";

// R-CLIPER was fitted to Atlantic landfalls; Bay of Bengal cyclones embedded in the monsoon
// moisture field are wetter (e.g. ~240 mm/24 h at Kolkata in Amphan), so scale up modestly.
const NIO_MOISTURE_FACTOR = 1.25;

/** Rain rate (mm/h) at radius r (km) from the centre of a storm with max wind vmaxMs. */
export function rcliperRate(rKm: number, vmaxMs: number): number {
  const vKt = Math.max(20, vmaxMs * MS_TO_KT);
  const U = 1 + (vKt - 35) / 33;
  const T0 = -1.1 + 3.96 * U; // in/day at centre
  const Tm = -1.6 + 4.8 * U; // in/day at rm
  const rm = Math.max(10, 64.5 - 13.0 * U);
  const re = Math.max(40, 150.0 - 16.0 * U);
  const inPerDay = rKm < rm ? T0 + (Tm - T0) * (rKm / rm) : Tm * Math.exp(-(rKm - rm) / re);
  return (Math.max(0, inPerDay) * 25.4 * NIO_MOISTURE_FACTOR) / 24;
}

const ORO: { lat: [number, number]; lon: [number, number]; f: number }[] = [
  { lat: [25.0, 26.2], lon: [90.0, 92.6], f: 1.8 }, // Meghalaya plateau
  { lat: [21.6, 23.6], lon: [91.8, 92.8], f: 1.4 }, // Chittagong Hill Tracts
  { lat: [22.6, 24.6], lon: [92.2, 93.6], f: 1.3 }, // Mizoram / Tripura hills
  { lat: [17.0, 21.0], lon: [93.4, 94.9], f: 1.35 }, // Arakan Yoma
  { lat: [17.5, 19.8], lon: [82.4, 84.2], f: 1.25 }, // Eastern Ghats (north)
  { lat: [14.0, 16.5], lon: [97.5, 99.0], f: 1.3 }, // Tenasserim hills
];

export function orographicFactor(lat: number, lon: number): number {
  for (const o of ORO) {
    if (lat >= o.lat[0] && lat <= o.lat[1] && lon >= o.lon[0] && lon <= o.lon[1]) return o.f;
  }
  return 1;
}
