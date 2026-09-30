"use client";

import { useMemo, useState } from "react";
import type { SimResult } from "@/lib/types";
import { AlertChip, Kpi, ProbBar, Section, Spinner } from "../ui";
import { ALERT_COLOR, category, hours, kt, people, usd, utc } from "@/lib/format";
import { AA_STAGE_LABEL } from "@/lib/models/impacts";

const TIDE_LABEL: Record<string, string> = {
  spring_low: "spring low tide",
  low: "low tide",
  mean: "mean sea level",
  high: "high tide",
  spring_high: "spring high tide",
};

export default function Overview({
  result,
  selectedDistrict,
  onSelectDistrict,
  geeOk,
  geeExposure,
  geeExposureBusy,
  geeExposureError,
  onGeeExposure,
}: {
  result: SimResult;
  selectedDistrict: string | null;
  onSelectDistrict: (id: string) => void;
  geeOk: boolean;
  geeExposure: { popInundatedOver05m: number; inundatedAreaKm2: number } | null;
  geeExposureBusy: boolean;
  geeExposureError: string | null;
  onGeeExposure: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const s = result.summary;
  const rows = useMemo(() => {
    const sorted = [...result.districts].sort((a, b) => b.riskScore - a.riskScore);
    return showAll ? sorted : sorted.filter((d) => d.alert !== "GREEN");
  }, [result, showAll]);
  const lfHours = result.landfall ? Math.round((result.landfall.t - result.issueTime) / 3_600_000) : null;
  const totalAssets = result.assets.length;

  return (
    <div>
      <div className="mb-4 rounded-lg border border-line bg-gradient-to-br from-slate-900 to-panel-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-base font-semibold text-slate-50">
              {result.storm.source === "custom" ? "Scenario cyclone" : `Cyclone ${result.storm.name}`}{" "}
              <span className="font-normal text-muted">{result.storm.source === "historical" ? `(${result.storm.year} replay)` : result.storm.source === "gdacs" ? "(live, GDACS)" : "(hypothetical)"}</span>
            </div>
            <div className="text-[11px] text-muted">Forecast issued {utc(result.issueTime)} · {result.params.members}-member ensemble · {TIDE_LABEL[result.params.tide]}</div>
          </div>
          {result.storm.source !== "gdacs" && (
            <span className="rounded border border-amber-700/60 bg-amber-900/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">EXERCISE</span>
          )}
        </div>
        {result.landfall ? (
          <div className="mt-2 text-xs leading-relaxed text-slate-300">
            Control forecast: landfall near{" "}
            <b className="text-slate-100">{result.storm.landfallPlace && result.storm.source === "historical" ? result.storm.landfallPlace : `${result.landfall.lat.toFixed(1)}°N ${result.landfall.lon.toFixed(1)}°E`}</b> at{" "}
            {utc(result.landfall.t)} (<b className="text-amber-300">T+{lfHours} h</b>) with {result.landfall.vmaxKt} kt winds ({category(result.landfall.vmaxKt)}). Landfall position spread ±{result.landfallSpreadKm} km across members.
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-300">No landfall in the forecast window.</div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Kpi label="Peak coastal water level" value={`${s.peakTwlM.toFixed(1)} m`} sub={`near ${s.peakTwlPlace} (ensemble mean)`} tone={s.peakTwlM >= 3 ? "#f87171" : s.peakTwlM >= 1.5 ? "#fbbf24" : undefined} />
        <Kpi label="Earliest gale onset" value={s.earliestGaleH != null ? `T+${s.earliestGaleH} h` : "-"} sub="evacuations should finish before this" tone="#fbbf24" />
        <Kpi label="People in Red districts" value={people(s.popRed)} sub={`${s.districtsRed} Red · ${s.districtsOrange} Orange districts`} tone={s.popRed ? ALERT_COLOR.RED : undefined} />
        <Kpi
          label="People in surge zone (est.)"
          value={people(s.popExposedSurge)}
          sub={
            geeExposure ? (
              <span className="text-sky-300">
                Earth Engine: {people(geeExposure.popInundatedOver05m)} in ≥0.5 m P90 inundation · {geeExposure.inundatedAreaKm2.toLocaleString()} km²
              </span>
            ) : geeOk ? (
              <button type="button" className="text-sky-400 hover:underline disabled:opacity-60" disabled={geeExposureBusy} onClick={onGeeExposure}>
                {geeExposureBusy ? (
                  <span className="inline-flex items-center gap-1">
                    <Spinner className="h-2.5 w-2.5" /> computing in Earth Engine...
                  </span>
                ) : (
                  "Compute with Earth Engine (WorldPop x NASADEM)"
                )}
              </button>
            ) : (
              "district lowland share x modelled depth"
            )
          }
        />
        <Kpi label="Assets likely to lose function" value={`${s.assetsHighRisk} / ${totalAssets}`} sub="P(functional loss) ≥ 50%" tone={s.assetsHighRisk ? "#fb923c" : undefined} />
        <Kpi label="Max event rainfall" value={`${s.maxRainMm} mm`} sub="ensemble mean, R-CLIPER" />
        <Kpi label="Parametric payouts (expected)" value={usd(s.expectedPayoutUsd)} sub={`P90 liquidity need ${usd(s.liquidityP90Usd)}`} tone="#a78bfa" />
        <Kpi label="Model run" value={`${(result.meta.computeMs / 1000).toFixed(1)} s`} sub={`terrain: ${result.meta.elevationSource === "nasadem" ? "NASADEM (Earth Engine)" : "seed registry"}`} />
      </div>
      {geeExposureError && <div className="-mt-2 mb-3 text-[11px] text-rose-400">Earth Engine: {geeExposureError}</div>}

      <Section
        title={`District risk (${rows.length})`}
        right={
          <button type="button" className="text-[11px] text-sky-400 hover:underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Only alerted" : "Show all"}
          </button>
        }
      >
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="tabular w-full text-[11px]">
            <thead className="bg-slate-900 text-left text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">District</th>
                <th className="px-1 py-1.5 font-medium">Alert</th>
                <th className="px-1 py-1.5 font-medium" title="Probability of hurricane-force (>=64 kt) winds">P64</th>
                <th className="px-1 py-1.5 font-medium" title="Mean inundation depth in the low-lying zone">Surge</th>
                <th className="px-1 py-1.5 font-medium" title="Max 24 h rainfall (ensemble mean)">Rain24</th>
                <th className="px-1 py-1.5 font-medium" title="Median hours after issue until gale-force winds">Gales</th>
                <th className="px-2 py-1.5 text-right font-medium">Risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => onSelectDistrict(d.id)}
                  className={`cursor-pointer border-t border-line/70 hover:bg-slate-800/60 ${selectedDistrict === d.id ? "bg-sky-950/40" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <div className="font-medium text-slate-100">{d.name}</div>
                    <div className="text-[10px] text-muted">
                      {d.admin1} · {AA_STAGE_LABEL[d.aaStage]}
                    </div>
                  </td>
                  <td className="px-1">
                    <AlertChip level={d.alert} small />
                  </td>
                  <td className="px-1">{Math.round(d.hazard.p64 * 100)}%</td>
                  <td className="px-1">{d.lowland.depthMeanM.toFixed(1)} m</td>
                  <td className="px-1">{d.hazard.rain24MeanMm}</td>
                  <td className="px-1">{d.hazard.galeOnsetH != null ? `+${d.hazard.galeOnsetH}h` : "-"}</td>
                  <td className="px-2 text-right">
                    <ProbBar p={d.riskScore / 100} width={36} color={d.riskScore >= 50 ? "#ef4444" : d.riskScore >= 25 ? "#f97316" : "#eab308"} />
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-muted">
                    No district reaches Yellow alert in this scenario.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Peak winds at landfall districts">
        <div className="flex flex-wrap gap-1.5">
          {[...result.districts]
            .sort((a, b) => b.hazard.windMeanMs - a.hazard.windMeanMs)
            .slice(0, 8)
            .map((d) => (
              <span key={d.id} className="rounded border border-line bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                {d.name} <b className="text-slate-100">{kt(d.hazard.windMeanMs)} kt</b> <span className="text-muted">(P90 {kt(d.hazard.windP90Ms)})</span>
              </span>
            ))}
        </div>
      </Section>

      <details className="rounded-lg border border-line p-2.5 text-[11px] text-slate-400">
        <summary className="cursor-pointer text-slate-300">Model notes & assumptions</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {result.meta.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
          <li>Gale onset and lead times are hours after forecast issue ({hours(0)} = issue time).</li>
          <li>Decision-support prototype. Official warnings from IMD, BMD and DMH take precedence.</li>
        </ul>
      </details>
    </div>
  );
}
