import type { AlertLevel } from "./types";

export const ALERT_COLOR: Record<AlertLevel, string> = {
  RED: "#ef4444",
  ORANGE: "#f97316",
  YELLOW: "#eab308",
  GREEN: "#22c55e",
};

export function people(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

export function usd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

export function pct(p: number): string {
  if (p > 0 && p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}

export function kt(ms: number): number {
  return Math.round(ms / 0.514444);
}

export function hours(h: number | null | undefined): string {
  if (h == null) return "-";
  if (h >= 48) return `${Math.round(h / 24)}d ${h % 24 ? `${h % 24}h` : ""}`.trim();
  return `${h}h`;
}

export function utc(t: number | string): string {
  const d = new Date(t);
  return `${d.toISOString().slice(5, 10).replace("-", "/")} ${d.toISOString().slice(11, 16)}Z`;
}

export function category(vKt: number): string {
  if (vKt >= 120) return "Super Cyclonic Storm";
  if (vKt >= 90) return "Extremely Severe Cyclonic Storm";
  if (vKt >= 64) return "Very Severe Cyclonic Storm";
  if (vKt >= 48) return "Severe Cyclonic Storm";
  if (vKt >= 34) return "Cyclonic Storm";
  if (vKt >= 28) return "Deep Depression";
  return "Depression";
}
