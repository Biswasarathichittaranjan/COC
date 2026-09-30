"use client";

import { useMemo, useState } from "react";
import type { AssetType, SimResult } from "@/lib/types";
import { ASSET_TYPE_LABEL } from "@/lib/data/infrastructure";
import { Button, lossColor, ProbBar, Section, Spinner } from "../ui";

const TYPES: AssetType[] = ["hospital", "shelter", "substation", "power_plant", "road", "port"];
const HAZARD_STYLE: Record<string, string> = {
  wind: "text-amber-300 border-amber-800/60",
  surge: "text-cyan-300 border-cyan-800/60",
  rain: "text-indigo-300 border-indigo-800/60",
  access: "text-slate-300 border-slate-600",
};

export default function Infrastructure({
  result,
  onFly,
  osmCount,
  osmBusy,
  osmError,
  onLoadOsm,
}: {
  result: SimResult;
  onFly: (lon: number, lat: number) => void;
  osmCount: number;
  osmBusy: boolean;
  osmError: string | null;
  onLoadOsm: () => void;
}) {
  const [filter, setFilter] = useState<AssetType | "all">("all");
  const [minP, setMinP] = useState(0.1);
  const district = useMemo(() => new Map(result.districts.map((d) => [d.id, d.name])), [result]);
  const byType = useMemo(() => {
    const m = new Map<AssetType, { n: number; risk: number }>();
    for (const a of result.assets) {
      const v = m.get(a.type) ?? { n: 0, risk: 0 };
      v.n++;
      if (a.pLoss >= 0.5) v.risk++;
      m.set(a.type, v);
    }
    return m;
  }, [result]);
  const rows = result.assets
    .filter((a) => (filter === "all" || a.type === filter) && a.pLoss >= minP)
    .sort((a, b) => b.pLoss - a.pLoss || b.criticality - a.criticality);

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {TYPES.map((t) => {
          const v = byType.get(t) ?? { n: 0, risk: 0 };
          return (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(filter === t ? "all" : t)}
              className={`rounded-md border px-2 py-1.5 text-left text-[11px] transition ${filter === t ? "border-sky-500 bg-sky-950/40" : "border-line bg-panel-2/60 hover:border-slate-600"}`}
            >
              <div className="text-slate-300">{ASSET_TYPE_LABEL[t]}s</div>
              <div className="tabular text-sm font-semibold text-slate-100">
                <span style={{ color: v.risk ? "#fb923c" : undefined }}>{v.risk}</span>
                <span className="text-xs font-normal text-muted"> / {v.n} at risk</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-line bg-panel-2/40 px-2.5 py-2 text-[11px] text-slate-300">
        <div>
          {osmCount ? `${osmCount} OpenStreetMap facilities added near landfall.` : "Seed registry (approximate). Add real facilities around landfall from OpenStreetMap."}
          {osmError && <div className="text-rose-400">{osmError}</div>}
        </div>
        <Button onClick={onLoadOsm} disabled={osmBusy || !result.landfall}>
          {osmBusy ? (
            <>
              <Spinner /> Overpass...
            </>
          ) : (
            "Load OSM + rerun"
          )}
        </Button>
      </div>

      <Section
        title={`${rows.length} assets${filter !== "all" ? ` · ${ASSET_TYPE_LABEL[filter]}s` : ""}`}
        right={
          <select
            value={minP}
            onChange={(e) => setMinP(+e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-200"
            aria-label="Minimum probability"
          >
            <option value={0}>All</option>
            <option value={0.1}>P ≥ 10%</option>
            <option value={0.3}>P ≥ 30%</option>
            <option value={0.5}>P ≥ 50%</option>
          </select>
        }
      >
        <div className="space-y-1">
          {rows.slice(0, 150).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onFly(a.lon, a.lat)}
              className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left hover:border-line hover:bg-slate-900"
            >
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: lossColor(a.pLoss) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-slate-100">{a.name}</span>
                <span className="block truncate text-[10px] text-muted">
                  {ASSET_TYPE_LABEL[a.type]} · {district.get(a.districtId) ?? a.districtId}
                  {a.source === "osm" ? " · OSM" : ""} · gales {a.hazard.galeOnsetH != null ? `T+${a.hazard.galeOnsetH}h` : "-"}
                </span>
              </span>
              <span className={`rounded border px-1 text-[10px] ${HAZARD_STYLE[a.dominant]}`}>{a.dominant}</span>
              <ProbBar p={a.pLoss} color={lossColor(a.pLoss)} width={44} />
            </button>
          ))}
          {!rows.length && <div className="py-6 text-center text-xs text-muted">No assets above the threshold.</div>}
        </div>
      </Section>
      <p className="text-[10px] leading-relaxed text-muted">
        P(functional loss) combines lognormal fragility curves for wind, surge depth and 24 h rainfall with access and power
        dependencies from each district&apos;s damage pathways, averaged across ensemble members.
      </p>
    </div>
  );
}
