"use client";

import type { CustomStormSpec, SimParams, Storm, TidePhase } from "@/lib/types";
import { Button, Field, Spinner } from "./ui";
import { category } from "@/lib/format";

export interface LiveStormSummary {
  id: string;
  name: string;
  alertLevel: string;
  current: boolean;
  from: string;
  to: string;
  country: string;
  maxWindKmh: number | null;
}

export type ScenarioSettings = Omit<SimParams, "stormId" | "custom">;

interface Props {
  historical: Storm[];
  live: LiveStormSummary[];
  liveError: string | null;
  stormId: string;
  onStormId: (id: string) => void;
  settings: ScenarioSettings;
  onSettings: (s: ScenarioSettings) => void;
  custom: CustomStormSpec;
  onCustom: (c: CustomStormSpec) => void;
  pickMode: boolean;
  onPickMode: (v: boolean) => void;
  running: boolean;
  onRun: () => void;
  liveStorm: Storm | null;
}

const TIDES: { v: TidePhase; label: string }[] = [
  { v: "spring_low", label: "Spring low tide" },
  { v: "low", label: "Low tide" },
  { v: "mean", label: "Mean sea level" },
  { v: "high", label: "High tide" },
  { v: "spring_high", label: "Spring high tide (worst case)" },
];

const input =
  "w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500";

export default function ScenarioPanel(p: Props) {
  const s = p.settings;
  const set = <K extends keyof ScenarioSettings>(k: K, v: ScenarioSettings[K]) => p.onSettings({ ...s, [k]: v });
  const hist = p.historical.find((h) => h.id === p.stormId);
  const isLive = p.stormId.startsWith("gdacs-");
  const isCustom = p.stormId === "custom";
  const peak = hist ? Math.max(...hist.track.map((t) => t.vmaxKt)) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Storm</div>
          <select className={input} value={p.stormId} onChange={(e) => p.onStormId(e.target.value)} aria-label="Storm">
            <optgroup label="Live / recent - North Indian Ocean (GDACS)">
              {p.live.length === 0 && <option disabled>{p.liveError ? `GDACS unavailable (${p.liveError})` : "No recent cyclones in the basin"}</option>}
              {p.live.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.current ? "● " : ""}
                  {l.name} - {l.country || "at sea"} ({l.alertLevel})
                </option>
              ))}
            </optgroup>
            <optgroup label="Historical replay">
              {p.historical.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.year})
                </option>
              ))}
            </optgroup>
            <optgroup label="Hypothetical">
              <option value="custom">Design a cyclone...</option>
            </optgroup>
          </select>
          {hist && (
            <div className="mt-2 rounded-md border border-line bg-panel-2/60 p-2.5 text-[11px] leading-relaxed text-slate-300">
              <div className="mb-1 font-medium text-slate-100">
                {hist.name} {hist.year} · peak {peak} kt · {category(peak ?? 0)}
              </div>
              {hist.summary}
              <div className="mt-1 text-muted">Landfall: {hist.landfallPlace}</div>
            </div>
          )}
          {isLive && (
            <div className="mt-2 rounded-md border border-line bg-panel-2/60 p-2.5 text-[11px] leading-relaxed text-slate-300">
              {p.liveStorm ? (
                <>
                  <div className="mb-1 font-medium text-slate-100">
                    {p.liveStorm.name} · {p.liveStorm.track.filter((t) => !t.forecast).length} observed /{" "}
                    {p.liveStorm.track.filter((t) => t.forecast).length} forecast positions
                  </div>
                  {p.liveStorm.summary}
                  <div className="mt-1 text-muted">The ensemble starts from the latest observed advisory; the lead-time setting is ignored.</div>
                </>
              ) : (
                <span className="inline-flex items-center gap-2 text-muted">
                  <Spinner /> Loading GDACS track...
                </span>
              )}
            </div>
          )}
        </div>

        {isCustom && (
          <div className="space-y-3 rounded-md border border-sky-900/60 bg-sky-950/20 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">Synthetic track</div>
              <Button variant={p.pickMode ? "primary" : "secondary"} onClick={() => p.onPickMode(!p.pickMode)}>
                {p.pickMode ? "Click the map..." : "Pick landfall on map"}
              </Button>
            </div>
            <div className="tabular text-[11px] text-muted">
              Landfall {p.custom.landfallLat.toFixed(2)}°N, {p.custom.landfallLon.toFixed(2)}°E
            </div>
            <Field label="Intensity at landfall" hint={`${p.custom.vmaxKt} kt · ${category(p.custom.vmaxKt)}`}>
              <input type="range" min={35} max={150} step={5} value={p.custom.vmaxKt} onChange={(e) => p.onCustom({ ...p.custom, vmaxKt: +e.target.value, peakVmaxKt: Math.max(+e.target.value, p.custom.peakVmaxKt ?? 0) })} className="w-full" />
            </Field>
            <Field label="Peak intensity at sea" hint={`${p.custom.peakVmaxKt} kt`}>
              <input type="range" min={p.custom.vmaxKt} max={165} step={5} value={p.custom.peakVmaxKt} onChange={(e) => p.onCustom({ ...p.custom, peakVmaxKt: +e.target.value })} className="w-full" />
            </Field>
            <Field label="Heading" hint={`${p.custom.headingDeg}°`}>
              <input type="range" min={-60} max={120} step={5} value={p.custom.headingDeg > 180 ? p.custom.headingDeg - 360 : p.custom.headingDeg} onChange={(e) => p.onCustom({ ...p.custom, headingDeg: (+e.target.value + 360) % 360 })} className="w-full" />
            </Field>
            <Field label="Forward speed" hint={`${p.custom.speedKmh} km/h`}>
              <input type="range" min={5} max={35} step={1} value={p.custom.speedKmh} onChange={(e) => p.onCustom({ ...p.custom, speedKmh: +e.target.value })} className="w-full" />
            </Field>
            <Field label="Radius of max winds" hint={`${p.custom.rmaxKm} km`}>
              <input type="range" min={10} max={80} step={2} value={p.custom.rmaxKm} onChange={(e) => p.onCustom({ ...p.custom, rmaxKm: +e.target.value })} className="w-full" />
            </Field>
          </div>
        )}

        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Forecast & ensemble</div>
          {!isLive && (
            <Field label="Forecast issued before landfall" hint={`T-${s.leadHours} h`}>
              <input type="range" min={6} max={96} step={6} value={s.leadHours} onChange={(e) => set("leadHours", +e.target.value)} className="w-full" />
            </Field>
          )}
          <Field label="Ensemble members" hint={String(s.members)}>
            <input type="range" min={10} max={100} step={10} value={s.members} onChange={(e) => set("members", +e.target.value)} className="w-full" />
          </Field>
          <Field label="Tide at peak surge">
            <select className={input} value={s.tide} onChange={(e) => set("tide", e.target.value as TidePhase)}>
              {TIDES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <details className="group rounded-md border border-line p-3" open={false}>
          <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span className="mr-1 inline-block transition group-open:rotate-90">›</span> What-if adjustments
          </summary>
          <div className="mt-3 space-y-3">
            <Field label="Intensity" hint={`${s.intensityScale > 1 ? "+" : ""}${Math.round((s.intensityScale - 1) * 100)}%`}>
              <input type="range" min={0.7} max={1.3} step={0.05} value={s.intensityScale} onChange={(e) => set("intensityScale", +e.target.value)} className="w-full" />
            </Field>
            <Field label="Track shift (right of motion)" hint={`${s.crossTrackShiftKm} km`}>
              <input type="range" min={-150} max={150} step={10} value={s.crossTrackShiftKm} onChange={(e) => set("crossTrackShiftKm", +e.target.value)} className="w-full" />
            </Field>
            <Field label="Forward speed" hint={`x${s.speedScale.toFixed(2)}`}>
              <input type="range" min={0.5} max={1.5} step={0.05} value={s.speedScale} onChange={(e) => set("speedScale", +e.target.value)} className="w-full" />
            </Field>
            <Field label="Storm size (Rmax)" hint={`x${s.rmaxScale.toFixed(2)}`}>
              <input type="range" min={0.6} max={1.8} step={0.1} value={s.rmaxScale} onChange={(e) => set("rmaxScale", +e.target.value)} className="w-full" />
            </Field>
            <Button
              variant="ghost"
              onClick={() => p.onSettings({ ...s, intensityScale: 1, crossTrackShiftKm: 0, speedScale: 1, rmaxScale: 1 })}
            >
              Reset adjustments
            </Button>
          </div>
        </details>

        {isLive && (
          <label className="flex items-start gap-2 text-xs text-slate-300">
            <input type="checkbox" className="mt-0.5" checked={!!s.live} onChange={(e) => set("live", e.target.checked)} />
            <span>
              Blend real-time Open-Meteo 72 h rainfall into district hazards
              <span className="block text-[11px] text-muted">Uses the higher of the NWP forecast and the parametric model.</span>
            </span>
          </label>
        )}
      </div>
      <div className="border-t border-line p-4">
        <Button variant="primary" className="w-full py-2 text-sm" onClick={p.onRun} disabled={p.running || (isLive && !p.liveStorm)}>
          {p.running ? (
            <>
              <Spinner /> Running {s.members}-member ensemble...
            </>
          ) : (
            "Run risk simulation"
          )}
        </Button>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          <span>Seed {s.seed}</span>
          <button className="text-sky-400 hover:underline" onClick={() => set("seed", Math.floor(Math.random() * 1e6))} type="button">
            Re-roll ensemble
          </button>
        </div>
      </div>
    </div>
  );
}
