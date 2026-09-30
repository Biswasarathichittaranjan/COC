// Illustrative parametric covers used to demonstrate pre-positioned liquidity. These are NOT real
// policies; structures mirror common designs (cat-in-a-circle wind, rainfall index, modelled surge).

export interface CoverTier {
  threshold: number; // index value at which the tier pays
  payoutPct: number; // share of limit
  label: string;
}

export interface Cover {
  id: string;
  name: string;
  country: string;
  index: "wind_box" | "rain" | "surge";
  indexLabel: string;
  lat: number;
  lon: number;
  radiusKm: number;
  limitUsd: number;
  rainMetric?: "total" | "max24";
  tiers: CoverTier[]; // ascending thresholds
}

const WIND_TIERS: CoverTier[] = [
  { threshold: 64, payoutPct: 0.25, label: "Cat 1 (>=64 kt)" },
  { threshold: 83, payoutPct: 0.5, label: "Cat 2 (>=83 kt)" },
  { threshold: 96, payoutPct: 0.75, label: "Cat 3 (>=96 kt)" },
  { threshold: 113, payoutPct: 1, label: "Cat 4+ (>=113 kt)" },
];

export const COVERS: Cover[] = [
  {
    id: "bd-sundarbans-wind",
    name: "Sundarbans smallholder cyclone cover",
    country: "BD",
    index: "wind_box",
    indexLabel: "Max 1-min wind of storm centre inside 100 km circle",
    lat: 22.0,
    lon: 89.6,
    radiusKm: 100,
    limitUsd: 5_000_000,
    tiers: WIND_TIERS,
  },
  {
    id: "in-odisha-fishers",
    name: "Odisha coastal fishers' cover",
    country: "IN",
    index: "wind_box",
    indexLabel: "Max 1-min wind of storm centre inside 80 km circle",
    lat: 20.1,
    lon: 86.2,
    radiusKm: 80,
    limitUsd: 8_000_000,
    tiers: WIND_TIERS,
  },
  {
    id: "in-s24p-livelihoods",
    name: "South 24 Parganas livelihoods cover",
    country: "IN",
    index: "wind_box",
    indexLabel: "Max 1-min wind of storm centre inside 75 km circle",
    lat: 21.9,
    lon: 88.5,
    radiusKm: 75,
    limitUsd: 6_000_000,
    tiers: WIND_TIERS,
  },
  {
    id: "in-ap-delta-farmers",
    name: "Krishna-Godavari delta farmers' cover",
    country: "IN",
    index: "wind_box",
    indexLabel: "Max 1-min wind of storm centre inside 90 km circle",
    lat: 16.4,
    lon: 81.6,
    radiusKm: 90,
    limitUsd: 5_000_000,
    tiers: WIND_TIERS,
  },
  {
    id: "mm-rakhine-humanitarian",
    name: "Rakhine humanitarian cover",
    country: "MM",
    index: "wind_box",
    indexLabel: "Max 1-min wind of storm centre inside 100 km circle",
    lat: 20.2,
    lon: 92.9,
    radiusKm: 100,
    limitUsd: 3_000_000,
    tiers: WIND_TIERS,
  },
  {
    id: "bd-coxs-camp-rain",
    name: "Cox's Bazar camps rainfall cover",
    country: "BD",
    index: "rain",
    indexLabel: "Modelled event rainfall (mm) at Ukhia camps",
    lat: 21.2,
    lon: 92.15,
    radiusKm: 0,
    limitUsd: 3_000_000,
    rainMetric: "total",
    tiers: [
      { threshold: 200, payoutPct: 0.3, label: ">=200 mm" },
      { threshold: 300, payoutPct: 0.6, label: ">=300 mm" },
      { threshold: 400, payoutPct: 1, label: ">=400 mm" },
    ],
  },
  {
    id: "in-kolkata-rain",
    name: "Kolkata metro rainfall cover",
    country: "IN",
    index: "rain",
    indexLabel: "Modelled max 24 h rainfall (mm) at Kolkata",
    lat: 22.57,
    lon: 88.36,
    radiusKm: 0,
    limitUsd: 4_000_000,
    rainMetric: "max24",
    tiers: [
      { threshold: 150, payoutPct: 0.25, label: ">=150 mm/24h" },
      { threshold: 200, payoutPct: 0.5, label: ">=200 mm/24h" },
      { threshold: 250, payoutPct: 1, label: ">=250 mm/24h" },
    ],
  },
  {
    id: "bd-meghna-surge",
    name: "Meghna estuary surge cover",
    country: "BD",
    index: "surge",
    indexLabel: "Modelled peak total water level (m) along Bhola-Hatiya-Sandwip coast",
    lat: 22.2,
    lon: 91.0,
    radiusKm: 60,
    limitUsd: 4_000_000,
    tiers: [
      { threshold: 2, payoutPct: 0.25, label: ">=2 m" },
      { threshold: 3, payoutPct: 0.6, label: ">=3 m" },
      { threshold: 4.5, payoutPct: 1, label: ">=4.5 m" },
    ],
  },
];
