// Calibration check: control-track peak surge for each historical storm vs. reported ranges.
// Run with: npm run calibrate

import { HISTORICAL_STORMS } from "../lib/data/storms";
import { COAST, nearestPlace } from "../lib/data/coast";
import { findLandfall, hourlyStates } from "../lib/models/track";
import { peakSurge, SURGE_CALIBRATION } from "../lib/models/surge";
import { MS_TO_KT } from "../lib/geo";

console.log(`Surge calibration factor F = ${SURGE_CALIBRATION}\n`);
console.log("storm".padEnd(30), "landfall".padEnd(22), "model peak (m)".padEnd(16), "at".padEnd(20), "reported (m)");
let inRange = 0;
for (const storm of HISTORICAL_STORMS) {
  const states = hourlyStates(storm.track);
  const lf = findLandfall(states);
  const peaks = peakSurge(states, COAST);
  let best = 0;
  let bi = 0;
  peaks.forEach((v, i) => {
    if (v > best) {
      best = v;
      bi = i;
    }
  });
  const rep = storm.reported?.peakSurgeM;
  const ok = rep ? best >= rep[0] * 0.8 && best <= rep[1] * 1.2 : false;
  if (ok) inRange++;
  const lfTxt = lf ? `${nearestPlace(lf.lat, lf.lon)} ${Math.round(lf.vmaxKt)}kt` : "none";
  console.log(
    `${storm.name} ${storm.year}`.padEnd(30),
    lfTxt.padEnd(22),
    best.toFixed(2).padEnd(16),
    nearestPlace(COAST[bi].lat, COAST[bi].lon).padEnd(20),
    rep ? `${rep[0]}-${rep[1]} ${ok ? "OK" : "OUT"}` : "-",
  );
  void MS_TO_KT;
}
console.log(`\n${inRange}/${HISTORICAL_STORMS.length} storms within +/-20% of the reported range.`);
