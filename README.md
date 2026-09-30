# Landfall: anticipatory cyclone risk for the Bay of Bengal

Landfall is a Next.js prototype that moves cyclone response from post-landfall recovery toward
pre-landfall action. It runs an ensemble of forecast tracks and turns them into four kinds of output:

- **Hazards**: wind swath, storm surge along ~1,000 coastal nodes, inland inundation, and rainfall.
- **Exposure**: district alert levels, plus the probability that each hospital, shelter, substation, power plant, port and arterial road loses function.
- **Damage pathways**: for example extreme rain → compound flooding → road disruption → shelter access loss.
- **Triggers and advisories**: anticipatory-action stages, parametric-insurance liquidity needs, and early-warning advisories for each authority. Gemini drafts the advisories, a person approves them, and they are exported as CAP 1.2.

> Decision-support prototype. Official warnings from IMD, BMD and DMH take precedence.

## Quick start

Requires Node 20.9+.

```bash
npm install          # also copies MapLibre's worker into public/maplibre
cp .env.example .env.local   # optional: add Earth Engine / Gemini credentials
npm run dev          # http://localhost:3000
```

With no keys set, the app still runs. It uses the parametric models, seed data, live GDACS tracks,
Open-Meteo forecasts, and rule-based advisories. The status pills in the header show which
integrations are connected.

| Variable | Purpose |
| --- | --- |
| `GEE_SERVICE_ACCOUNT_KEY_FILE` or `GEE_SERVICE_ACCOUNT_KEY`, and `GEE_PROJECT` | Earth Engine service account: inundation tiles, IMERG/GFS/WorldPop layers, NASADEM elevations, population exposure, imagery sent to Gemini |
| `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.7-flash`) | Multimodal advisory drafting and "ask the duty officer" Q&A |
| `DISPATCH_MODE=live` and `DISPATCH_WEBHOOK_URL` | POST approved advisories to a webhook. The default is dry-run, which only writes to `.data/outbox.json` |

## Workflow

1. **Pick a storm.** Options are a live or recent North Indian Ocean cyclone from GDACS, a historical replay
   (Amphan, Fani, Sidr, Nargis, Mocha, Remal, 1999 Odisha), or a synthetic cyclone designed by clicking a
   landfall point on the map.
2. **Set the forecast.** Choose the lead time (T-96h to T-6h), ensemble size and tide phase. Optionally adjust
   intensity, track shift, forward speed and storm size for what-if runs.
3. **Run.** A 50-member ensemble takes about 1.5–2 s on the server. The timeline animates the control track
   and its 34/50/64 kt wind radii.
4. **Review the tabs.**
   - *Overview*: KPIs and a district risk table.
   - *Infrastructure*: asset fragility.
   - *Pathways*: the hazard → mechanism → impact graph for each district.
   - *Triggers*: anticipatory-action stages and parametric covers.
   - *Advisories*: Gemini drafts, human edits and approval, CAP export, and dispatch.

## Architecture

```
app/api/
  simulate          ensemble run (+ NASADEM elevation sampling, + Open-Meteo blending for live storms)
  storms[/id]       historical catalogue + GDACS live list / track timeline
  gee/layers        Earth Engine XYZ tiles: surge inundation, GPM IMERG 72h, GFS rain/wind 72h, WorldPop, LECZ
  gee/exposure      WorldPop population inside >=0.5 m P90 inundation (reduceRegion)
  advisory          Gemini multimodal drafting (map snapshot + EE composite + JSON brief) -> structured JSON
  ask               grounded Q&A over the briefing
  dispatch          human-approved advisories -> CAP 1.2 -> outbox / webhook
  infrastructure    OpenStreetMap facilities around landfall (Overpass, mirrored)
lib/
  models/wind.ts       Holland (1980) wind/pressure profile with translation asymmetry
  models/surge.ts      shelf-integrated wind set-up + inverse barometer + wave set-up, 2 h relaxation
  models/rainfall.ts   R-CLIPER (Tuleya et al. 2007) with orographic and NIO moisture factors
  models/ensemble.ts   cross-track / timing / intensity / size perturbations growing with lead time
  models/track.ts      hourly interpolation, landfall detection, Kaplan-DeMaria inland decay
  models/impacts.ts    lognormal fragility curves, damage-pathway graph, alert levels, AA stages
  simulate.ts          orchestration -> SimResult
  data/                coastline + shelf parameters, districts/authorities, infrastructure, storms, covers
  integrations/        gee, gemini, gdacs, openmeteo, osm
components/            MapLibre map, scenario controls, analysis panels
```

## Model calibration

`npm run calibrate` runs each historical control track through the surge model:

| Storm | Modelled peak (m) | Reported (m) |
| --- | --- | --- |
| Amphan 2020 | 3.3 | 2.5–5 |
| Fani 2019 | 1.7 | 1.2–2 |
| Sidr 2007 | 4.3 | 4.5–6 |
| Nargis 2008 | 4.2 | 3.5–5 |
| Mocha 2023 | 2.2 | 2.5–4 |
| Remal 2024 | 2.5 | 1.5–2.5 |
| Odisha 1999 | 4.0 | 5–7 (under-predicted) |

Six of the seven storms fall within ±20% of the reported ranges. The model under-predicts extreme,
slow-moving events such as the 1999 Odisha cyclone, because it has no coastally trapped wave or estuary dynamics.

## Known limitations

- The hazard models are parametric screening models, not ADCIRC/SLOSH hydrodynamics. Inundation is a
  bathtub model with overland attenuation and ignores hydraulic connectivity and embankment failure.
- Infrastructure locations, district vulnerability and drainage values are approximate seed data.
  Replace them with authoritative registries. The OSM loader can add real facilities around landfall.
- The historical tracks are approximate reconstructions. The parametric covers are illustrative, not real policies.
- Gemini output is a draft for human review. Dispatch requires explicit approval, and CAP `status` is
  `Exercise` or `Test` unless `CAP_ALLOW_ACTUAL=true`.
