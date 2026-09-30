// Shared domain types for the Landfall platform (used by server models and the UI).

export type LonLat = [number, number];

export interface TrackPoint {
  t: string; // ISO-8601 UTC
  lat: number;
  lon: number;
  vmaxKt: number; // 1-min sustained max wind, knots
  pcHpa?: number; // central pressure
  rmaxKm?: number; // radius of maximum winds
  forecast?: boolean; // true when the point is a forecast rather than an observation
}

export type StormSource = "historical" | "gdacs" | "custom";

export interface Storm {
  id: string;
  name: string;
  year: number;
  source: StormSource;
  summary: string;
  landfallPlace?: string;
  track: TrackPoint[];
  /** Approximate values from public reporting, used only for calibration checks. */
  reported?: { peakSurgeM?: [number, number]; notes?: string };
  gdacs?: { eventId: number; episodeId: number; alertLevel: string; current: boolean };
}

export interface CustomStormSpec {
  landfallLat: number;
  landfallLon: number;
  headingDeg: number; // direction of motion (0 = north, 90 = east)
  speedKmh: number;
  vmaxKt: number; // intensity at landfall
  peakVmaxKt?: number;
  rmaxKm?: number;
}

export type TidePhase = "spring_low" | "low" | "mean" | "high" | "spring_high";

export interface SimParams {
  stormId: string;
  custom?: CustomStormSpec;
  leadHours: number; // forecast issued this many hours before (control) landfall
  members: number;
  seed: number;
  intensityScale: number;
  rmaxScale: number;
  crossTrackShiftKm: number;
  speedScale: number;
  tide: TidePhase;
  live?: boolean; // blend real-time Open-Meteo forecasts into rainfall
}

export type AlertLevel = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export type AssetType = "power_plant" | "substation" | "hospital" | "shelter" | "road" | "port";

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  lat: number;
  lon: number;
  elevM: number;
  districtId: string;
  criticality: 1 | 2 | 3 | 4 | 5;
  capacity?: string;
  path?: LonLat[]; // for linear assets (roads)
  source: "seed" | "osm";
  elevSource?: "seed" | "nasadem";
}

export type Terrain = "delta" | "coastal_plain" | "urban" | "hilly";

export interface District {
  id: string;
  name: string;
  country: "IN" | "BD" | "MM";
  admin1: string;
  authorityId: string;
  lat: number;
  lon: number;
  elevM: number; // representative elevation of populated centre
  lowland: { lat: number; lon: number; elevM: number }; // representative low-lying coastal zone
  population: number;
  lowlandShare: number; // share of population in the low-lying coastal zone (0-1)
  terrain: Terrain;
  vulnerability: number; // 0-1 composite social vulnerability (illustrative)
  drainageMm24h: number; // 24h rainfall that overwhelms local drainage
  languages: string[];
}

export interface Authority {
  id: string;
  name: string;
  short: string;
  country: "IN" | "BD" | "MM";
  languages: { code: string; name: string }[];
  warningAgency: string; // official met agency whose warnings take precedence
}

export interface CoastNode {
  i: number;
  lat: number;
  lon: number;
  region: string;
  nx: number; // inland unit normal (east component)
  ny: number; // inland unit normal (north component)
  shelfWidthKm: number;
  shelfDepthM: number;
  funnel: number;
  attenMPerKm: number;
  springHighM: number; // spring high water above MSL
}

export interface StormState {
  t: number; // epoch ms
  lat: number;
  lon: number;
  vmaxMs: number;
  pcHpa: number;
  rmaxKm: number;
  B: number;
  headingDeg: number;
  speedMs: number;
  overLand: boolean;
}

export interface Grid {
  west: number;
  south: number;
  east: number;
  north: number;
  nx: number;
  ny: number;
  res: number;
  /** Row-major from the north-west corner. */
  values: number[];
}

export interface CoastResult {
  i: number;
  lat: number;
  lon: number;
  region: string;
  surgeMean: number; // storm surge (m) excluding tide
  surgeP90: number;
  twlMean: number; // total water level incl. tide (m)
  twlP90: number;
  pTwl2m: number; // P(total water level >= 2 m)
  atten: number;
  nx: number;
  ny: number;
}

export interface HazardStats {
  windMeanMs: number;
  windP90Ms: number;
  p34: number;
  p50: number;
  p64: number;
  rainMeanMm: number; // event total
  rain24MeanMm: number; // max 24h
  pRain24Heavy: number; // >= 115.6 mm/24h (IMD very heavy)
  pRain24Extreme: number; // >= 204.5 mm/24h (IMD extremely heavy)
  depthMeanM: number;
  depthP90M: number;
  pDepth05: number;
  pDepth1: number;
  galeOnsetH: number | null; // median hours after issue until >=34 kt
  peakH: number | null; // median hours after issue of peak wind
}

export interface PathwayNode {
  id: string;
  label: string;
  kind: "hazard" | "mechanism" | "impact";
  p: number;
}

export interface PathwayEdge {
  from: string;
  to: string;
  w: number; // contribution weight (0-1)
}

export interface PathwayResult {
  nodes: PathwayNode[];
  edges: PathwayEdge[];
  dominant: string[]; // node ids of the strongest chain
  dominantP: number;
}

export interface DistrictResult {
  id: string;
  name: string;
  country: string;
  admin1: string;
  authorityId: string;
  lat: number;
  lon: number;
  population: number;
  hazard: HazardStats;
  lowland: HazardStats;
  riskScore: number;
  alert: AlertLevel;
  popExposedSurge: number;
  popAtRisk: number;
  aaStage: AAStage;
  pathways: PathwayResult;
  liveForecast?: { rain72Mm: number; gustMaxMs: number };
}

export type AAStage = "monitor" | "readiness" | "activation" | "evacuate" | "impact";

export interface AssetResult {
  id: string;
  name: string;
  type: AssetType;
  lat: number;
  lon: number;
  districtId: string;
  criticality: number;
  elevM: number;
  hazard: HazardStats;
  pLoss: number; // probability of functional loss
  pByHazard: { wind: number; surge: number; rain: number; access: number };
  dominant: "wind" | "surge" | "rain" | "access";
  path?: LonLat[];
  source: string;
}

export interface CoverResult {
  id: string;
  name: string;
  country: string;
  index: "wind_box" | "rain" | "surge";
  indexLabel: string;
  limitUsd: number;
  pTrigger: number;
  expectedPayoutUsd: number;
  p90PayoutUsd: number;
  tierProbs: { label: string; payoutPct: number; p: number }[];
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface EnsembleTrack {
  member: number;
  coords: LonLat[];
}

export interface SimResult {
  storm: { id: string; name: string; year: number; source: StormSource; summary: string; landfallPlace?: string };
  params: SimParams;
  issueTime: number;
  landfall: { t: number; lat: number; lon: number; vmaxKt: number } | null;
  control: StormState[]; // hourly, from issue time
  observed: LonLat[]; // track before issue time
  members: EnsembleTrack[];
  cone: LonLat[]; // polygon
  landfallSpreadKm: number;
  coast: CoastResult[];
  grids: { wind: Grid; p64: Grid; rain: Grid };
  districts: DistrictResult[];
  assets: AssetResult[];
  covers: CoverResult[];
  summary: {
    peakTwlM: number;
    peakTwlPlace: string;
    popRed: number;
    popExposedSurge: number;
    assetsHighRisk: number;
    districtsRed: number;
    districtsOrange: number;
    maxRainMm: number;
    expectedPayoutUsd: number;
    liquidityP90Usd: number;
    earliestGaleH: number | null;
  };
  meta: {
    computeMs: number;
    elevationSource: "seed" | "nasadem";
    liveWeather: boolean;
    model: string;
    notes: string[];
  };
}

// ---------- Advisories ----------

export interface AdvisoryAction {
  timeframe: string; // e.g. "T-48h"
  action: string;
  owner: string;
  priority: "critical" | "high" | "medium";
}

export interface Advisory {
  id: string;
  authorityId: string;
  authorityName: string;
  districts: string[];
  alertLevel: AlertLevel;
  headline: string;
  summary: string;
  leadTimeHours: number | null;
  hazards: { type: string; description: string; severity: string }[];
  actions: AdvisoryAction[];
  evacuationZones: string[];
  sheltersToOpen: string[];
  infrastructureActions: string[];
  smsText: string;
  localLanguage: { language: string; headline: string; smsText: string };
  confidence: "high" | "medium" | "low";
  rationale: string;
  status: "draft" | "approved" | "dispatched";
}

export interface AdvisoryBundle {
  generatedAt: string;
  generatedBy: "gemini" | "rules";
  model?: string;
  latencyMs?: number;
  imagesUsed: string[];
  situationSummary: string;
  imageObservations: string;
  damagePathwaysNarrative: string;
  uncertaintyNotes: string;
  advisories: Advisory[];
  warnings: string[];
}

export interface OutboxEntry {
  id: string;
  advisoryId: string;
  authorityName: string;
  alertLevel: AlertLevel;
  headline: string;
  channel: "webhook" | "dry-run";
  status: "sent" | "failed" | "dry-run";
  detail: string;
  sentAt: string;
  capXml: string;
  stormName: string;
}
