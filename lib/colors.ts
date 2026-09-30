// Colour ramps and grid-to-image rendering for the map (client-side).

import type { Grid } from "./types";

type Stop = [number, string];

export const RAMPS: Record<"wind" | "p64" | "rain" | "twl" | "loss", { stops: Stop[]; unit: string; label: string }> = {
  wind: {
    label: "Peak sustained wind (ensemble mean)",
    unit: "kt",
    stops: [
      [34, "#facc15"],
      [50, "#fb923c"],
      [64, "#ef4444"],
      [83, "#db2777"],
      [96, "#a21caf"],
      [113, "#6d28d9"],
    ],
  },
  p64: {
    label: "Probability of hurricane-force wind (>=64 kt)",
    unit: "%",
    stops: [
      [5, "#fce7f3"],
      [20, "#f9a8d4"],
      [40, "#ec4899"],
      [60, "#be185d"],
      [80, "#831843"],
    ],
  },
  rain: {
    label: "Event rainfall (ensemble mean)",
    unit: "mm",
    stops: [
      [25, "#bfdbfe"],
      [50, "#60a5fa"],
      [100, "#2563eb"],
      [150, "#7c3aed"],
      [200, "#c026d3"],
      [300, "#f43f5e"],
    ],
  },
  twl: {
    label: "Coastal total water level (surge + tide)",
    unit: "m",
    stops: [
      [0.3, "#38bdf8"],
      [1, "#22d3ee"],
      [2, "#facc15"],
      [3, "#f97316"],
      [4, "#ef4444"],
      [6, "#a21caf"],
    ],
  },
  loss: {
    label: "Probability of functional loss",
    unit: "%",
    stops: [
      [0, "#22c55e"],
      [30, "#eab308"],
      [60, "#f97316"],
      [85, "#ef4444"],
    ],
  },
};

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rampColor(stops: Stop[], v: number): [number, number, number] | null {
  if (v < stops[0][0]) return null;
  for (let i = stops.length - 1; i >= 0; i--) {
    if (v >= stops[i][0]) {
      if (i === stops.length - 1) return hexToRgb(stops[i][1]);
      const [v0, c0] = stops[i];
      const [v1, c1] = stops[i + 1];
      const f = (v - v0) / (v1 - v0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return null;
}

/** MapLibre interpolate expression for a ramp. */
export function rampExpression(stops: Stop[], prop: string, scale = 1): unknown[] {
  return ["interpolate", ["linear"], ["*", ["get", prop], scale], ...stops.flatMap(([v, c]) => [v, c])];
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

/**
 * Render a lat/lon grid into a PNG data URL whose rows are spaced in Web Mercator, so it overlays
 * correctly as a MapLibre image source. Values are bilinearly interpolated.
 */
export function gridToDataUrl(grid: Grid, stops: Stop[], scale = 1, alpha = 0.62, upsample = 3): string {
  const W = grid.nx * upsample;
  const H = grid.ny * upsample;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const yTop = mercY(grid.north);
  const yBot = mercY(grid.south);
  const val = (i: number, j: number) => {
    const ii = Math.min(grid.nx - 1, Math.max(0, i));
    const jj = Math.min(grid.ny - 1, Math.max(0, j));
    return grid.values[jj * grid.nx + ii];
  };
  for (let y = 0; y < H; y++) {
    const lat = invMercY(yTop + ((y + 0.5) / H) * (yBot - yTop));
    const fj = (grid.north - lat) / grid.res - 0.5;
    const j0 = Math.floor(fj);
    const tj = fj - j0;
    for (let x = 0; x < W; x++) {
      const fi = ((x + 0.5) / W) * grid.nx - 0.5;
      const i0 = Math.floor(fi);
      const ti = fi - i0;
      const v =
        (val(i0, j0) * (1 - ti) + val(i0 + 1, j0) * ti) * (1 - tj) + (val(i0, j0 + 1) * (1 - ti) + val(i0 + 1, j0 + 1) * ti) * tj;
      const c = rampColor(stops, v * scale);
      const k = (y * W + x) * 4;
      if (c) {
        img.data[k] = c[0];
        img.data[k + 1] = c[1];
        img.data[k + 2] = c[2];
        img.data[k + 3] = Math.round(alpha * 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export function gradientCss(stops: Stop[]): string {
  const lo = stops[0][0];
  const hi = stops[stops.length - 1][0];
  return `linear-gradient(90deg, ${stops.map(([v, c]) => `${c} ${((v - lo) / (hi - lo || 1)) * 100}%`).join(", ")})`;
}
