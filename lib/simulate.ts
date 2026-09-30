// Ensemble risk simulation: track ensemble -> wind / surge / rainfall hazards -> exposure,
// fragility, damage pathways, alert levels, anticipatory-action stages and parametric triggers.

import type {
  Asset,
  AssetResult,
  CoastResult,
  CoverResult,
  District,
  DistrictResult,
  EnsembleTrack,
  Grid,
  HazardStats,
  LonLat,
  SimParams,
  SimResult,
  Storm,
  StormState,
} from "./types";
import { COAST, isLand, nearestCoastNode, nearestPlace, TIDE_FACTOR } from "./data/coast";
import { COVERS } from "./data/covers";
import { destination, fragility, haversineKm, mean, MS_TO_KT, offsetKm, probAbove, quantile } from "./geo";
import { generateEnsemble } from "./models/ensemble";
import { aaStage, alertLevel, computePathways, FRAGILITY, type MemberHazard } from "./models/impacts";
import { orographicFactor, rcliperRate } from "./models/rainfall";
import { inlandDepth, MIN_FLOOD_SURGE_M, peakSurge } from "./models/surge";
import { findLandfall, HOUR, hourlyStates } from "./models/track";
import { windVector } from "./models/wind";

export interface SimContext {
  storm: Storm;
  districts: District[];
  assets: Asset[];
  liveForecast?: Record<string, { rain72Mm: number; gustMaxMs: number }>;
  elevationSource: "seed" | "nasadem";
}

interface EvalPoint {
  lat: number;
  lon: number;
  elev: number;
  oro: number;
  coastIdx: number;
  coastDist: number;
}

const GALE_MS = 17.49; // 34 kt
const STORM_MS = 25.72; // 50 kt
const HURRICANE_MS = 32.92; // 64 kt
const POINT_RANGE_KM = 900;
const GRID_RANGE_KM = 520;

function r1(x: number) {
  return Math.round(x * 10) / 10;
}
function r2(x: number) {
  return Math.round(x * 100) / 100;
}

function noisyOr(ps: number[]) {
  let q = 1;
  for (const p of ps) q *= 1 - Math.min(1, Math.max(0, p));
  return 1 - q;
}

function median(xs: number[]) {
  return xs.length ? quantile(xs, 0.5) : 0;
}

export function runSimulation(params: SimParams, ctx: SimContext): SimResult {
  const started = performance.now();
  const notes: string[] = [];
  const { storm } = ctx;
  const base = hourlyStates(storm.track);
  if (base.length < 3) throw new Error("Track too short to simulate");

  // ----- forecast issue time -----
  const lf = findLandfall(base);
  let tRef = base[base.length - 1].t;
  if (lf) tRef = lf.t;
  else {
    let best = Infinity;
    for (const s of base) {
      const d = nearestCoastNode(s.lat, s.lon).distKm;
      if (d < best) {
        best = d;
        tRef = s.t;
      }
    }
    notes.push("No landfall in track; lead time measured to closest approach to the coast.");
  }
  let issue: number;
  const lastObserved = [...storm.track].reverse().find((p) => !p.forecast);
  if (storm.source === "gdacs" && lastObserved && storm.track.some((p) => p.forecast)) {
    issue = Math.floor(Date.parse(lastObserved.t) / HOUR) * HOUR;
    notes.push("Live storm: ensemble starts from the latest observed advisory position.");
  } else {
    issue = tRef - params.leadHours * HOUR;
  }
  issue = Math.max(base[0].t, Math.min(issue, base[base.length - 1].t - 6 * HOUR));
  issue = base[0].t + Math.round((issue - base[0].t) / HOUR) * HOUR;

  const endBase = Math.min(base[base.length - 1].t, tRef + 48 * HOUR);
  const endReal = Math.min(issue + (endBase - issue) / Math.max(0.3, params.speedScale), issue + 168 * HOUR);
  const members = generateEnsemble(base, issue, endReal, lf?.t ?? null, params);
  const control = members[0];
  if (control.length < 2) throw new Error("Not enough forecast hours after the issue time");

  // ----- coastal surge -----
  const tideF = TIDE_FACTOR[params.tide] ?? 0;
  const surges = members.map((m) => peakSurge(m, COAST));
  const twlByMember = surges.map((arr) => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[i] + tideF * COAST[i].springHighM;
    return out;
  });
  const coast: CoastResult[] = COAST.map((n, i) => {
    const s = surges.map((a) => a[i]);
    const t = twlByMember.map((a) => a[i]);
    return {
      i,
      lat: n.lat,
      lon: n.lon,
      region: n.region,
      surgeMean: r2(mean(s)),
      surgeP90: r2(quantile(s, 0.9)),
      twlMean: r2(mean(t)),
      twlP90: r2(quantile(t, 0.9)),
      pTwl2m: r2(probAbove(t, 2)),
      atten: n.attenMPerKm,
      nx: r2(n.nx),
      ny: r2(n.ny),
    };
  });

  // ----- evaluation points -----
  const points: EvalPoint[] = [];
  const addPoint = (lat: number, lon: number, elev: number) => {
    const { node, distKm } = nearestCoastNode(lat, lon);
    points.push({ lat, lon, elev, oro: orographicFactor(lat, lon), coastIdx: node.i, coastDist: distKm });
    return points.length - 1;
  };
  // centroid + a 30 km ring approximates "anywhere in the district" for alerting
  const districtPts = ctx.districts.map((d) => {
    const c = addPoint(d.lat, d.lon, d.elevM);
    const ring = [0, 90, 180, 270].map((b) => {
      const [la, lo] = destination(d.lat, d.lon, b, 30);
      return addPoint(la, lo, d.elevM);
    });
    return { c, area: [c, ...ring], l: addPoint(d.lowland.lat, d.lowland.lon, d.lowland.elevM) };
  });
  const assetPts = ctx.assets.map((a) => {
    if (a.path && a.path.length > 1) {
      const idx: number[] = [];
      for (let k = 0; k < a.path.length; k++) {
        const [lon, lat] = a.path[k];
        idx.push(addPoint(lat, lon, a.elevM));
        if (k < a.path.length - 1) {
          const [lon2, lat2] = a.path[k + 1];
          idx.push(addPoint((lat + lat2) / 2, (lon + lon2) / 2, a.elevM));
        }
      }
      return idx;
    }
    return [addPoint(a.lat, a.lon, a.elevM)];
  });
  const coverPts = COVERS.map((c) => (c.index === "rain" ? addPoint(c.lat, c.lon, 5) : -1));

  const P = points.length;
  const M = members.length;
  const wind = Array.from({ length: P }, () => new Float32Array(M));
  const rainTot = Array.from({ length: P }, () => new Float32Array(M));
  const rain24 = Array.from({ length: P }, () => new Float32Array(M));
  const depth = Array.from({ length: P }, () => new Float32Array(M));
  const twlAt = Array.from({ length: P }, () => new Float32Array(M));
  const onset: (number | null)[][] = Array.from({ length: P }, () => new Array(M).fill(null));
  const peakAt: (number | null)[][] = Array.from({ length: P }, () => new Array(M).fill(null));

  for (let m = 0; m < M; m++) {
    const states = members[m];
    const ring = new Float32Array(P * 24);
    const sum24 = new Float32Array(P);
    for (let h = 0; h < states.length; h++) {
      const s = states[h];
      const slot = h % 24;
      for (let p = 0; p < P; p++) {
        const pt = points[p];
        let rain = 0;
        if (Math.abs(pt.lat - s.lat) < 8.5 && Math.abs(pt.lon - s.lon) < 9) {
          const [dx, dy] = offsetKm(s.lat, s.lon, pt.lat, pt.lon);
          const r = Math.hypot(dx, dy);
          if (r < POINT_RANGE_KM) {
            const w = windVector(dx, dy, s, true)[2];
            if (w > wind[p][m]) {
              wind[p][m] = w;
              peakAt[p][m] = h;
            }
            if (w >= GALE_MS && onset[p][m] == null) onset[p][m] = h;
            rain = rcliperRate(r, s.vmaxMs) * pt.oro;
          }
        }
        rainTot[p][m] += rain;
        const k = p * 24 + slot;
        sum24[p] += rain - ring[k];
        ring[k] = rain;
        if (sum24[p] > rain24[p][m]) rain24[p][m] = sum24[p];
      }
    }
    for (let p = 0; p < P; p++) {
      const pt = points[p];
      const twl = twlByMember[m][pt.coastIdx];
      twlAt[p][m] = twl;
      depth[p][m] = inlandDepth(surges[m][pt.coastIdx], twl, COAST[pt.coastIdx].attenMPerKm, pt.coastDist, pt.elev);
    }
  }

  // ----- live forecast blending (Open-Meteo) -----
  if (ctx.liveForecast && params.live) {
    let blended = 0;
    ctx.districts.forEach((d, k) => {
      const f = ctx.liveForecast?.[d.id];
      if (!f) return;
      for (const p of [...districtPts[k].area, districtPts[k].l]) {
        const modelMean = mean(Array.from(rainTot[p]));
        if (f.rain72Mm > modelMean && f.rain72Mm > 20) {
          const factor = Math.min(3, f.rain72Mm / Math.max(modelMean, 10));
          for (let m = 0; m < M; m++) {
            rainTot[p][m] = Math.max(rainTot[p][m] * factor, f.rain72Mm * 0.5);
            rain24[p][m] = Math.max(rain24[p][m] * factor, f.rain72Mm * 0.4);
          }
          blended++;
        }
      }
    });
    notes.push(`Real-time Open-Meteo 72 h rainfall blended into ${blended} district points where it exceeded the parametric estimate.`);
  }

  const statsFor = (idx: number[]): HazardStats => {
    // combine several points (e.g. road vertices) by taking the per-member maximum
    const w: number[] = [];
    const rt: number[] = [];
    const r24: number[] = [];
    const dp: number[] = [];
    const on: number[] = [];
    const pk: number[] = [];
    for (let m = 0; m < M; m++) {
      let a = 0,
        b = 0,
        c = 0,
        d = 0;
      let o: number | null = null;
      let q: number | null = null;
      for (const p of idx) {
        a = Math.max(a, wind[p][m]);
        b = Math.max(b, rainTot[p][m]);
        c = Math.max(c, rain24[p][m]);
        d = Math.max(d, depth[p][m]);
        const op = onset[p][m];
        if (op != null && (o == null || op < o)) o = op;
        const pp = peakAt[p][m];
        if (pp != null && (q == null || pp < q)) q = pp;
      }
      w.push(a);
      rt.push(b);
      r24.push(c);
      dp.push(d);
      if (o != null) on.push(o);
      if (q != null && a >= GALE_MS) pk.push(q);
    }
    return {
      windMeanMs: r1(mean(w)),
      windP90Ms: r1(quantile(w, 0.9)),
      p34: r2(probAbove(w, GALE_MS)),
      p50: r2(probAbove(w, STORM_MS)),
      p64: r2(probAbove(w, HURRICANE_MS)),
      rainMeanMm: Math.round(mean(rt)),
      rain24MeanMm: Math.round(mean(r24)),
      pRain24Heavy: r2(probAbove(r24, 115.6)),
      pRain24Extreme: r2(probAbove(r24, 204.5)),
      depthMeanM: r2(mean(dp)),
      depthP90M: r2(quantile(dp, 0.9)),
      pDepth05: r2(probAbove(dp, 0.5)),
      pDepth1: r2(probAbove(dp, 1)),
      galeOnsetH: on.length >= M * 0.3 ? Math.round(median(on)) : null,
      peakH: pk.length >= M * 0.3 ? Math.round(median(pk)) : null,
    };
  };

  const memberHazard = (idx: number[]): MemberHazard => {
    const pick = (arr: Float32Array[]) => Array.from({ length: M }, (_, m) => Math.max(...idx.map((p) => arr[p][m])));
    return { wind: pick(wind), rainTotal: pick(rainTot), rain24: pick(rain24), depth: pick(depth), twlCoast: pick(twlAt) };
  };

  // ----- assets: direct fragility -----
  const districtById = new Map(ctx.districts.map((d) => [d.id, d]));
  const assetDirect = ctx.assets.map((a, k) => {
    const idx = assetPts[k];
    const f = FRAGILITY[a.type];
    const hilly = districtById.get(a.districtId)?.terrain === "hilly";
    const pw: number[] = [];
    const pd: number[] = [];
    const pr: number[] = [];
    const pl: number[] = [];
    for (let m = 0; m < M; m++) {
      let w = 0,
        d = 0,
        r = 0,
        rt = 0;
      for (const p of idx) {
        w = Math.max(w, wind[p][m]);
        d = Math.max(d, depth[p][m]);
        r = Math.max(r, rain24[p][m]);
        rt = Math.max(rt, rainTot[p][m]);
      }
      const susceptibility = a.elevM < 5 ? 1 : a.elevM < 15 ? 0.6 : 0.35;
      pw.push(fragility(w, f.wind[0], f.wind[1]));
      pd.push(fragility(d, f.depth[0], f.depth[1]));
      const rainP = fragility(r, f.rain24[0], f.rain24[1]) * susceptibility;
      const slide = a.type === "road" && hilly ? fragility(rt, 250, 0.4) : 0;
      pr.push(noisyOr([rainP, slide]));
      pl.push(noisyOr([pw[m], pd[m], pr[m]]));
    }
    return { pw: mean(pw), pd: mean(pd), pr: mean(pr), pl: mean(pl), stats: statsFor(idx) };
  });

  // ----- districts -----
  const districts: DistrictResult[] = ctx.districts.map((d, k) => {
    const { area, l } = districtPts[k];
    const hazard = statsFor(area);
    const lowland = statsFor([l]);
    const hospitals = ctx.assets
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.districtId === d.id && a.type === "hospital");
    const hospitalLoss = hospitals.length ? Math.max(...hospitals.map(({ i }) => assetDirect[i].pl)) : 0;
    const pathways = computePathways(d, memberHazard(area), memberHazard([l]), hospitalLoss);
    const alert = alertLevel(hazard, lowland);
    const onsetH = hazard.galeOnsetH ?? lowland.galeOnsetH;
    const Hw = Math.max(hazard.p64, lowland.p64, 0.5 * Math.max(hazard.p50, lowland.p50));
    const Hs = lowland.pDepth1;
    const Hr = Math.max(hazard.pRain24Extreme, lowland.pRain24Extreme);
    const H = noisyOr([Hw, Hs, Hr]);
    const depthLow = Array.from(depth[l]);
    const popExposedSurge = Math.round(d.population * d.lowlandShare * mean(depthLow.map((x) => Math.min(1, Math.max(0, x / 1.5)))));
    const popAtRisk = Math.round(
      d.population * Math.max(d.lowlandShare * lowland.pDepth05, 0.5 * Math.max(hazard.p64, lowland.p64), 0.3 * Hr),
    );
    return {
      id: d.id,
      name: d.name,
      country: d.country,
      admin1: d.admin1,
      authorityId: d.authorityId,
      lat: d.lat,
      lon: d.lon,
      population: d.population,
      hazard,
      lowland,
      riskScore: Math.round(100 * H * (0.55 + 0.45 * d.vulnerability)),
      alert,
      popExposedSurge,
      popAtRisk,
      aaStage: aaStage(alert, onsetH),
      pathways,
      liveForecast: ctx.liveForecast?.[d.id],
    };
  });
  const districtResultById = new Map(districts.map((d) => [d.id, d]));

  // ----- assets: add access / dependency losses -----
  const assets: AssetResult[] = ctx.assets.map((a, k) => {
    const dd = assetDirect[k];
    const dr = districtResultById.get(a.districtId);
    const roads = dr?.pathways.nodes.find((n) => n.id === "i_roads")?.p ?? 0;
    const power = dr?.pathways.nodes.find((n) => n.id === "i_power")?.p ?? 0;
    let access = 0;
    if (a.type === "shelter") access = 0.6 * roads;
    else if (a.type === "hospital") access = noisyOr([0.4 * roads, 0.3 * power]);
    else if (a.type === "port") access = 0.3 * roads;
    const pLoss = noisyOr([dd.pl, access]);
    const byHazard = { wind: r2(dd.pw), surge: r2(dd.pd), rain: r2(dd.pr), access: r2(access) };
    const dominant = (Object.entries(byHazard).sort((x, y) => y[1] - x[1])[0][0]) as AssetResult["dominant"];
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      lat: a.lat,
      lon: a.lon,
      districtId: a.districtId,
      criticality: a.criticality,
      elevM: a.elevM,
      hazard: dd.stats,
      pLoss: r2(pLoss),
      pByHazard: byHazard,
      dominant,
      path: a.path,
      source: a.source,
    };
  });

  // ----- parametric covers -----
  const covers: CoverResult[] = COVERS.map((c, k) => {
    const idxVals: number[] = [];
    for (let m = 0; m < M; m++) {
      let v = 0;
      if (c.index === "wind_box") {
        for (const s of members[m]) {
          if (haversineKm(s.lat, s.lon, c.lat, c.lon) <= c.radiusKm) v = Math.max(v, s.vmaxMs * MS_TO_KT);
        }
      } else if (c.index === "rain") {
        const p = coverPts[k];
        v = c.rainMetric === "max24" ? rain24[p][m] : rainTot[p][m];
      } else {
        COAST.forEach((n, i) => {
          if (surges[m][i] >= MIN_FLOOD_SURGE_M && haversineKm(n.lat, n.lon, c.lat, c.lon) <= c.radiusKm) v = Math.max(v, twlByMember[m][i]);
        });
      }
      idxVals.push(v);
    }
    const payouts = idxVals.map((v) => {
      let pct = 0;
      for (const t of c.tiers) if (v >= t.threshold) pct = t.payoutPct;
      return pct * c.limitUsd;
    });
    const tierProbs = c.tiers.map((t, ti) => {
      const next = c.tiers[ti + 1];
      const p = idxVals.filter((v) => v >= t.threshold && (!next || v < next.threshold)).length / M;
      return { label: t.label, payoutPct: t.payoutPct, p: r2(p) };
    });
    return {
      id: c.id,
      name: c.name,
      country: c.country,
      index: c.index,
      indexLabel: c.indexLabel,
      limitUsd: c.limitUsd,
      pTrigger: r2(payouts.filter((x) => x > 0).length / M),
      expectedPayoutUsd: Math.round(mean(payouts)),
      p90PayoutUsd: Math.round(quantile(payouts, 0.9)),
      tierProbs,
      lat: c.lat,
      lon: c.lon,
      radiusKm: c.radiusKm,
    };
  });

  // ----- hazard grids -----
  const grids = computeGrids(members.slice(0, Math.min(M, 24)));

  // ----- tracks, cone, landfall spread -----
  const toCoords = (states: StormState[], step: number): LonLat[] =>
    states.filter((_, i) => i % step === 0 || i === states.length - 1).map((s) => [r2(s.lon), r2(s.lat)] as LonLat);
  const memberTracks: EnsembleTrack[] = members.slice(0, 40).map((m, i) => ({ member: i, coords: toCoords(m, 3) }));
  const observed = base.filter((s) => s.t <= issue).filter((_, i) => i % 3 === 0).map((s) => [r2(s.lon), r2(s.lat)] as LonLat);
  const cone = buildCone(members);

  const landfalls = members
    .map((m) => m.find((s, i) => i > 0 && s.overLand && !m[i - 1].overLand))
    .filter((s): s is StormState => !!s);
  const lfControl = control.find((s, i) => i > 0 && s.overLand && !control[i - 1].overLand);
  const landfallSpreadKm = lfControl && landfalls.length > 2
    ? Math.round(Math.sqrt(mean(landfalls.map((s) => haversineKm(s.lat, s.lon, lfControl.lat, lfControl.lon) ** 2))))
    : 0;

  // ----- summary -----
  // peak water level among surge-affected coast (tide alone does not count as an impact)
  let peakI = 0;
  coast.forEach((c, i) => {
    if (c.surgeMean > coast[peakI].surgeMean) peakI = i;
  });
  coast.forEach((c, i) => {
    if (c.surgeP90 >= MIN_FLOOD_SURGE_M && c.twlMean > coast[peakI].twlMean) peakI = i;
  });
  const onsets = districts.map((d) => d.hazard.galeOnsetH).filter((x): x is number => x != null);
  const summary = {
    peakTwlM: coast[peakI].twlMean,
    peakTwlPlace: nearestPlace(coast[peakI].lat, coast[peakI].lon),
    popRed: districts.filter((d) => d.alert === "RED").reduce((s, d) => s + d.population, 0),
    popExposedSurge: districts.reduce((s, d) => s + d.popExposedSurge, 0),
    assetsHighRisk: assets.filter((a) => a.pLoss >= 0.5).length,
    districtsRed: districts.filter((d) => d.alert === "RED").length,
    districtsOrange: districts.filter((d) => d.alert === "ORANGE").length,
    maxRainMm: Math.round(Math.max(0, ...grids.rain.values)),
    expectedPayoutUsd: covers.reduce((s, c) => s + c.expectedPayoutUsd, 0),
    liquidityP90Usd: covers.reduce((s, c) => s + c.p90PayoutUsd, 0),
    earliestGaleH: onsets.length ? Math.min(...onsets) : null,
  };

  notes.push(
    "Wind: Holland (1980) parametric profile with translation asymmetry; surge: shelf-integrated bathystrophic set-up + inverse barometer + wave set-up, calibrated on 7 historical Bay of Bengal cyclones; rainfall: R-CLIPER with orographic enhancement.",
    `Ensemble: ${M} members with cross-track, timing, intensity and size perturbations growing with lead time.`,
  );

  return {
    storm: { id: storm.id, name: storm.name, year: storm.year, source: storm.source, summary: storm.summary, landfallPlace: storm.landfallPlace },
    params,
    issueTime: issue,
    landfall: lfControl
      ? { t: lfControl.t, lat: r2(lfControl.lat), lon: r2(lfControl.lon), vmaxKt: Math.round(lfControl.vmaxMs * MS_TO_KT) }
      : null,
    control: control.map((s) => ({
      ...s,
      lat: r2(s.lat),
      lon: r2(s.lon),
      vmaxMs: r1(s.vmaxMs),
      pcHpa: r1(s.pcHpa),
      rmaxKm: r1(s.rmaxKm),
      B: r2(s.B),
      headingDeg: Math.round(s.headingDeg),
      speedMs: r1(s.speedMs),
    })),
    observed,
    members: memberTracks,
    cone,
    landfallSpreadKm,
    coast,
    grids,
    districts,
    assets,
    covers,
    summary,
    meta: {
      computeMs: Math.round(performance.now() - started),
      elevationSource: ctx.elevationSource,
      liveWeather: !!(ctx.liveForecast && params.live),
      model: "landfall-parametric-v1",
      notes,
    },
  };
}

function buildCone(members: StormState[][]): LonLat[] {
  const control = members[0];
  const left: LonLat[] = [];
  const right: LonLat[] = [];
  let lastR = 20;
  for (let h = 0; h < control.length; h += 3) {
    const c = control[h];
    const ds: number[] = [];
    for (const m of members) {
      if (m[h]) ds.push(haversineKm(m[h].lat, m[h].lon, c.lat, c.lon) ** 2);
    }
    const rad = Math.max(15, 1.05 * Math.sqrt(mean(ds)));
    lastR = rad;
    const [la1, lo1] = destination(c.lat, c.lon, c.headingDeg - 90, rad);
    const [la2, lo2] = destination(c.lat, c.lon, c.headingDeg + 90, rad);
    left.push([lo1, la1]);
    right.push([lo2, la2]);
  }
  const last = control[Math.floor((control.length - 1) / 3) * 3];
  const cap: LonLat[] = [];
  for (let a = -90; a <= 90; a += 15) {
    const [la, lo] = destination(last.lat, last.lon, last.headingDeg + a, lastR);
    cap.push([lo, la]);
  }
  const ring = [...left, ...cap, ...right.reverse()];
  ring.push(ring[0]);
  return ring.map(([lo, la]) => [r2(lo), r2(la)] as LonLat);
}

function computeGrids(members: StormState[][]): { wind: Grid; p64: Grid; rain: Grid } {
  let south = 90,
    north = -90,
    west = 180,
    east = -180;
  for (const m of members) {
    for (const s of m) {
      south = Math.min(south, s.lat);
      north = Math.max(north, s.lat);
      west = Math.min(west, s.lon);
      east = Math.max(east, s.lon);
    }
  }
  const res = 0.2;
  south = Math.max(4, Math.floor((south - 3) / res) * res);
  north = Math.min(28, Math.ceil((north + 3) / res) * res);
  west = Math.max(77, Math.floor((west - 3.2) / res) * res);
  east = Math.min(100, Math.ceil((east + 3.2) / res) * res);
  const nx = Math.max(1, Math.round((east - west) / res));
  const ny = Math.max(1, Math.round((north - south) / res));
  const N = nx * ny;
  const lat = new Float32Array(N);
  const lon = new Float32Array(N);
  const land = new Uint8Array(N);
  const oro = new Float32Array(N);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      lat[c] = north - (j + 0.5) * res;
      lon[c] = west + (i + 0.5) * res;
      land[c] = isLand(lat[c], lon[c]) ? 1 : 0;
      oro[c] = orographicFactor(lat[c], lon[c]);
    }
  }
  const windSum = new Float32Array(N);
  const p64 = new Float32Array(N);
  const rainSum = new Float32Array(N);
  const degLat = GRID_RANGE_KM / 110.6;
  for (const m of members) {
    const wmax = new Float32Array(N);
    for (const s of m) {
      const degLon = GRID_RANGE_KM / (111.3 * Math.cos((s.lat * Math.PI) / 180));
      const j0 = Math.max(0, Math.floor((north - (s.lat + degLat)) / res));
      const j1 = Math.min(ny - 1, Math.ceil((north - (s.lat - degLat)) / res));
      const i0 = Math.max(0, Math.floor((s.lon - degLon - west) / res));
      const i1 = Math.min(nx - 1, Math.ceil((s.lon + degLon - west) / res));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const c = j * nx + i;
          const [dx, dy] = offsetKm(s.lat, s.lon, lat[c], lon[c]);
          const r = Math.hypot(dx, dy);
          if (r > GRID_RANGE_KM) continue;
          const w = windVector(dx, dy, s, land[c] === 1)[2];
          if (w > wmax[c]) wmax[c] = w;
          rainSum[c] += rcliperRate(r, s.vmaxMs) * oro[c];
        }
      }
    }
    for (let c = 0; c < N; c++) {
      windSum[c] += wmax[c];
      if (wmax[c] >= HURRICANE_MS) p64[c] += 1;
    }
  }
  const k = members.length || 1;
  const mk = (vals: Float32Array, f: (v: number) => number): Grid => ({
    west: r2(west),
    south: r2(south),
    east: r2(west + nx * res),
    north: r2(north),
    nx,
    ny,
    res,
    values: Array.from(vals, f),
  });
  return {
    wind: mk(windSum, (v) => r1(v / k)),
    p64: mk(p64, (v) => r2(v / k)),
    rain: mk(rainSum, (v) => Math.round(v / k)),
  };
}
