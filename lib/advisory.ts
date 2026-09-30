// Early-warning advisory drafting: Gemini multimodal reasoning over model outputs + imagery,
// with a deterministic rule-based fallback so the workflow never blocks on the LLM.

import "server-only";
import type { Part } from "@google/genai";
import type { Advisory, AdvisoryAction, AdvisoryBundle, AlertLevel } from "./types";
import { type Brief, maxAlert } from "./brief";
import { AA_ACTIONS } from "./models/impacts";
import { generateJson, geminiConfigured } from "./integrations/gemini";
import { geeConfigured, hazardThumbnail } from "./integrations/gee";

const SYSTEM = `You are the duty officer of an anticipatory-action cell supporting disaster-management authorities around the Bay of Bengal.
You receive (1) a JSON briefing produced by an ensemble cyclone risk model (wind, storm surge, rainfall, exposure, damage pathways, parametric triggers) and (2) images: a hazard map rendered from the model and, when available, an Earth Engine composite of modelled surge inundation over terrain and population.

Draft one early-warning advisory per authority listed in "authorities". Rules:
- Use ONLY numbers, places, facilities and shelters present in the briefing. Never invent facilities, casualty figures or official warning levels.
- Express uncertainty with the ensemble probabilities (e.g. "60% chance of hurricane-force winds"). Convert "hours after issue" into clock-relative lead times such as "within ~30 h".
- Align actions with the anticipatory-action stage of each district and schedule them before gale onset (T-72h readiness, T-48h activation, T-24h evacuation, T-12h shelter-in-place).
- Evacuation zones must be districts/low-lying zones with meaningful surge probability; name shelters from the "shelters" list only.
- Infrastructure actions must reference assets from "assetsAtRisk" and their dominant hazard (e.g. pre-emptive de-energisation, sandbagging, generator fuel, tree-clearance teams, port closure).
- smsText: plain English, <= 160 characters. localLanguage: accurate translation of headline and SMS into the authority's local language in its native script.
- State that official warnings from the named national met agency take precedence. If "exercise" is true, prefix headlines with "EXERCISE:".
- In imageObservations, describe what you can actually see in the images (spatial pattern of hazards relative to coast, rivers, populated areas) and flag any mismatch with the numbers.
- damagePathwaysNarrative: explain the dominant causal chains (e.g. surge -> embankment breach -> saline inundation -> WASH failure) for the worst districts.
Be concise and operational.`;

const SCHEMA = {
  type: "object",
  properties: {
    situationSummary: { type: "string" },
    imageObservations: { type: "string" },
    damagePathwaysNarrative: { type: "string" },
    uncertaintyNotes: { type: "string" },
    advisories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          authorityId: { type: "string" },
          districts: { type: "array", items: { type: "string" } },
          alertLevel: { type: "string", enum: ["GREEN", "YELLOW", "ORANGE", "RED"] },
          headline: { type: "string" },
          summary: { type: "string" },
          hazards: {
            type: "array",
            items: {
              type: "object",
              properties: { type: { type: "string" }, description: { type: "string" }, severity: { type: "string" } },
              required: ["type", "description", "severity"],
            },
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                timeframe: { type: "string" },
                action: { type: "string" },
                owner: { type: "string" },
                priority: { type: "string", enum: ["critical", "high", "medium"] },
              },
              required: ["timeframe", "action", "owner", "priority"],
            },
          },
          evacuationZones: { type: "array", items: { type: "string" } },
          sheltersToOpen: { type: "array", items: { type: "string" } },
          infrastructureActions: { type: "array", items: { type: "string" } },
          smsText: { type: "string" },
          localLanguage: {
            type: "object",
            properties: { language: { type: "string" }, headline: { type: "string" }, smsText: { type: "string" } },
            required: ["language", "headline", "smsText"],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          rationale: { type: "string" },
        },
        required: [
          "authorityId",
          "districts",
          "alertLevel",
          "headline",
          "summary",
          "hazards",
          "actions",
          "evacuationZones",
          "sheltersToOpen",
          "infrastructureActions",
          "smsText",
          "localLanguage",
          "confidence",
          "rationale",
        ],
      },
    },
  },
  required: ["situationSummary", "imageObservations", "damagePathwaysNarrative", "uncertaintyNotes", "advisories"],
};

type GeminiOut = Omit<AdvisoryBundle, "generatedAt" | "generatedBy" | "model" | "latencyMs" | "imagesUsed" | "warnings" | "advisories"> & {
  advisories: (Omit<Advisory, "id" | "authorityName" | "status" | "leadTimeHours"> & { leadTimeHours?: number | null })[];
};

function stripDataUrl(s: string): { mime: string; data: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(s);
  return m ? { mime: m[1], data: m[2] } : { mime: "image/jpeg", data: s };
}

export async function draftAdvisories(brief: Brief, mapSnapshot?: string | null): Promise<AdvisoryBundle> {
  const warnings: string[] = [];
  if (!brief.authorities.length) {
    return {
      ...ruleBased(brief),
      warnings: ["No district reached Yellow or higher; no advisories required."],
    };
  }
  if (!geminiConfigured()) {
    return { ...ruleBased(brief), warnings: ["GEMINI_API_KEY not set - advisories drafted by rule templates."] };
  }

  const parts: Part[] = [];
  const imagesUsed: string[] = [];
  if (mapSnapshot) {
    const { mime, data } = stripDataUrl(mapSnapshot);
    parts.push({ text: "Image 1: hazard map from the ensemble model (track cone, wind swath, rainfall, coastal surge, infrastructure risk)." });
    parts.push({ inlineData: { mimeType: mime, data } });
    imagesUsed.push("Hazard map snapshot");
  }
  if (geeConfigured() && brief.coastLevels.length) {
    try {
      const png = await hazardThumbnail(brief.coastLevels, brief.bbox);
      if (png) {
        parts.push({ text: "Image 2: Google Earth Engine composite - hillshaded NASADEM terrain, permanent water (dark blue), WorldPop density (orange), modelled P90 surge inundation depth (blue-to-magenta, 0-4 m)." });
        parts.push({ inlineData: { mimeType: "image/png", data: png } });
        imagesUsed.push("Earth Engine inundation composite");
      }
    } catch (e) {
      warnings.push(`Earth Engine thumbnail unavailable: ${(e as Error).message}`);
    }
  }
  const { coastLevels: _omit, bbox: _b, ...compact } = brief;
  void _omit;
  void _b;
  parts.push({ text: `Briefing JSON:\n${JSON.stringify(compact)}` });

  try {
    const { data, model, latencyMs } = await generateJson<GeminiOut>({ system: SYSTEM, parts, schema: SCHEMA });
    const advisories = normalise(data.advisories ?? [], brief);
    if (!advisories.length) throw new Error("Model returned no advisories");
    return {
      generatedAt: new Date().toISOString(),
      generatedBy: "gemini",
      model,
      latencyMs,
      imagesUsed,
      situationSummary: data.situationSummary ?? "",
      imageObservations: data.imageObservations ?? "",
      damagePathwaysNarrative: data.damagePathwaysNarrative ?? "",
      uncertaintyNotes: data.uncertaintyNotes ?? "",
      advisories,
      warnings,
    };
  } catch (e) {
    const fb = ruleBased(brief);
    return { ...fb, warnings: [...warnings, `Gemini request failed (${(e as Error).message}); fell back to rule templates.`] };
  }
}

function normalise(items: GeminiOut["advisories"], brief: Brief): Advisory[] {
  const out: Advisory[] = [];
  for (const a of items) {
    const auth = brief.authorities.find((x) => x.id === a.authorityId) ?? brief.authorities.find((x) => a.districts?.some((d) => x.districts.includes(d)));
    if (!auth) continue;
    const ds = brief.districts.filter((d) => d.authorityId === auth.id);
    const onset = ds.map((d) => d.galeOnsetHoursAfterIssue).filter((x): x is number => x != null);
    out.push({
      id: `${auth.id}-${Date.now().toString(36)}-${out.length}`,
      authorityId: auth.id,
      authorityName: auth.name,
      districts: a.districts?.length ? a.districts : auth.districts,
      alertLevel: (["GREEN", "YELLOW", "ORANGE", "RED"].includes(a.alertLevel) ? a.alertLevel : maxAlert(ds.map((d) => d.alert))) as AlertLevel,
      headline: a.headline,
      summary: a.summary,
      leadTimeHours: a.leadTimeHours ?? (onset.length ? Math.min(...onset) : null),
      hazards: a.hazards ?? [],
      actions: a.actions ?? [],
      evacuationZones: a.evacuationZones ?? [],
      sheltersToOpen: a.sheltersToOpen ?? [],
      infrastructureActions: a.infrastructureActions ?? [],
      smsText: (a.smsText ?? "").slice(0, 320),
      localLanguage: a.localLanguage ?? { language: auth.localLanguage, headline: "", smsText: "" },
      confidence: a.confidence ?? "medium",
      rationale: a.rationale ?? "",
      status: "draft",
    });
  }
  return out;
}

// ---------------- rule-based fallback ----------------

const STAGE_ORDER = ["Monitor", "Readiness (T-72h)", "Activation (T-48h)", "Evacuate (T-24h)", "Shelter in place (T-12h)"];

export function ruleBased(brief: Brief): AdvisoryBundle {
  const ex = brief.exercise ? "EXERCISE: " : "";
  const advisories: Advisory[] = brief.authorities.map((auth, i) => {
    const ds = brief.districts.filter((d) => d.authorityId === auth.id);
    const level = maxAlert(ds.map((d) => d.alert));
    const onset = ds.map((d) => d.galeOnsetHoursAfterIssue).filter((x): x is number => x != null);
    const lead = onset.length ? Math.min(...onset) : null;
    const worst = [...ds].sort((a, b) => b.riskScore - a.riskScore)[0];
    const stage = ds.map((d) => d.stage).sort((a, b) => STAGE_ORDER.indexOf(b) - STAGE_ORDER.indexOf(a))[0] ?? "Monitor";
    const stageKey = (["monitor", "readiness", "activation", "evacuate", "impact"] as const)[Math.max(0, STAGE_ORDER.indexOf(stage))];
    const evac = ds.filter((d) => d.pLowlandDepthOver1m >= 0.15 || d.lowlandDepthMeanM >= 0.3).map((d) => `Low-lying coastal zone of ${d.name}`);
    const shelters = brief.shelters.filter((s) => ds.some((d) => d.name === s.district)).map((s) => s.name);
    const assets = brief.assetsAtRisk.filter((a) => ds.some((d) => d.name === a.district));
    const infra = assets.slice(0, 6).map((a) => {
      const verb =
        a.dominantHazard === "surge"
          ? "Flood-proof / sandbag and plan pre-emptive shutdown of"
          : a.dominantHazard === "rain"
            ? "Deploy dewatering pumps and drainage clearance at"
            : a.dominantHazard === "access"
              ? "Pre-position fuel, supplies and staff at"
              : "Stage tree-clearance and restoration crews for";
      return `${verb} ${a.name} (P(loss) ${Math.round(a.pLoss * 100)}%)`;
    });
    const actions: AdvisoryAction[] = AA_ACTIONS[stageKey].map((action, k) => ({
      timeframe: stage.includes("(") ? stage.slice(stage.indexOf("(") + 1, -1) : "Now",
      action,
      owner: auth.short,
      priority: k === 0 && (level === "RED" || level === "ORANGE") ? "critical" : "high",
    }));
    let threat = "coastal impacts possible";
    if (worst) {
      const chain = worst.dominantPathway.toLowerCase();
      if (chain.startsWith("storm surge"))
        threat = `storm surge flooding up to ~${worst.lowlandDepthMeanM} m in low-lying ${worst.name} (P(>=1 m) ${Math.round(worst.pLowlandDepthOver1m * 100)}%)`;
      else if (chain.startsWith("extreme rain"))
        threat = `extreme rainfall (~${worst.rain24MeanMm} mm/24 h) and flooding in ${worst.name}`;
      else threat = `${Math.round(worst.pHurricaneForce * 100)}% chance of hurricane-force winds in ${worst.name}`;
    }
    const headline = `${ex}${level} alert - Cyclone ${brief.storm.name}: ${threat}${lead != null ? `, gales within ~${lead} h` : ""}`;
    return {
      id: `${auth.id}-rules-${i}`,
      authorityId: auth.id,
      authorityName: auth.name,
      districts: ds.map((d) => d.name),
      alertLevel: level,
      headline,
      summary: ds
        .slice(0, 4)
        .map(
          (d) =>
            `${d.name}: ${d.alert}, mean peak wind ${d.windMeanKt} kt (P>=64 kt ${Math.round(d.pHurricaneForce * 100)}%), lowland surge depth ${d.lowlandDepthMeanM} m, rain ${d.rainEventMeanMm} mm; dominant pathway ${d.dominantPathway || "n/a"}.`,
        )
        .join(" "),
      leadTimeHours: lead,
      hazards: [
        { type: "Wind", description: `Mean peak sustained wind up to ${Math.max(0, ...ds.map((d) => d.windMeanKt))} kt`, severity: level },
        { type: "Storm surge", description: `Lowland inundation up to ${Math.max(0, ...ds.map((d) => d.lowlandDepthMeanM))} m (ensemble mean)`, severity: evac.length ? "High" : "Low" },
        { type: "Rainfall", description: `Event rainfall up to ${Math.max(0, ...ds.map((d) => d.rainEventMeanMm))} mm`, severity: ds.some((d) => d.pRain24Extreme >= 0.3) ? "High" : "Moderate" },
      ],
      actions,
      evacuationZones: evac,
      sheltersToOpen: shelters,
      infrastructureActions: infra,
      smsText: `${ex}Cyclone ${brief.storm.name}: ${level} alert for ${ds.slice(0, 3).map((d) => d.name).join(", ")}. ${lead != null ? `Gales in ~${lead}h. ` : ""}Follow ${auth.warningAgency.split(" ")[0]} & local officials.`.slice(0, 160),
      localLanguage: { language: auth.localLanguage, headline: "(translation requires Gemini)", smsText: "(translation requires Gemini)" },
      confidence: brief.landfallSpreadKm > 150 ? "low" : brief.landfallSpreadKm > 80 ? "medium" : "high",
      rationale: `Rule template from AA stage "${stage}" and ensemble probabilities; ${brief.scenario.members} members, landfall spread ~${brief.landfallSpreadKm} km.`,
      status: "draft",
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    generatedBy: "rules",
    imagesUsed: [],
    situationSummary: brief.landfall
      ? `${brief.storm.name} is forecast to make landfall near ${brief.landfall.place} ~${brief.landfall.hoursAfterIssue} h after issue at ~${brief.landfall.vmaxKt} kt; landfall position uncertainty ~${brief.landfallSpreadKm} km. Peak modelled coastal water level ${brief.summary.peakTwlM} m near ${brief.summary.peakTwlPlace}.`
      : `${brief.storm.name}: no landfall in the forecast window.`,
    imageObservations: "",
    damagePathwaysNarrative: brief.districts
      .slice(0, 3)
      .map((d) => `${d.name}: ${d.dominantPathway}`)
      .join("; "),
    uncertaintyNotes: `Parametric models; ${brief.scenario.members}-member ensemble at ${brief.scenario.leadHours} h lead.`,
    advisories,
    warnings: [],
  };
}
