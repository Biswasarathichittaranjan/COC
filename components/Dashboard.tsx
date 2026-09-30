"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvisoryBundle, Asset, CustomStormSpec, LonLat, OutboxEntry, SimResult, Storm } from "@/lib/types";
import type { GeeLayer, LayerKind } from "@/lib/integrations/gee-types";
import type { LayerKey, LayerState, MapHandle } from "./MapView";
import ScenarioPanel, { type LiveStormSummary, type ScenarioSettings } from "./ScenarioPanel";
import { Legend, LayerControl, Timeline } from "./MapOverlays";
import Overview from "./panels/Overview";
import Infrastructure from "./panels/Infrastructure";
import Pathways from "./panels/Pathways";
import Triggers from "./panels/Triggers";
import Advisories from "./panels/Advisories";
import { Spinner } from "./ui";
import { DEFAULT_CUSTOM } from "@/lib/data/storms";
import { buildCustomTrack } from "@/lib/models/track";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
      <Spinner /> <span className="ml-2">Loading map...</span>
    </div>
  ),
});

interface Status {
  gee: { configured: boolean; ok: boolean; error?: string };
  gemini: { configured: boolean; model: string };
  openMeteo: { ok: boolean };
  gdacs: { ok: boolean; storms?: number; error?: string };
  dispatch: { live: boolean; webhookConfigured: boolean; mode: string };
}

type Tab = "overview" | "infra" | "pathways" | "triggers" | "advisories";
const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["infra", "Infrastructure"],
  ["pathways", "Pathways"],
  ["triggers", "Triggers"],
  ["advisories", "Advisories"],
];

const INITIAL_LAYERS: LayerState = {
  cone: true,
  members: true,
  radii: true,
  wind: true,
  p64: false,
  rain: false,
  surge: true,
  districts: true,
  assets: true,
  covers: false,
  gee_inundation: false,
  gee_imerg72: false,
  gee_gfsRain72: false,
  gee_gfsWind72: false,
  gee_population: false,
  gee_lecz: false,
};

function coastLevels(r: SimResult) {
  return r.coast.filter((c) => c.surgeP90 >= 0.3 && c.twlP90 > 0.2).map((c) => ({ lat: c.lat, lon: c.lon, twl: c.twlP90, atten: c.atten, nx: c.nx, ny: c.ny }));
}

function Pill({ label, state, title }: { label: string; state: "ok" | "off" | "err" | "warn"; title?: string }) {
  const c = { ok: "#22c55e", off: "#475569", err: "#ef4444", warn: "#eab308" }[state];
  return (
    <span title={title} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-300">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: state === "ok" ? `0 0 6px ${c}` : undefined }} />
      {label}
    </span>
  );
}

export default function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [historical, setHistorical] = useState<Storm[]>([]);
  const [live, setLive] = useState<LiveStormSummary[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [stormId, setStormId] = useState("amphan-2020");
  const [liveStorm, setLiveStorm] = useState<Storm | null>(null);
  const [settings, setSettings] = useState<ScenarioSettings>({
    leadHours: 48,
    members: 50,
    seed: 7,
    intensityScale: 1,
    rmaxScale: 1,
    crossTrackShiftKm: 0,
    speedScale: 1,
    tide: "high",
    live: false,
  });
  const [custom, setCustom] = useState<CustomStormSpec>(DEFAULT_CUSTOM);
  const [pickMode, setPickMode] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerState>(INITIAL_LAYERS);
  const [basemap, setBasemap] = useState<"dark" | "satellite">("dark");
  const [timeIndex, setTimeIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [geeLayers, setGeeLayers] = useState<Partial<Record<LayerKind, GeeLayer>>>({});
  const [geeBusy, setGeeBusy] = useState<Partial<Record<string, boolean>>>({});
  const [geeErrors, setGeeErrors] = useState<Partial<Record<string, string>>>({});
  const [geeExposure, setGeeExposure] = useState<{ popInundatedOver05m: number; inundatedAreaKm2: number } | null>(null);
  const [geeExposureBusy, setGeeExposureBusy] = useState(false);
  const [geeExposureError, setGeeExposureError] = useState<string | null>(null);
  const [osmAssets, setOsmAssets] = useState<Asset[]>([]);
  const [osmBusy, setOsmBusy] = useState(false);
  const [osmError, setOsmError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<AdvisoryBundle | null>(null);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const mapHandle = useRef<MapHandle | null>(null);
  const didInit = useRef(false);

  const geeOk = !!status?.gee.ok;

  // ---------- data loading ----------
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => undefined);
    fetch("/api/storms")
      .then((r) => r.json())
      .then((j) => {
        setHistorical(j.historical ?? []);
        setLive(j.live ?? []);
        setLiveError(j.liveError ?? null);
      })
      .catch((e) => setLiveError(String(e)));
    fetch("/api/dispatch")
      .then((r) => r.json())
      .then((j) => setOutbox(j.outbox ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLiveStorm(null);
    if (!stormId.startsWith("gdacs-")) return;
    let cancelled = false;
    fetch(`/api/storms/${stormId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) setError(`GDACS: ${j.error}`);
        else setLiveStorm(j);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [stormId]);

  // ---------- simulation ----------
  const run = useCallback(
    async (extra: Asset[] = osmAssets) => {
      setRunning(true);
      setError(null);
      setPlaying(false);
      try {
        const res = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: { ...settings, stormId, custom: stormId === "custom" ? custom : undefined }, extraAssets: extra }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        const r = json as SimResult;
        setResult(r);
        setBundle(null);
        setGeeExposure(null);
        setGeeExposureError(null);
        setTimeIndex(0);
        setPickMode(false);
        const top = [...r.districts].sort((a, b) => b.riskScore - a.riskScore)[0];
        setSelectedDistrict(top?.id ?? null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setRunning(false);
      }
    },
    [settings, stormId, custom, osmAssets],
  );

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void run([]);
  }, [run]);

  // ---------- Earth Engine layers ----------
  const loadGee = useCallback(async (kinds: LayerKind[], r: SimResult | null) => {
    if (!kinds.length) return;
    setGeeBusy((b) => ({ ...b, ...Object.fromEntries(kinds.map((k) => [k, true])) }));
    try {
      const res = await fetch("/api/gee/layers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kinds, coast: r ? coastLevels(r) : [] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setGeeLayers((g) => ({ ...g, ...json.layers }));
      setGeeErrors((e) => {
        const next = { ...e };
        for (const k of kinds) delete next[k];
        return { ...next, ...json.errors };
      });
    } catch (e) {
      setGeeErrors((er) => ({ ...er, ...Object.fromEntries(kinds.map((k) => [k, (e as Error).message])) }));
    } finally {
      setGeeBusy((b) => ({ ...b, ...Object.fromEntries(kinds.map((k) => [k, false])) }));
    }
  }, []);

  // refresh the inundation layer for each new result
  useEffect(() => {
    if (!geeOk || !result) return;
    setGeeLayers((g) => ({ ...g, inundation: undefined }));
    if (coastLevels(result).length) {
      setLayers((l) => ({ ...l, gee_inundation: true }));
      void loadGee(["inundation"], result);
    }
  }, [geeOk, result, loadGee]);

  const toggleLayer = (k: LayerKey) => {
    const on = !layers[k];
    setLayers((l) => ({ ...l, [k]: on }));
    if (on && k.startsWith("gee_")) {
      const kind = k.slice(4) as LayerKind;
      if (!geeLayers[kind] && !geeBusy[kind]) void loadGee([kind], result);
    }
  };

  // ---------- timeline playback ----------
  useEffect(() => {
    if (!playing || !result) return;
    const id = setInterval(() => {
      setTimeIndex((i) => {
        if (i >= result.control.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 110);
    return () => clearInterval(id);
  }, [playing, result]);

  // ---------- preview track ----------
  const previewTrack = useMemo<LonLat[] | null>(() => {
    if (stormId === "custom") return buildCustomTrack(custom, Date.now()).map((p) => [p.lon, p.lat]);
    if (stormId.startsWith("gdacs-")) return liveStorm ? liveStorm.track.map((p) => [p.lon, p.lat]) : null;
    const h = historical.find((s) => s.id === stormId);
    return h ? h.track.map((p) => [p.lon, p.lat]) : null;
  }, [stormId, custom, liveStorm, historical]);
  const resultMatches = result && (result.storm.id === stormId || (stormId === "custom" && result.storm.source === "custom"));

  // ---------- actions ----------
  const selectDistrict = (id: string, fly = false) => {
    setSelectedDistrict(id);
    setTab("pathways");
    if (fly) {
      const d = result?.districts.find((x) => x.id === id);
      if (d) mapHandle.current?.flyTo(d.lon, d.lat, 7.2);
    }
  };

  const loadOsm = async () => {
    if (!result?.landfall) return;
    setOsmBusy(true);
    setOsmError(null);
    try {
      const { lat, lon } = result.landfall;
      const res = await fetch("/api/infrastructure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbox: { south: lat - 1.2, north: lat + 1.2, west: lon - 1.4, east: lon + 1.4 } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setOsmAssets(json.assets);
      await run(json.assets);
    } catch (e) {
      setOsmError((e as Error).message);
    } finally {
      setOsmBusy(false);
    }
  };

  const computeExposure = async () => {
    if (!result) return;
    setGeeExposureBusy(true);
    setGeeExposureError(null);
    try {
      const res = await fetch("/api/gee/exposure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coast: coastLevels(result) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setGeeExposure(json);
    } catch (e) {
      setGeeExposureError((e as Error).message);
    } finally {
      setGeeExposureBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
        <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden>
          <g fill="none" stroke="#38bdf8" strokeWidth="2.6" strokeLinecap="round">
            <path d="M16 5c7 0 10 5 9 10" />
            <path d="M16 27c-7 0-10-5-9-10" />
          </g>
          <circle cx="16" cy="16" r="3.6" fill="#f43f5e" />
        </svg>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-slate-50">Landfall</div>
          <div className="hidden text-[10px] text-muted sm:block">Anticipatory cyclone risk · Bay of Bengal</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {status ? (
            <>
              <Pill
                label="Earth Engine"
                state={status.gee.ok ? "ok" : status.gee.configured ? "err" : "off"}
                title={status.gee.ok ? "Connected" : status.gee.error ?? "Not configured: set GEE_SERVICE_ACCOUNT_KEY_FILE and GEE_PROJECT"}
              />
              <Pill label={status.gemini.configured ? status.gemini.model : "Gemini"} state={status.gemini.configured ? "ok" : "off"} title={status.gemini.configured ? "Gemini API key configured" : "Set GEMINI_API_KEY"} />
              <Pill label="Open-Meteo" state={status.openMeteo.ok ? "ok" : "err"} title="Real-time NWP forecasts" />
              <Pill label={`GDACS${status.gdacs.ok ? ` · ${status.gdacs.storms ?? 0}` : ""}`} state={status.gdacs.ok ? "ok" : "err"} title={status.gdacs.ok ? "Recent North Indian Ocean cyclones" : status.gdacs.error} />
              <Pill label={`Dispatch: ${status.dispatch.mode}`} state={status.dispatch.live ? "warn" : "off"} title={status.dispatch.live ? "Approved advisories are POSTed to DISPATCH_WEBHOOK_URL" : "Dry-run: approved advisories are recorded in the local outbox only"} />
            </>
          ) : (
            <Spinner />
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        <aside className="shrink-0 border-b border-line bg-panel lg:w-80 lg:border-b-0 lg:border-r">
          <ScenarioPanel
            historical={historical}
            live={live}
            liveError={liveError}
            stormId={stormId}
            onStormId={(id) => {
              setStormId(id);
              setPickMode(false);
            }}
            settings={settings}
            onSettings={setSettings}
            custom={custom}
            onCustom={setCustom}
            pickMode={pickMode}
            onPickMode={setPickMode}
            running={running}
            onRun={() => void run()}
            liveStorm={liveStorm}
          />
        </aside>

        <main className="relative h-[62vh] min-h-[420px] flex-1 overflow-hidden lg:h-auto">
          <MapView
            result={result}
            previewTrack={resultMatches ? null : previewTrack}
            layers={layers}
            basemap={basemap}
            timeIndex={timeIndex}
            geeLayers={geeLayers}
            selectedDistrictId={selectedDistrict}
            pickMode={pickMode}
            customLandfall={stormId === "custom" ? { lat: custom.landfallLat, lon: custom.landfallLon } : null}
            onPick={(lat, lon) => {
              setCustom((c) => ({ ...c, landfallLat: Math.round(lat * 100) / 100, landfallLon: Math.round(lon * 100) / 100 }));
              setPickMode(false);
            }}
            onSelectDistrict={(id) => selectDistrict(id)}
            handleRef={mapHandle}
          />
          <LayerControl layers={layers} onToggle={toggleLayer} basemap={basemap} onBasemap={setBasemap} geeOk={geeOk} geeBusy={geeBusy} geeErrors={geeErrors} />
          <Legend layers={layers} gee={geeLayers} />
          {result && <Timeline result={result} index={timeIndex} onIndex={setTimeIndex} playing={playing} onPlaying={setPlaying} />}
          {running && (
            <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-panel/95 px-3 py-1.5 text-xs text-slate-200 shadow-xl">
              <Spinner /> Simulating {settings.members} ensemble members...
            </div>
          )}
          {error && (
            <div className="absolute left-1/2 top-3 z-20 max-w-md -translate-x-1/2 rounded-lg border border-rose-800 bg-rose-950/90 px-3 py-2 text-xs text-rose-200 shadow-xl">
              {error}
              <button type="button" className="ml-2 text-rose-400" onClick={() => setError(null)}>
                ×
              </button>
            </div>
          )}
          {pickMode && (
            <div className="absolute left-1/2 top-14 z-20 -translate-x-1/2 rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white shadow-xl">
              Click the coast to set the landfall point
            </div>
          )}
          {result && !resultMatches && !running && (
            <div className="absolute right-3 top-3 z-10 rounded-md border border-amber-700/60 bg-amber-950/80 px-2.5 py-1.5 text-[11px] text-amber-200">
              Showing results for {result.storm.name}. Run the simulation to update.
            </div>
          )}
        </main>

        <aside className="flex shrink-0 flex-col border-t border-line bg-panel lg:w-[460px] lg:border-l lg:border-t-0">
          <nav className="flex shrink-0 overflow-x-auto border-b border-line px-2">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`whitespace-nowrap border-b-2 px-2.5 py-2.5 text-xs font-medium transition ${tab === k ? "border-sky-400 text-slate-50" : "border-transparent text-slate-400 hover:text-slate-200"}`}
              >
                {label}
                {k === "advisories" && bundle && <span className="ml-1 rounded bg-sky-900 px-1 text-[10px] text-sky-200">{bundle.advisories.length}</span>}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-4 lg:min-h-0">
            {!result ? (
              <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted">
                {running ? (
                  <>
                    <Spinner /> Running first simulation...
                  </>
                ) : (
                  "Run a simulation to see results."
                )}
              </div>
            ) : tab === "overview" ? (
              <Overview
                result={result}
                selectedDistrict={selectedDistrict}
                onSelectDistrict={(id) => selectDistrict(id, true)}
                geeOk={geeOk}
                geeExposure={geeExposure}
                geeExposureBusy={geeExposureBusy}
                geeExposureError={geeExposureError}
                onGeeExposure={computeExposure}
              />
            ) : tab === "infra" ? (
              <Infrastructure
                result={result}
                onFly={(lon, lat) => mapHandle.current?.flyTo(lon, lat, 9)}
                osmCount={osmAssets.length}
                osmBusy={osmBusy}
                osmError={osmError}
                onLoadOsm={loadOsm}
              />
            ) : tab === "pathways" ? (
              <Pathways result={result} districtId={selectedDistrict} onDistrict={setSelectedDistrict} />
            ) : tab === "triggers" ? (
              <Triggers result={result} onSelectDistrict={(id) => selectDistrict(id, true)} />
            ) : (
              <Advisories
                result={result}
                bundle={bundle}
                onBundle={setBundle}
                getSnapshot={() => mapHandle.current?.snapshot() ?? null}
                geminiConfigured={!!status?.gemini.configured}
                geminiModel={status?.gemini.model ?? "Gemini"}
                dispatchMode={status?.dispatch.mode ?? "dry-run"}
                outbox={outbox}
                onOutbox={setOutbox}
              />
            )}
          </div>
          <div className="shrink-0 border-t border-line px-4 py-1.5 text-[10px] text-muted">
            Decision-support prototype. Official warnings from IMD, BMD and DMH take precedence.
          </div>
        </aside>
      </div>
    </div>
  );
}
