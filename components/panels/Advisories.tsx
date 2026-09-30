"use client";

import { useState } from "react";
import type { Advisory, AdvisoryBundle, OutboxEntry, SimResult } from "@/lib/types";
import { buildBrief } from "@/lib/brief";
import { buildCap } from "@/lib/cap";
import { ALERT_COLOR, utc } from "@/lib/format";
import { AlertChip, Button, Empty, Section, Spinner } from "../ui";

const PRIORITY: Record<string, string> = {
  critical: "bg-rose-900/50 text-rose-300 border-rose-800",
  high: "bg-amber-900/40 text-amber-300 border-amber-800",
  medium: "bg-slate-800 text-slate-300 border-slate-700",
};

function download(name: string, text: string, type = "application/xml") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AdvisoryCard({
  a,
  exercise,
  stormName,
  onChange,
}: {
  a: Advisory;
  exercise: boolean;
  stormName: string;
  onChange: (a: Advisory) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(true);
  const approved = a.status === "approved";
  const sent = a.status === "dispatched";
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel-2/50" style={{ borderLeft: `4px solid ${ALERT_COLOR[a.alertLevel]}` }}>
      <div className="flex items-start justify-between gap-2 p-3 pb-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <AlertChip level={a.alertLevel} small />
            <span className="text-[11px] font-semibold text-slate-200">{a.authorityName}</span>
          </div>
          {editing ? (
            <textarea
              className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-[13px] text-slate-100"
              rows={2}
              value={a.headline}
              onChange={(e) => onChange({ ...a, headline: e.target.value })}
            />
          ) : (
            <div className="text-[13px] font-semibold leading-snug text-slate-50">{a.headline}</div>
          )}
          <div className="mt-1 text-[10px] text-muted">
            {a.districts.join(", ")} · lead {a.leadTimeHours != null ? `~${a.leadTimeHours} h to gales` : "n/a"} · confidence {a.confidence}
          </div>
        </div>
        <button type="button" className="text-xs text-muted hover:text-slate-200" onClick={() => setOpen(!open)} aria-label="Toggle details">
          {open ? "−" : "+"}
        </button>
      </div>
      {open && (
        <div className="space-y-2.5 px-3 pb-3 text-[12px] text-slate-300">
          {editing ? (
            <textarea className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-[12px]" rows={4} value={a.summary} onChange={(e) => onChange({ ...a, summary: e.target.value })} />
          ) : (
            <p className="leading-relaxed">{a.summary}</p>
          )}
          {a.hazards.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {a.hazards.map((h, i) => (
                <span key={i} className="rounded border border-line bg-slate-900 px-1.5 py-0.5 text-[10px]" title={h.description}>
                  <b className="text-slate-200">{h.type}</b> <span className="text-muted">{h.severity}</span>
                </span>
              ))}
            </div>
          )}
          {a.actions.length > 0 && (
            <div className="overflow-hidden rounded border border-line">
              <table className="w-full text-[11px]">
                <tbody>
                  {a.actions.map((x, i) => (
                    <tr key={i} className="border-t border-line/60 first:border-0 align-top">
                      <td className="tabular w-16 whitespace-nowrap px-2 py-1 font-semibold text-sky-300">{x.timeframe}</td>
                      <td className="px-2 py-1">
                        {x.action}
                        <span className="block text-[10px] text-muted">{x.owner}</span>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className={`rounded border px-1 text-[9px] uppercase ${PRIORITY[x.priority] ?? PRIORITY.medium}`}>{x.priority}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {a.evacuationZones.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Evacuation zones</div>
              <div>{a.evacuationZones.join(" · ")}</div>
            </div>
          )}
          {a.sheltersToOpen.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Shelters to open</div>
              <div>{a.sheltersToOpen.join(" · ")}</div>
            </div>
          )}
          {a.infrastructureActions.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Infrastructure hardening</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {a.infrastructureActions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border border-line bg-slate-950/60 p-2">
              <div className="mb-0.5 flex justify-between text-[10px] text-muted">
                <span>SMS (English)</span>
                <span className={a.smsText.length > 160 ? "text-rose-400" : ""}>{a.smsText.length}/160</span>
              </div>
              {editing ? (
                <textarea className="w-full rounded border border-slate-700 bg-slate-950 p-1 text-[11px]" rows={3} value={a.smsText} onChange={(e) => onChange({ ...a, smsText: e.target.value })} />
              ) : (
                <div className="text-[11px] text-slate-200">{a.smsText}</div>
              )}
            </div>
            <div className="rounded border border-line bg-slate-950/60 p-2">
              <div className="mb-0.5 text-[10px] text-muted">{a.localLanguage.language}</div>
              <div className="text-[12px] font-medium text-slate-100">{a.localLanguage.headline}</div>
              <div className="text-[11px] text-slate-300">{a.localLanguage.smsText}</div>
            </div>
          </div>
          {a.rationale && <p className="text-[10px] italic text-muted">Rationale: {a.rationale}</p>}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {!sent && (
              <Button variant="ghost" onClick={() => setEditing(!editing)}>
                {editing ? "Done editing" : "Edit"}
              </Button>
            )}
            {!sent && (
              <Button variant={approved ? "secondary" : "primary"} onClick={() => onChange({ ...a, status: approved ? "draft" : "approved" })}>
                {approved ? "Revoke approval" : "Approve"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => download(`${a.id}.cap.xml`, buildCap(a, { stormName, exercise }))}>
              CAP 1.2 XML
            </Button>
            <span className={`ml-auto text-[10px] font-semibold uppercase ${sent ? "text-emerald-400" : approved ? "text-sky-300" : "text-muted"}`}>{a.status}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Advisories({
  result,
  bundle,
  onBundle,
  getSnapshot,
  geminiConfigured,
  geminiModel,
  dispatchMode,
  outbox,
  onOutbox,
}: {
  result: SimResult;
  bundle: AdvisoryBundle | null;
  onBundle: (b: AdvisoryBundle | null) => void;
  getSnapshot: () => string | null;
  geminiConfigured: boolean;
  geminiModel: string;
  dispatchMode: string;
  outbox: OutboxEntry[];
  onOutbox: (o: OutboxEntry[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [useImage, setUseImage] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const exercise = result.storm.source !== "gdacs";
  const stormName = result.storm.name;

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: buildBrief(result), mapSnapshot: useImage ? getSnapshot() : null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onBundle(json);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function dispatch() {
    if (!bundle) return;
    const approved = bundle.advisories.filter((a) => a.status === "approved");
    setDispatching(true);
    setErr(null);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advisories: approved, stormName, exercise }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const ids = new Set(approved.map((a) => a.id));
      onBundle({ ...bundle, advisories: bundle.advisories.map((a) => (ids.has(a.id) ? { ...a, status: "dispatched" } : a)) });
      onOutbox([...json.entries, ...outbox]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDispatching(false);
    }
  }

  async function ask() {
    if (!question.trim()) return;
    setAsking(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: buildBrief(result), question }),
      });
      const json = await res.json();
      setAnswer({ q: question, a: res.ok ? json.answer : `Error: ${json.error}` });
    } finally {
      setAsking(false);
    }
  }

  const approvedCount = bundle?.advisories.filter((a) => a.status === "approved").length ?? 0;

  return (
    <div>
      <div className="mb-4 rounded-lg border border-line bg-panel-2/50 p-3">
        <div className="mb-2 text-[12px] leading-relaxed text-slate-300">
          {geminiConfigured ? (
            <>
              <b className="text-slate-100">{geminiModel}</b> reads the ensemble briefing together with the hazard-map snapshot
              {" "}and, when connected, an Earth Engine inundation composite, then drafts one advisory per authority in English and the local language.
            </>
          ) : (
            <>Gemini is not configured (set <code className="text-sky-300">GEMINI_API_KEY</code>). Advisories will be drafted from rule templates.</>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input type="checkbox" checked={useImage} onChange={(e) => setUseImage(e.target.checked)} /> attach map snapshot
          </label>
          <Button variant="primary" onClick={generate} disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Drafting...
              </>
            ) : bundle ? (
              "Regenerate advisories"
            ) : (
              "Draft advisories"
            )}
          </Button>
        </div>
        {err && <div className="mt-2 text-[11px] text-rose-400">{err}</div>}
      </div>

      {!bundle && !busy && <Empty>Run a simulation, then draft advisories for review. Nothing is sent without human approval.</Empty>}

      {bundle && (
        <>
          <div className="mb-3 text-[10px] text-muted">
            Drafted {utc(bundle.generatedAt)} by {bundle.generatedBy === "gemini" ? `${bundle.model} in ${((bundle.latencyMs ?? 0) / 1000).toFixed(1)} s` : "rule templates"}
            {bundle.imagesUsed.length > 0 && ` · images: ${bundle.imagesUsed.join(", ")}`}
          </div>
          {bundle.warnings.map((w, i) => (
            <div key={i} className="mb-2 rounded border border-amber-800/50 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-300">
              {w}
            </div>
          ))}
          <Section title="Situation">
            <p className="text-[12px] leading-relaxed text-slate-300">{bundle.situationSummary}</p>
          </Section>
          {bundle.imageObservations && (
            <Section title="What Gemini sees in the imagery">
              <p className="text-[12px] leading-relaxed text-slate-300">{bundle.imageObservations}</p>
            </Section>
          )}
          {bundle.damagePathwaysNarrative && (
            <Section title="Damage pathways">
              <p className="text-[12px] leading-relaxed text-slate-300">{bundle.damagePathwaysNarrative}</p>
            </Section>
          )}
          {bundle.uncertaintyNotes && <p className="-mt-2 mb-4 text-[11px] italic text-muted">{bundle.uncertaintyNotes}</p>}

          <Section title={`Advisories (${bundle.advisories.length})`}>
            <div className="space-y-3">
              {bundle.advisories.map((a) => (
                <AdvisoryCard
                  key={a.id}
                  a={a}
                  exercise={exercise}
                  stormName={stormName}
                  onChange={(n) => onBundle({ ...bundle, advisories: bundle.advisories.map((x) => (x.id === n.id ? n : x)) })}
                />
              ))}
              {!bundle.advisories.length && <Empty>No authority requires an advisory for this scenario.</Empty>}
            </div>
          </Section>

          <div className="sticky bottom-0 -mx-4 mb-4 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-400">
                {approvedCount} approved · dispatch mode <b className={dispatchMode === "live" ? "text-rose-300" : "text-slate-200"}>{dispatchMode}</b>
              </div>
              <Button variant={dispatchMode === "live" ? "danger" : "secondary"} disabled={!approvedCount || dispatching} onClick={dispatch}>
                {dispatching ? <Spinner /> : null}
                {dispatchMode === "live" ? `Send ${approvedCount} to webhook` : `Record ${approvedCount} (dry-run)`}
              </Button>
            </div>
          </div>
        </>
      )}

      {outbox.length > 0 && (
        <Section title="Outbox">
          <div className="space-y-1">
            {outbox.slice(0, 12).map((o) => (
              <div key={o.id} className="flex items-center gap-2 rounded border border-line px-2 py-1 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ALERT_COLOR[o.alertLevel] }} />
                <span className="min-w-0 flex-1 truncate text-slate-300" title={o.headline}>
                  {o.authorityName.split(" ").slice(0, 4).join(" ")} · {o.stormName}
                </span>
                <span className={o.status === "sent" ? "text-emerald-400" : o.status === "failed" ? "text-rose-400" : "text-muted"}>{o.status}</span>
                <button type="button" className="text-sky-400 hover:underline" onClick={() => download(`${o.id}.cap.xml`, o.capXml)}>
                  CAP
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Ask the duty officer (Gemini)">
        <div className="flex gap-1.5">
          <input
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
            placeholder="e.g. Which hospitals should move patients first?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            disabled={!geminiConfigured}
          />
          <Button onClick={ask} disabled={asking || !geminiConfigured || !question.trim()}>
            {asking ? <Spinner /> : "Ask"}
          </Button>
        </div>
        {answer && (
          <div className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-slate-950/60 p-2.5 text-[12px] leading-relaxed text-slate-300">
            <div className="mb-1 text-[10px] text-muted">Q: {answer.q}</div>
            {answer.a}
          </div>
        )}
      </Section>
    </div>
  );
}
