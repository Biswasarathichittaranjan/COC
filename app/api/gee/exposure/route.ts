import { exposureStats, geeConfigured, type CoastLevel } from "@/lib/integrations/gee";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!geeConfigured()) return Response.json({ error: "Earth Engine is not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const coast = (Array.isArray(body.coast) ? body.coast : []) as CoastLevel[];
  if (!coast.length) return Response.json({ error: "No coastal water levels above threshold" }, { status: 400 });
  try {
    return Response.json(await exposureStats(coast));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
