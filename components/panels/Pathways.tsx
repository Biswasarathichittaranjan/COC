"use client";

import type { DistrictResult, SimResult } from "@/lib/types";
import { AA_ACTIONS, AA_STAGE_LABEL } from "@/lib/models/impacts";
import { ASSET_TYPE_LABEL } from "@/lib/data/infrastructure";
import { AlertChip, Kpi, lossColor, ProbBar, Section } from "../ui";
import { kt, people } from "@/lib/format";

const SHORT: Record<string, string> = {
  h_wind: "Destructive wind",
  h_surge: "Storm surge",
  h_rain: "Extreme rainfall",
  m_pluvial: "Waterlogging",
  m_riverine: "River flooding",
  m_compound: "Compound flood",
  m_landslide: "Landslides",
  m_treefall: "Tree-fall / debris",
  m_saline: "Saline inundation",
  i_roads: "Road disruption",
  i_power: "Power outage",
  i_shelter: "Shelter access loss",
  i_health: "Health services",
  i_wash: "WASH / disease",
  i_livelihood: "Livelihood loss",
};
const KIND_COLOR = { hazard: "#f97316", mechanism: "#38bdf8", impact: "#a78bfa" };

function Diagram({ d }: { d: DistrictResult }) {
  const W = 430;
  const NW = 112;
  const NH = 30;
  const GAP = 7;
  const X = { hazard: 0, mechanism: 150, impact: 288 };
  const byKind = (k: "hazard" | "mechanism" | "impact") => d.pathways.nodes.filter((n) => n.kind === k);
  const cols = { hazard: byKind("hazard"), mechanism: byKind("mechanism"), impact: byKind("impact") };
  const H = Math.max(cols.mechanism.length, cols.impact.length) * (NH + GAP);
  const pos = new Map<string, { x: number; y: number }>();
  for (const k of ["hazard", "mechanism", "impact"] as const) {
    const list = cols[k];
    const off = (H - list.length * (NH + GAP)) / 2;
    list.forEach((n, i) => pos.set(n.id, { x: X[k], y: off + i * (NH + GAP) }));
  }
  const dom = d.pathways.dominant;
  const onChain = (a: string, b: string) => {
    const i = dom.indexOf(a);
    return i >= 0 && dom[i + 1] === b;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Damage pathways for ${d.name}`}>
      {d.pathways.edges.map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b || e.w < 0.01) return null;
        const hot = onChain(e.from, e.to);
        const sameCol = a.x === b.x;
        const x1 = a.x + NW;
        const y1 = a.y + NH / 2;
        const x2 = sameCol ? b.x + NW : b.x;
        const y2 = b.y + NH / 2;
        const path = sameCol ? `M${x1},${y1} C${x1 + 34},${y1} ${x2 + 34},${y2} ${x2},${y2}` : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
        return (
          <path
            key={`${e.from}-${e.to}`}
            d={path}
            fill="none"
            stroke={hot ? "#f43f5e" : "#94a3b8"}
            strokeWidth={1 + 7 * e.w}
            strokeOpacity={hot ? 0.9 : 0.12 + 0.55 * e.w}
            strokeLinecap="round"
          />
        );
      })}
      {d.pathways.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const hot = dom.includes(n.id);
        const c = KIND_COLOR[n.kind];
        return (
          <g key={n.id} transform={`translate(${p.x},${p.y})`}>
            <rect width={NW} height={NH} rx={5} fill="#0f172a" stroke={hot ? "#f43f5e" : `${c}88`} strokeWidth={hot ? 1.8 : 1} opacity={n.p < 0.02 ? 0.45 : 1} />
            <text x={6} y={12} fontSize={9.5} fill="#e2e8f0" opacity={n.p < 0.02 ? 0.5 : 1}>
              {SHORT[n.id] ?? n.label}
            </text>
            <rect x={6} y={19} width={NW - 40} height={4} rx={2} fill="#1e293b" />
            <rect x={6} y={19} width={(NW - 40) * Math.min(1, n.p)} height={4} rx={2} fill={c} />
            <text x={NW - 6} y={24} fontSize={9} textAnchor="end" fill="#cbd5e1" className="tabular">
              {Math.round(n.p * 100)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Pathways({
  result,
  districtId,
  onDistrict,
}: {
  result: SimResult;
  districtId: string | null;
  onDistrict: (id: string) => void;
}) {
  const sorted = [...result.districts].sort((a, b) => b.riskScore - a.riskScore);
  const d = result.districts.find((x) => x.id === districtId) ?? sorted[0];
  if (!d) return null;
  const assets = result.assets.filter((a) => a.districtId === d.id).sort((a, b) => b.pLoss - a.pLoss).slice(0, 8);
  const chain = d.pathways.dominant.map((id) => SHORT[id] ?? id);

  return (
    <div>
      <select
        className="mb-3 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
        value={d.id}
        onChange={(e) => onDistrict(e.target.value)}
        aria-label="District"
      >
        {sorted.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name} ({x.admin1}) - {x.alert}
          </option>
        ))}
      </select>

      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-slate-50">{d.name}</div>
          <div className="text-[11px] text-muted">
            {d.admin1} · pop. {people(d.population)} · {AA_STAGE_LABEL[d.aaStage]}
          </div>
        </div>
        <AlertChip level={d.alert} />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Kpi label="Peak wind" value={`${kt(d.hazard.windMeanMs)} kt`} sub={`P(≥64 kt) ${Math.round(d.hazard.p64 * 100)}%`} />
        <Kpi label="Lowland surge" value={`${d.lowland.depthMeanM.toFixed(1)} m`} sub={`P(≥1 m) ${Math.round(d.lowland.pDepth1 * 100)}% · P90 ${d.lowland.depthP90M} m`} />
        <Kpi
          label="Rainfall"
          value={`${d.hazard.rainMeanMm} mm`}
          sub={d.liveForecast ? `Open-Meteo 72 h: ${d.liveForecast.rain72Mm} mm` : `24 h max ${d.hazard.rain24MeanMm} mm`}
        />
      </div>

      <Section title="Damage pathways (probability, ensemble)">
        <div className="rounded-lg border border-line bg-slate-950/60 p-2">
          <Diagram d={d} />
          <div className="mt-1 flex justify-between px-1 text-[9px] uppercase tracking-wider text-muted">
            <span style={{ color: KIND_COLOR.hazard }}>Hazard</span>
            <span style={{ color: KIND_COLOR.mechanism }}>Mechanism</span>
            <span style={{ color: KIND_COLOR.impact }}>Impact</span>
          </div>
        </div>
        {chain.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-300">
            Dominant chain: <b className="text-rose-300">{chain.join(" → ")}</b> (joint weight {Math.round(d.pathways.dominantP * 100)}%).
          </p>
        )}
      </Section>

      <Section title={`Anticipatory actions · ${AA_STAGE_LABEL[d.aaStage]}`}>
        <ul className="space-y-1 text-[12px] text-slate-300">
          {AA_ACTIONS[d.aaStage].map((a) => (
            <li key={a} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-400" />
              {a}
            </li>
          ))}
        </ul>
        {d.hazard.galeOnsetH != null && (
          <p className="mt-2 text-[11px] text-amber-300">Gale-force winds expected ~T+{d.hazard.galeOnsetH} h: complete movement to shelters before then.</p>
        )}
      </Section>

      <Section title="Critical assets in district">
        <div className="space-y-1">
          {assets.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate text-slate-200">
                {a.name} <span className="text-muted">· {ASSET_TYPE_LABEL[a.type]}</span>
              </span>
              <ProbBar p={a.pLoss} color={lossColor(a.pLoss)} width={50} />
            </div>
          ))}
          {!assets.length && <div className="text-[11px] text-muted">No registered assets in this district.</div>}
        </div>
      </Section>
    </div>
  );
}
