"use client";

import { useState } from "react";
import type { LayerKey, LayerState } from "./MapView";
import type { GeeLayer } from "@/lib/integrations/gee-types";
import type { SimResult } from "@/lib/types";
import { gradientCss, RAMPS } from "@/lib/colors";
import { hours, kt, utc, category } from "@/lib/format";
import { Spinner } from "./ui";

const MODEL_LAYERS: [LayerKey, string][] = [
  ["cone", "Track & uncertainty cone"],
  ["members", "Ensemble tracks"],
  ["radii", "Wind radii (34/50/64 kt) now"],
  ["wind", "Peak wind swath"],
  ["p64", "P(hurricane-force wind)"],
  ["rain", "Event rainfall"],
  ["surge", "Coastal water level"],
  ["districts", "District alert levels"],
  ["assets", "Critical infrastructure"],
  ["covers", "Parametric cover zones"],
];

const GEE_LAYERS: [LayerKey, string][] = [
  ["gee_inundation", "Surge inundation (P90, NASADEM)"],
  ["gee_imerg72", "Observed rain 72 h (GPM IMERG)"],
  ["gee_gfsRain72", "Forecast rain 72 h (GFS)"],
  ["gee_gfsWind72", "Forecast max wind 72 h (GFS)"],
  ["gee_population", "Population (WorldPop)"],
  ["gee_lecz", "Low-elevation coastal zone"],
];

export function LayerControl({
  layers,
  onToggle,
  basemap,
  onBasemap,
  geeOk,
  geeBusy,
  geeErrors,
}: {
  layers: LayerState;
  onToggle: (k: LayerKey) => void;
  basemap: "dark" | "satellite";
  onBasemap: (b: "dark" | "satellite") => void;
  geeOk: boolean;
  geeBusy: Partial<Record<string, boolean>>;
  geeErrors: Partial<Record<string, string>>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute left-3 top-3 z-10 w-60 rounded-lg border border-line bg-panel/90 text-xs shadow-xl backdrop-blur">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 font-semibold text-slate-200">
        Layers <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="max-h-[60vh] overflow-y-auto border-t border-line px-3 pb-3 pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Model</div>
          {MODEL_LAYERS.map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 py-0.5 text-slate-300 hover:text-white">
              <input type="checkbox" checked={layers[k]} onChange={() => onToggle(k)} />
              {label}
            </label>
          ))}
          <div className="mb-1 mt-2.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted">
            <span>Google Earth Engine</span>
            {!geeOk && <span className="normal-case tracking-normal text-slate-500">not connected</span>}
          </div>
          {GEE_LAYERS.map(([k, label]) => {
            const kind = k.slice(4);
            return (
              <label
                key={k}
                className={`flex items-center gap-2 py-0.5 ${geeOk ? "cursor-pointer text-slate-300 hover:text-white" : "cursor-not-allowed text-slate-600"}`}
                title={geeErrors[kind] ?? (geeOk ? undefined : "Set GEE_SERVICE_ACCOUNT_KEY_FILE and GEE_PROJECT to enable")}
              >
                <input type="checkbox" disabled={!geeOk} checked={layers[k]} onChange={() => onToggle(k)} />
                <span className="flex-1">{label}</span>
                {geeBusy[kind] && <Spinner className="h-3 w-3" />}
                {geeErrors[kind] && <span className="text-rose-400">!</span>}
              </label>
            );
          })}
          <div className="mt-2.5 flex gap-1 rounded-md bg-slate-900 p-0.5">
            {(["dark", "satellite"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onBasemap(b)}
                className={`flex-1 rounded px-2 py-1 capitalize ${basemap === b ? "bg-slate-700 text-white" : "text-slate-400"}`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Ramp({ label, stops, unit, scaleLabel }: { label: string; stops: [number, string][]; unit: string; scaleLabel?: (v: number) => string }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[10px] text-slate-300">{label}</div>
      <div className="h-2 w-full rounded-sm" style={{ background: gradientCss(stops) }} />
      <div className="tabular mt-0.5 flex justify-between text-[9px] text-muted">
        {stops.map(([v]) => (
          <span key={v}>{scaleLabel ? scaleLabel(v) : v}</span>
        ))}
        <span>{unit}</span>
      </div>
    </div>
  );
}

export function Legend({ layers, gee }: { layers: LayerState; gee: Partial<Record<string, GeeLayer>> }) {
  const [open, setOpen] = useState(true);
  const items: React.ReactNode[] = [];
  if (layers.wind) items.push(<Ramp key="w" {...RAMPS.wind} />);
  if (layers.p64) items.push(<Ramp key="p" {...RAMPS.p64} />);
  if (layers.rain) items.push(<Ramp key="r" {...RAMPS.rain} />);
  if (layers.surge) items.push(<Ramp key="s" {...RAMPS.twl} />);
  if (layers.assets) items.push(<Ramp key="a" {...RAMPS.loss} />);
  for (const [k, g] of Object.entries(gee)) {
    if (!g || !layers[`gee_${k}` as LayerKey]) continue;
    const n = g.legend.palette.length;
    const stops = g.legend.palette.map((c, i) => [Math.round(g.legend.min + ((g.legend.max - g.legend.min) * i) / Math.max(1, n - 1)), c] as [number, string]);
    items.push(<Ramp key={k} label={g.label} stops={stops} unit={g.legend.unit} />);
  }
  if (!items.length) return null;
  return (
    <div className="absolute bottom-24 left-3 z-10 w-64 rounded-lg border border-line bg-panel/90 shadow-xl backdrop-blur">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-slate-200">
        Legend <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-line p-2.5">{items}</div>}
    </div>
  );
}

export function Timeline({
  result,
  index,
  onIndex,
  playing,
  onPlaying,
}: {
  result: SimResult;
  index: number;
  onIndex: (i: number) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
}) {
  const n = result.control.length;
  const s = result.control[Math.min(index, n - 1)];
  const lfIdx = result.landfall ? Math.round((result.landfall.t - result.issueTime) / 3_600_000) : null;
  const toLandfall = lfIdx != null ? lfIdx - index : null;
  return (
    <div className="absolute inset-x-3 bottom-3 z-10 rounded-lg border border-line bg-panel/90 px-3 py-2 shadow-xl backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (!playing && index >= n - 1) onIndex(0);
            onPlaying(!playing);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500 text-slate-950 hover:bg-sky-400"
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="1" width="3" height="10" fill="currentColor" /><rect x="7" y="1" width="3" height="10" fill="currentColor" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1l8 5-8 5z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="relative flex-1">
          <input type="range" min={0} max={n - 1} value={index} onChange={(e) => onIndex(+e.target.value)} className="w-full" aria-label="Forecast hour" />
          {lfIdx != null && lfIdx < n && (
            <div className="pointer-events-none absolute -top-1 h-2 w-0.5 bg-rose-500" style={{ left: `calc(${(lfIdx / (n - 1)) * 100}% )` }} title="Landfall" />
          )}
        </div>
        <div className="tabular w-[300px] shrink-0 text-right text-[11px] leading-tight">
          <div className="font-semibold text-slate-100">
            {utc(s.t)} · T+{index} h{" "}
            {toLandfall != null && (
              <span className={toLandfall > 0 ? "text-amber-300" : "text-rose-300"}>
                ({toLandfall > 0 ? `landfall in ${hours(toLandfall)}` : toLandfall === 0 ? "landfall" : `${hours(-toLandfall)} after landfall`})
              </span>
            )}
          </div>
          <div className="text-muted">
            {kt(s.vmaxMs)} kt · {Math.round(s.pcHpa)} hPa · {category(kt(s.vmaxMs))}
          </div>
        </div>
      </div>
    </div>
  );
}
