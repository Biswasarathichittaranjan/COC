import { buildLayers, geeConfigured, type CoastLevel, type LayerKind } from "@/lib/integrations/gee";

export const maxDuration = 60;

const KINDS: LayerKind[] = ["inundation", "imerg72", "gfsRain72", "gfsWind72", "population", "lecz"];

export async function POST(req: Request) {
  if (!geeConfigured()) return Response.json({ error: "Earth Engine is not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const kinds = (Array.isArray(body.kinds) ? body.kinds : []).filter((k: string) => KINDS.includes(k as LayerKind)) as LayerKind[];
  const coast = (Array.isArray(body.coast) ? body.coast : []) as CoastLevel[];
  try {
    return Response.json(await buildLayers(kinds, coast));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
