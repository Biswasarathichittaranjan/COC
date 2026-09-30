"use client";

import type { AAStage, SimResult } from "@/lib/types";
import { AA_ACTIONS, AA_STAGE_LABEL } from "@/lib/models/impacts";
import { ALERT_COLOR, people, usd } from "@/lib/format";
import { Kpi, ProbBar, Section } from "../ui";

const STAGES: AAStage[] = ["impact", "evacuate", "activation", "readiness", "monitor"];
const STAGE_COLOR: Record<AAStage, string> = {
  impact: "#be123c",
  evacuate: ALERT_COLOR.RED,
  activation: ALERT_COLOR.ORANGE,
  readiness: ALERT_COLOR.YELLOW,
  monitor: "#475569",
};
const TIER_COLORS = ["#c4b5fd", "#a78bfa", "#8b5cf6", "#6d28d9"];

export default function Triggers({ result, onSelectDistrict }: { result: SimResult; onSelectDistrict: (id: string) => void }) {
  const byStage = new Map<AAStage, typeof result.districts>();
  for (const d of result.districts) byStage.set(d.aaStage, [...(byStage.get(d.aaStage) ?? []), d]);
  const covers = [...result.covers].sort((a, b) => b.expectedPayoutUsd - a.expectedPayoutUsd);

  return (
    <div>
      <Section title="Anticipatory-action stages">
        <div className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-slate-800">
          {STAGES.map((s) => {
            const n = byStage.get(s)?.length ?? 0;
            return n ? <div key={s} style={{ width: `${(n / result.districts.length) * 100}%`, background: STAGE_COLOR[s] }} title={`${AA_STAGE_LABEL[s]}: ${n}`} /> : null;
          })}
        </div>
        <div className="space-y-2">
          {STAGES.filter((s) => s !== "monitor" && byStage.get(s)?.length).map((s) => {
            const ds = byStage.get(s)!;
            return (
              <div key={s} className="rounded-lg border border-line bg-panel-2/50 p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] font-semibold" style={{ color: STAGE_COLOR[s] }}>
                    {AA_STAGE_LABEL[s]}
                  </span>
                  <span className="text-[11px] text-muted">
                    {ds.length} districts · {people(ds.reduce((x, d) => x + d.population, 0))} people
                  </span>
                </div>
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {ds.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => onSelectDistrict(d.id)}
                      className="rounded border border-line bg-slate-900 px-1.5 py-px text-[10px] text-slate-300 hover:border-slate-500"
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
                  {AA_ACTIONS[s].slice(0, 3).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!STAGES.some((s) => s !== "monitor" && byStage.get(s)?.length) && (
            <div className="text-[11px] text-muted">All districts at Monitor: no anticipatory trigger reached.</div>
          )}
        </div>
      </Section>

      <Section title="Parametric insurance liquidity">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Kpi label="Expected payouts" value={usd(result.summary.expectedPayoutUsd)} tone="#a78bfa" sub="mean across ensemble" />
          <Kpi label="Pre-position (P90)" value={usd(result.summary.liquidityP90Usd)} tone="#c4b5fd" sub="sum of 90th-percentile payouts" />
        </div>
        <div className="space-y-2">
          {covers.map((c) => {
            const none = 1 - c.tierProbs.reduce((s, t) => s + t.p, 0);
            return (
              <div key={c.id} className="rounded-lg border border-line bg-panel-2/40 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-slate-100">{c.name}</div>
                    <div className="text-[10px] text-muted">
                      {c.indexLabel} · limit {usd(c.limitUsd)}
                    </div>
                  </div>
                  <ProbBar p={c.pTrigger} color="#a78bfa" width={46} />
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-800" title="Distribution of payout tiers across members">
                  <div style={{ width: `${none * 100}%` }} className="bg-slate-700" />
                  {c.tierProbs.map((t, i) => (
                    <div key={t.label} style={{ width: `${t.p * 100}%`, background: TIER_COLORS[i] }} title={`${t.label}: ${Math.round(t.p * 100)}%`} />
                  ))}
                </div>
                <div className="tabular mt-1 flex justify-between text-[10px] text-muted">
                  <span>E[payout] {usd(c.expectedPayoutUsd)}</span>
                  <span>P90 {usd(c.p90PayoutUsd)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          Illustrative covers (not real policies). Wind covers use a cat-in-a-circle index on each member&apos;s track; rainfall and surge covers use
          modelled rainfall and coastal water level. P90 payouts indicate the liquidity to pre-arrange before landfall.
        </p>
      </Section>
    </div>
  );
}
