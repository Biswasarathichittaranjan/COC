import { fetchOsmAssets } from "@/lib/integrations/osm";

export const maxDuration = 90;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { south, west, north, east } = body.bbox ?? {};
  if (![south, west, north, east].every((v) => Number.isFinite(v))) return Response.json({ error: "bbox required" }, { status: 400 });
  if (north - south > 4 || east - west > 4) return Response.json({ error: "bbox too large (max 4 x 4 degrees)" }, { status: 400 });
  try {
    return Response.json({ assets: await fetchOsmAssets({ south, west, north, east }) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
