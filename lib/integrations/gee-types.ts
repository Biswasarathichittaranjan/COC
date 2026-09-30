// Types shared between the Earth Engine server module and the client map.

export interface CoastLevel {
  lat: number;
  lon: number;
  twl: number;
  atten: number;
  nx: number;
  ny: number;
}

export interface GeeLayer {
  url: string;
  label: string;
  legend: { min: number; max: number; unit: string; palette: string[] };
  attribution: string;
}

export type LayerKind = "inundation" | "imerg72" | "gfsRain72" | "gfsWind72" | "population" | "lecz";
